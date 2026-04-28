import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';

import { buildBootstrapRedirectUrl } from '../auth/post-auth-redirect';

import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'dashboard-guard',
});

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <DashboardLayoutGuard>{children}</DashboardLayoutGuard>
    </Suspense>
  );
}

export async function DashboardLayoutGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestContext = await getServerRequestLogContext({
    pathname: '/dashboard',
  });

  let access;
  try {
    access = await resolveNodeProvisioningAccess(getAppContainer());
  } catch (err) {
    logger.error(
      {
        event: 'dashboard_guard:decision',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        pathname: '/dashboard',
        decision: 'redirect:/auth/bootstrap',
        reason: 'unsupported_state',
        err,
      },
      'Dashboard guard failed while resolving provisioning access and redirected to bootstrap recovery route',
    );
    redirect('/auth/bootstrap?reason=db-error');
  }

  const decision =
    access.status === 'ALLOWED'
      ? 'stay:/dashboard'
      : access.status === 'ONBOARDING_REQUIRED'
        ? 'redirect:/onboarding'
        : access.status === 'UNAUTHENTICATED'
          ? 'redirect:/auth/signin'
          : access.status === 'BOOTSTRAP_REQUIRED'
            ? 'redirect:/auth/bootstrap/start'
            : access.status === 'TENANT_CONTEXT_REQUIRED'
              ? 'redirect:/auth/bootstrap'
              : 'redirect:/';

  logger.info(
    {
      event: 'dashboard_guard:decision',
      correlationId: requestContext.correlationId,
      requestId: requestContext.requestId,
      pathname: '/dashboard',
      authenticatedExternalUserId: access.diagnostics.externalUserId,
      internalIdentityId: access.diagnostics.internalIdentityId,
      internalOrganizationId: access.diagnostics.internalOrganizationId,
      tenancyMode: access.diagnostics.tenancyMode,
      userRecordExists: access.diagnostics.userRecordExists,
      tenantRecordExists: access.diagnostics.tenantRecordExists,
      membershipExists: access.diagnostics.membershipExists,
      onboardingStateExists: access.diagnostics.onboardingStateExists,
      onboardingComplete: access.diagnostics.onboardingComplete,
      provisioningRequired: access.diagnostics.provisioningRequired,
      decision,
      reason: access.diagnostics.reason,
      status: access.status,
      code: 'code' in access ? access.code : undefined,
    },
    'Dashboard guard evaluated authenticated landing decision',
  );

  if (access.status === 'UNAUTHENTICATED') {
    redirect('/auth/signin?redirect_url=/dashboard');
  }

  if (access.status === 'BOOTSTRAP_REQUIRED') {
    redirect(buildBootstrapRedirectUrl());
  }

  if (access.status === 'ONBOARDING_REQUIRED') {
    redirect('/onboarding');
  }

  if (access.status === 'TENANT_CONTEXT_REQUIRED') {
    redirect('/auth/bootstrap?reason=tenant-lost');
  }

  if (
    access.status === 'TENANT_MEMBERSHIP_REQUIRED' ||
    access.status === 'FORBIDDEN'
  ) {
    redirect('/');
  }

  return children;
}
