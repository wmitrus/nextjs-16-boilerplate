import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';
import { getSignInPath } from '@/shared/lib/routing/auth-entry';

import { resolveNodeProvisioningAccess } from '@/security/core/node-provisioning-runtime';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'users-guard',
});

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <UsersLayoutGuard>{children}</UsersLayoutGuard>
    </Suspense>
  );
}

export async function UsersLayoutGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestContext = await getServerRequestLogContext({
    pathname: '/users',
  });

  let access;
  try {
    access = await resolveNodeProvisioningAccess(getAppContainer());
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        event: 'users_guard:decision',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        pathname: '/users',
        tenancyMode: 'unknown',
        userRecordExists: null,
        tenantRecordExists: null,
        membershipExists: null,
        onboardingStateExists: null,
        provisioningRequired: true,
        decision: 'redirect:/auth/bootstrap',
        reason: 'unsupported_state',
        errorMessage: error.message,
        errorName: error.name,
      },
      'Users guard failed while resolving provisioning access and redirected to bootstrap recovery route',
    );
    redirect('/auth/bootstrap?reason=db-error');
  }

  const decision =
    access.status === 'ALLOWED'
      ? 'stay:/users'
      : access.status === 'ONBOARDING_REQUIRED'
        ? 'redirect:/onboarding'
        : access.status === 'UNAUTHENTICATED'
          ? `redirect:${getSignInPath()}`
          : access.status === 'BOOTSTRAP_REQUIRED'
            ? 'redirect:/auth/bootstrap/start'
            : access.status === 'TENANT_CONTEXT_REQUIRED'
              ? 'redirect:/auth/bootstrap'
              : 'redirect:/';

  logger.info(
    {
      event: 'users_guard:decision',
      correlationId: requestContext.correlationId,
      requestId: requestContext.requestId,
      pathname: '/users',
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
    'Users guard evaluated post-auth landing decision',
  );

  if (access.status === 'UNAUTHENTICATED') {
    redirect(`${getSignInPath()}?redirect_url=/users`);
  }

  if (access.status === 'BOOTSTRAP_REQUIRED') {
    redirect('/auth/bootstrap/start?redirect_url=/users');
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
