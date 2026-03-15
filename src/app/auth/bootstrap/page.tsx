import { redirect } from 'next/navigation';

import { AUTH, PROVISIONING } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { PGliteWasmAbortError } from '@/core/db/drivers/create-pglite';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  getOrCreateActivityState,
  getRuntimeDiagnosticState,
} from '@/shared/lib/observability/runtime-diagnostic-state';
import { getServerRequestLogContext } from '@/shared/lib/observability/server-request-log-context';
import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

import { buildProvisioningInput } from '../build-provisioning-input';

import { BootstrapErrorUI } from './bootstrap-error';
import { BootstrapOrgRequired } from './bootstrap-org-required';

import type { ProvisioningService } from '@/modules/provisioning';
import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'bootstrap',
});

export default async function BootstrapPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; reason?: string }>;
}) {
  const { redirect_url, reason } = await searchParams;
  const safeTarget = sanitizeRedirectUrl(redirect_url ?? '', '/users');
  const requestContext = await getServerRequestLogContext({
    pathname: '/auth/bootstrap',
  });
  const diagnostics = getRuntimeDiagnosticState();

  const container = getAppContainer();

  const identitySource = container.resolve<RequestIdentitySource>(
    AUTH.IDENTITY_SOURCE,
  );
  const rawIdentity = await identitySource.get();
  const bootstrapKey = rawIdentity.userId ?? requestContext.correlationId;
  const bootstrapState = getOrCreateActivityState(
    diagnostics.bootstrapEntries,
    bootstrapKey,
  );

  bootstrapState.totalStarts += 1;
  bootstrapState.activeCount += 1;
  bootstrapState.lastStartedAt = Date.now();

  try {
    logger.info(
      {
        event: 'bootstrap:entry',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        pathname: '/auth/bootstrap',
        authenticatedExternalUserId: rawIdentity.userId,
        internalIdentityId: undefined,
        redirectUrl: redirect_url,
        safeTarget,
        bootstrapEntryReason:
          reason ?? (redirect_url ? 'redirect_target_present' : 'direct_entry'),
        arrivedFromUsersGuard:
          redirect_url === '/users' ||
          reason === 'tenant-lost' ||
          reason === 'db-error',
        attemptInProcess: bootstrapState.totalStarts,
        activeAttemptCount: bootstrapState.activeCount,
        isRetryWithinProcess: bootstrapState.totalStarts > 1,
        referer: requestContext.referer,
      },
      'Bootstrap route entered',
    );

    if (!rawIdentity.userId) {
      logger.warn(
        {
          event: 'bootstrap:redirect',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          pathname: '/auth/bootstrap',
          decision: 'redirect:/sign-in',
          reason: 'unauthenticated',
        },
        'Bootstrap reached without authenticated identity',
      );
      redirect('/sign-in');
    }

    if (
      env.TENANCY_MODE === 'org' &&
      env.TENANT_CONTEXT_SOURCE === 'provider' &&
      !rawIdentity.tenantExternalId
    ) {
      return <BootstrapOrgRequired />;
    }

    const provisioningService = container.resolve<ProvisioningService>(
      PROVISIONING.SERVICE,
    );
    const provisioningInput = await buildProvisioningInput(rawIdentity);

    let internalUserId: string;

    try {
      const result =
        await provisioningService.ensureProvisioned(provisioningInput);

      logger.info(
        {
          event: 'provisioning:ensure',
          status: 'success',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          provider: env.AUTH_PROVIDER,
          tenancyMode: env.TENANCY_MODE,
          externalUserId: rawIdentity.userId,
          redirectUrl: redirect_url,
          internalUserId: result.internalUserId,
          internalTenantId: result.internalTenantId,
          membershipRole: result.membershipRole,
          userCreatedNow: result.userCreatedNow,
          tenantCreatedNow: result.tenantCreatedNow,
        },
        'provisioning:ensure succeeded',
      );

      internalUserId = result.internalUserId;
    } catch (err) {
      logger.error(
        {
          event: 'provisioning:ensure',
          status: 'failure',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          provider: env.AUTH_PROVIDER,
          tenancyMode: env.TENANCY_MODE,
          externalUserId: rawIdentity.userId,
          redirectUrl: redirect_url,
          err,
        },
        'provisioning:ensure failed during bootstrap',
      );

      if (err instanceof CrossProviderLinkingNotAllowedError) {
        return <BootstrapErrorUI error="cross_provider_linking" />;
      }

      if (err instanceof TenantUserLimitReachedError) {
        return <BootstrapErrorUI error="quota_exceeded" />;
      }

      if (err instanceof TenantContextRequiredError) {
        return <BootstrapErrorUI error="tenant_config" />;
      }

      if (
        err instanceof PGliteWasmAbortError ||
        (err instanceof Error &&
          (err.constructor?.name === 'RuntimeError' ||
            /aborted\(\)/i.test(err.message) ||
            (err as NodeJS.ErrnoException).code === 'ENOENT' ||
            (err as NodeJS.ErrnoException).code === 'EPERM' ||
            (err as NodeJS.ErrnoException).code === 'EACCES'))
      ) {
        return <BootstrapErrorUI error="db_error" />;
      }

      throw err;
    }

    const userRepository = container.resolve<UserRepository>(
      AUTH.USER_REPOSITORY,
    );

    let user;
    try {
      user = await userRepository.findById(internalUserId);
    } catch (err) {
      logger.error(
        {
          event: 'provisioning:bootstrap',
          status: 'db_error',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          internalUserId,
          err,
        },
        'Bootstrap: userRepository.findById threw after successful provisioning',
      );
      return <BootstrapErrorUI error="db_error" />;
    }

    if (!user) {
      logger.error(
        {
          event: 'provisioning:bootstrap',
          status: 'invariant_violated',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          internalUserId,
        },
        'Bootstrap invariant violated: provisioning succeeded but user record is missing',
      );
      return <BootstrapErrorUI error="db_error" />;
    }

    if (!user.onboardingComplete) {
      logger.info(
        {
          event: 'bootstrap:redirect',
          correlationId: requestContext.correlationId,
          requestId: requestContext.requestId,
          pathname: '/auth/bootstrap',
          authenticatedExternalUserId: rawIdentity.userId,
          internalIdentityId: internalUserId,
          redirectUrl: redirect_url,
          safeTarget,
          decision: 'redirect:/onboarding',
          reason: 'missing_onboarding_state',
        },
        'Bootstrap redirected to onboarding after successful provisioning',
      );
      redirect(`/onboarding?redirect_url=${encodeURIComponent(safeTarget)}`);
    }

    logger.info(
      {
        event: 'bootstrap:redirect',
        correlationId: requestContext.correlationId,
        requestId: requestContext.requestId,
        pathname: '/auth/bootstrap',
        authenticatedExternalUserId: rawIdentity.userId,
        internalIdentityId: internalUserId,
        redirectUrl: redirect_url,
        safeTarget,
        decision: `redirect:${safeTarget}`,
        reason: 'already_ready',
      },
      'Bootstrap redirected to the stable post-provisioning target',
    );

    redirect(safeTarget);
  } finally {
    bootstrapState.activeCount = Math.max(0, bootstrapState.activeCount - 1);
    bootstrapState.lastFinishedAt = Date.now();
  }
}
