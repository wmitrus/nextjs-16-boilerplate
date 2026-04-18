import { AUTH, PROVISIONING } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { buildProvisioningInput } from '../build-provisioning-input';

import type { ProvisioningService } from '@/modules/provisioning';
import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning';

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
    if (err instanceof CrossProviderLinkingNotAllowedError) {
      return { type: 'error', error: 'cross_provider_linking' };
    }

    if (err instanceof TenantUserLimitReachedError) {
      return { type: 'error', error: 'quota_exceeded' };
    }

    if (err instanceof TenantContextRequiredError) {
      return { type: 'error', error: 'tenant_config' };
    }

    return { type: 'error', error: 'db_error' };
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  let user;
  try {
    user = await userRepository.findById(internalUserId);
  } catch {
    return { type: 'error', error: 'db_error' };
  }

  if (!user) {
    return { type: 'error', error: 'db_error' };
  }

  if (!user.onboardingComplete) {
    return { type: 'onboarding_required', safeTarget };
  }

  return { type: 'ready', safeTarget };
}
