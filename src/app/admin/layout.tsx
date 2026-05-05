import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { buildBootstrapRedirectUrl } from '@/app/auth/post-auth-redirect';
import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'admin-guard',
});

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

  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}

function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
