import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { MfaService } from '@/core/contracts/mfa';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { StepUpProvider } from '@/shared/components/step-up/StepUpProvider';
import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { buildBootstrapRedirectUrl } from '@/app/auth/post-auth-redirect';
import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'admin-guard',
});

/**
 * Where an administrator without a second factor is sent (SEC-48).
 *
 * Administrative access requires MFA enrollment. This is checked *after* the
 * admin grant is established, not before and not instead: enrollment is an
 * authentication-assurance requirement placed on people who hold
 * administrative authority, so the authority has to be known first. It is
 * also deliberately not asked at sign-in -- the credentials provider must
 * never resolve roles (see `authorize()` and SEC-48).
 *
 * The same requirement is enforced independently at every admin API mutation
 * (`withAdminStepUp`), because a layout guard protects pages, not endpoints.
 */
const MFA_ENROLLMENT_REDIRECT = '/account/security/mfa?reason=admin';

async function requireMfaEnrollment(
  container: ReturnType<typeof getAppContainer>,
  userId: string,
  correlationId: string | undefined,
): Promise<void> {
  const rawIdentity = await container
    .resolve<RequestIdentitySource>(AUTH.IDENTITY_SOURCE)
    .get();
  const mfaService = container.resolve<MfaService>(AUTH.MFA_SERVICE);

  const status = await mfaService.getStatus({
    userId,
    externalUserId: rawIdentity.userId,
  });

  if (status.enrolled) return;

  logger.warn(
    {
      event: 'admin_guard:mfa_enrollment_required',
      correlationId,
      userId,
      enrollmentSurface: status.enrollmentSurface,
    },
    'Admin access deferred — administrator has no second factor enrolled',
  );
  redirect(MFA_ENROLLMENT_REDIRECT);
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AdminLayoutGuard>{children}</AdminLayoutGuard>
    </Suspense>
  );
}

export async function AdminLayoutGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();

  const requestContext = await getServerRequestLogContext({
    pathname: '/admin',
  });

  const container = getAppContainer();

  let access;
  try {
    access = await resolveNodeProvisioningAccess(container);
  } catch (err) {
    logger.error(
      {
        event: 'admin_guard:provisioning_error',
        correlationId: requestContext.correlationId,
        pathname: '/admin',
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : 'UnknownError',
      },
      'Admin guard failed while resolving provisioning access',
    );
    throw err;
  }

  if (access.status === 'UNAUTHENTICATED') {
    redirect('/auth/signin?redirect_url=/admin');
  }

  if (
    access.status === 'BOOTSTRAP_REQUIRED' ||
    access.status === 'ONBOARDING_REQUIRED'
  ) {
    redirect(buildBootstrapRedirectUrl('/admin'));
  }

  if (access.status !== 'ALLOWED') {
    redirect('/');
  }

  const userEmail = access.identity.email;

  if (isEnvBasedPlatformAdmin(userEmail)) {
    logger.info(
      {
        event: 'admin_guard:access_allowed_env',
        correlationId: requestContext.correlationId,
        userId: access.user.id,
        adminSource: 'ADMIN_USER_EMAILS',
      },
      'Admin access granted via ADMIN_USER_EMAILS env var (bootstrap mode)',
    );
    await recordAdminAuditEvent({
      category: 'admin_access',
      action: 'admin_panel.access_granted',
      outcome: 'success',
      tenantId: access.tenant.tenantId,
      actorUserId: access.user.id,
      targetType: 'admin_panel',
      targetId: 'admin-panel',
      metadata: { source: 'env' },
    });
    await requireMfaEnrollment(
      container,
      access.user.id,
      requestContext.correlationId,
    );
    return <AdminLayoutShell>{children}</AdminLayoutShell>;
  }

  let isAdmin = false;
  try {
    const authService = container.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    );
    isAdmin = await authService.can({
      tenant: { tenantId: access.tenant.tenantId },
      subject: { id: access.user.id },
      resource: { type: RESOURCES.SECURITY, id: 'admin-panel' },
      action: ACTIONS.SECURITY_MANAGE_POLICIES,
    });
  } catch (err) {
    logger.warn(
      {
        event: 'admin_guard:abac_check_failed',
        correlationId: requestContext.correlationId,
        userId: access.user.id,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : 'UnknownError',
      },
      'Admin ABAC check failed — denying access',
    );
    redirect('/');
  }

  if (!isAdmin) {
    logger.info(
      {
        event: 'admin_guard:access_denied',
        correlationId: requestContext.correlationId,
        userId: access.user.id,
      },
      'Admin access denied — user lacks SECURITY_MANAGE_POLICIES permission and is not in ADMIN_USER_EMAILS',
    );
    await recordAdminAuditEvent({
      category: 'admin_access',
      action: 'admin_panel.access_denied',
      outcome: 'denied',
      tenantId: access.tenant.tenantId,
      actorUserId: access.user.id,
      targetType: 'admin_panel',
      targetId: 'admin-panel',
    });
    redirect('/');
  }

  logger.info(
    {
      event: 'admin_guard:access_allowed_abac',
      correlationId: requestContext.correlationId,
      userId: access.user.id,
      adminSource: 'abac',
    },
    'Admin access granted via ABAC SECURITY_MANAGE_POLICIES',
  );

  await recordAdminAuditEvent({
    category: 'admin_access',
    action: 'admin_panel.access_granted',
    outcome: 'success',
    tenantId: access.tenant.tenantId,
    actorUserId: access.user.id,
    targetType: 'admin_panel',
    targetId: 'admin-panel',
    metadata: { source: 'abac' },
  });

  await requireMfaEnrollment(
    container,
    access.user.id,
    requestContext.correlationId,
  );

  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}

function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    // Every admin mutation can come back asking for a fresh step-up
    // (SEC-48); the provider turns that refusal into one prompt and one
    // retry, in one place, instead of nine clients each inventing a flow.
    <StepUpProvider>
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Link
                href="/"
                className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Home
              </Link>
              <span>/</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Administration
              </span>
            </div>
          </div>
        </div>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </StepUpProvider>
  );
}
