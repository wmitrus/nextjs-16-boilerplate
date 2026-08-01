import { AUTH, PROVISIONING } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { buildProvisioningInput } from '../build-provisioning-input';

import type { ProvisioningService } from '@/modules/provisioning';
import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'bootstrap_outcome',
});

export type BootstrapError =
  | 'cross_provider_linking'
  | 'quota_exceeded'
  | 'tenant_config'
  | 'db_error';

export type BootstrapOutcome =
  | { type: 'unauthenticated' }
  | { type: 'org_required' }
  | { type: 'onboarding_required'; safeTarget: string }
  | { type: 'ready'; safeTarget: string }
  | { type: 'error'; error: BootstrapError };

export async function resolveBootstrapOutcome(
  safeTarget: string,
): Promise<BootstrapOutcome> {
  const container = getAppContainer();

  const identitySource = container.resolve<RequestIdentitySource>(
    AUTH.IDENTITY_SOURCE,
  );
  const rawIdentity = await identitySource.get();

  if (!rawIdentity.userId) {
    return { type: 'unauthenticated' };
  }

  if (
    env.TENANCY_MODE === 'org' &&
    env.TENANT_CONTEXT_SOURCE === 'provider' &&
    !rawIdentity.orgExternalId
  ) {
    return { type: 'org_required' };
  }

  const provisioningService = container.resolve<ProvisioningService>(
    PROVISIONING.SERVICE,
  );
  const provisioningInput = await buildProvisioningInput(rawIdentity);

  let internalUserId: string;

  try {
    const result =
      await provisioningService.ensureProvisioned(provisioningInput);
    internalUserId = result.internalUserId;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const logContext = {
      event: 'bootstrap_outcome:provisioning_error',
      provider: provisioningInput.provider,
      hasExternalUserId: Boolean(provisioningInput.externalUserId),
      hasEmail: Boolean(provisioningInput.email),
      emailVerified: provisioningInput.emailVerified,
      tenancyMode: provisioningInput.tenancyMode,
      tenantContextSource: provisioningInput.tenantContextSource,
      hasActiveTenantId: Boolean(provisioningInput.activeTenantId),
      hasOrgExternalId: Boolean(provisioningInput.orgExternalId),
      errorName: error.name,
      errorMessage: error.message,
    };

    if (err instanceof CrossProviderLinkingNotAllowedError) {
      logger.warn(
        logContext,
        'Bootstrap provisioning failed because cross-provider email linking is not allowed',
      );
      return { type: 'error', error: 'cross_provider_linking' };
    }

    if (err instanceof TenantUserLimitReachedError) {
      logger.warn(
        logContext,
        'Bootstrap provisioning failed because tenant user quota is exceeded',
      );
      return { type: 'error', error: 'quota_exceeded' };
    }

    if (err instanceof TenantContextRequiredError) {
      logger.warn(
        logContext,
        'Bootstrap provisioning failed because tenant context is missing',
      );
      return { type: 'error', error: 'tenant_config' };
    }

    logger.error(
      logContext,
      'Bootstrap provisioning failed with an unexpected error',
    );
    return { type: 'error', error: 'db_error' };
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  let user;
  try {
    user = await userRepository.findById(internalUserId);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        event: 'bootstrap_outcome:user_lookup_error',
        hasInternalUserId: Boolean(internalUserId),
        errorName: error.name,
        errorMessage: error.message,
      },
      'Bootstrap user lookup failed after provisioning',
    );
    return { type: 'error', error: 'db_error' };
  }

  if (!user) {
    logger.error(
      {
        event: 'bootstrap_outcome:user_missing_after_provisioning',
        hasInternalUserId: Boolean(internalUserId),
      },
      'Bootstrap provisioning returned an internal user id but the user row was not found',
    );
    return { type: 'error', error: 'db_error' };
  }

  if (!user.onboardingComplete) {
    return { type: 'onboarding_required', safeTarget };
  }

  return { type: 'ready', safeTarget };
}
