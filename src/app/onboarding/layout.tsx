import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import { UserNotProvisionedError } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';
import { getSignInPath } from '@/shared/lib/routing/auth-entry';

import {
  buildBootstrapRedirectUrl,
  DEFAULT_APP_ENTRY_URL,
} from '../auth/post-auth-redirect';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'onboarding-guard',
});

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <OnboardingGuard>{children}</OnboardingGuard>
    </Suspense>
  );
}

export async function OnboardingGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestContext = await getServerRequestLogContext({
    pathname: '/onboarding',
  });

  const container = getAppContainer();

  const identityProvider = container.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );

  logger.debug(
    {
      event: 'onboarding_guard:entry',
      correlationId: requestContext.correlationId,
      requestId: requestContext.requestId,
    },
    'OnboardingGuard: identity lookup start',
  );

  let identity;
  try {
    identity = await identityProvider.getCurrentIdentity();
  } catch (err) {
    if (err instanceof UserNotProvisionedError) {
      logger.warn(
        {
          event: 'onboarding_guard:identity_lookup',
          status: 'not_provisioned',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          decision: 'redirect:/auth/bootstrap/start',
        },
        'OnboardingGuard: identity not provisioned, redirecting to bootstrap',
      );
      redirect(buildBootstrapRedirectUrl());
    }
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        event: 'onboarding_guard:identity_lookup',
        status: 'error',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        decision: 'redirect:/auth/bootstrap',
        errorMessage: error.message,
        errorName: error.name,
      },
      'OnboardingGuard: identity lookup failed, redirecting to bootstrap',
    );
    redirect('/auth/bootstrap?reason=db-error');
  }

  if (!identity) {
    const signInPath = getSignInPath();
    logger.warn(
      {
        event: 'onboarding_guard:identity_lookup',
        status: 'no_identity',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        decision: `redirect:${signInPath}`,
      },
      'OnboardingGuard: no identity found, redirecting to sign-in',
    );
    redirect(signInPath);
  }

  logger.debug(
    {
      event: 'onboarding_guard:identity_lookup',
      status: 'success',
      correlationId: requestContext.correlationId,
      requestId: requestContext.requestId,
      internalIdentityId: identity.id,
    },
    'OnboardingGuard: identity resolved, starting user lookup',
  );

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  let user;
  try {
    user = await userRepository.findById(identity.id);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        event: 'onboarding_guard:user_lookup',
        status: 'error',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        internalIdentityId: identity.id,
        decision: 'redirect:/auth/bootstrap',
        errorMessage: error.message,
        errorName: error.name,
      },
      'OnboardingGuard: user lookup failed, redirecting to bootstrap',
    );
    redirect('/auth/bootstrap?reason=db-error');
  }

  if (!user) {
    logger.warn(
      {
        event: 'onboarding_guard:user_lookup',
        status: 'not_found',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        internalIdentityId: identity.id,
        decision: 'redirect:/auth/bootstrap/start',
      },
      'OnboardingGuard: user not found after identity lookup, redirecting to bootstrap',
    );
    redirect(buildBootstrapRedirectUrl());
  }

  if (user.onboardingComplete) {
    logger.info(
      {
        event: 'onboarding_guard:decision',
        status: 'already_complete',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        internalIdentityId: identity.id,
        decision: `redirect:${DEFAULT_APP_ENTRY_URL}`,
      },
      'OnboardingGuard: onboarding already complete, redirecting to the authenticated app entry route',
    );
    redirect(DEFAULT_APP_ENTRY_URL);
  }

  logger.info(
    {
      event: 'onboarding_guard:decision',
      status: 'onboarding_required',
      correlationId: requestContext.correlationId,
      requestId: requestContext.requestId,
      internalIdentityId: identity.id,
      decision: 'render:onboarding',
    },
    'OnboardingGuard: onboarding required, rendering form',
  );

  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">{children}</div>
  );
}
