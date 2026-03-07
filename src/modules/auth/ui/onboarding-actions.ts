'use server';

import { cookies, headers } from 'next/headers';

import { AUTH, PROVISIONING } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning/domain/errors';
import type { ProvisioningService } from '@/modules/provisioning/domain/ProvisioningService';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'onboarding',
  module: 'onboarding-actions',
});

async function resolveActiveTenantIdForProvisioning(): Promise<
  string | undefined
> {
  if (env.TENANCY_MODE === 'single') {
    return env.DEFAULT_TENANT_ID;
  }

  if (env.TENANCY_MODE === 'org' && env.TENANT_CONTEXT_SOURCE === 'db') {
    const headerList = await headers();
    const headerTenantId = headerList.get(env.TENANT_CONTEXT_HEADER);
    if (headerTenantId) return headerTenantId;

    const cookieStore = await cookies();
    return cookieStore.get(env.TENANT_CONTEXT_COOKIE)?.value;
  }

  return undefined;
}

export const completeOnboarding = async (formData: FormData) => {
  const container = getAppContainer();

  const identitySource = container.resolve<RequestIdentitySource>(
    AUTH.IDENTITY_SOURCE,
  );

  const rawIdentity = await identitySource.get();

  if (!rawIdentity.userId) {
    logger.warn('Onboarding attempt without authenticated identity');
    return { error: 'No logged in user' };
  }

  const provisioningService = container.resolve<ProvisioningService>(
    PROVISIONING.SERVICE,
  );

  const activeTenantId = await resolveActiveTenantIdForProvisioning();

  let provisioningResult;
  try {
    provisioningResult = await provisioningService.ensureProvisioned({
      provider: env.AUTH_PROVIDER,
      externalUserId: rawIdentity.userId,
      email: rawIdentity.email,
      emailVerified: rawIdentity.emailVerified,
      tenantExternalId: rawIdentity.tenantExternalId,
      tenantRole: rawIdentity.tenantRole,
      activeTenantId,
      tenancyMode: env.TENANCY_MODE,
      tenantContextSource: env.TENANT_CONTEXT_SOURCE,
    });

    logger.info(
      {
        event: 'provisioning:ensure',
        status: 'success',
        provider: env.AUTH_PROVIDER,
        tenancyMode: env.TENANCY_MODE,
        internalUserId: provisioningResult.internalUserId,
        internalTenantId: provisioningResult.internalTenantId,
        membershipRole: provisioningResult.membershipRole,
        userCreatedNow: provisioningResult.userCreatedNow,
        tenantCreatedNow: provisioningResult.tenantCreatedNow,
      },
      'provisioning:ensure succeeded',
    );
  } catch (err) {
    logger.error(
      {
        event: 'provisioning:ensure',
        status: 'failure',
        provider: env.AUTH_PROVIDER,
        tenancyMode: env.TENANCY_MODE,
        err,
      },
      'provisioning:ensure failed — aborting onboarding',
    );

    if (err instanceof CrossProviderLinkingNotAllowedError) {
      return {
        error:
          'Account linking is blocked by security policy. Sign in with your original provider or contact support.',
      };
    }

    if (
      err instanceof TenantContextRequiredError ||
      err instanceof TenantNotProvisionedError
    ) {
      return {
        error:
          'Tenant context is invalid or missing. Verify tenancy configuration and try again.',
      };
    }

    if (err instanceof TenantUserLimitReachedError) {
      return {
        error:
          'This tenant reached the free-tier user limit. Upgrade the plan to add more users.',
      };
    }

    return { error: 'Provisioning failed. Please try again.' };
  }

  const targetLanguage = formData.get('targetLanguage');
  const proficiencyLevel = formData.get('proficiencyLevel');
  const learningGoal = formData.get('learningGoal');

  logger.debug(
    {
      userId: provisioningResult.internalUserId,
      targetLanguage,
      proficiencyLevel,
      learningGoal,
    },
    'Onboarding form submission',
  );

  if (!targetLanguage || !proficiencyLevel || !learningGoal) {
    logger.warn(
      { userId: provisioningResult.internalUserId },
      'Missing required fields in onboarding',
    );
    return { error: 'Missing required fields' };
  }

  const identityProvider = container.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );

  const identity = await identityProvider.getCurrentIdentity();

  if (!identity) {
    logger.warn('Identity not found after successful provisioning');
    return { error: 'No logged in user' };
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  try {
    await userRepository.updateProfile(identity.id, {
      targetLanguage: targetLanguage as string,
      proficiencyLevel: proficiencyLevel as string,
      learningGoal: learningGoal as string,
    });
    await userRepository.updateOnboardingStatus(identity.id, true);
    logger.debug(
      { userId: identity.id },
      'User profile and onboarding status updated successfully',
    );
    return { message: 'Onboarding completed' };
  } catch (err) {
    logger.error(
      { err, userId: identity.id },
      'Error updating user metadata during onboarding',
    );
    return { error: 'There was an error updating your profile.' };
  }
};
