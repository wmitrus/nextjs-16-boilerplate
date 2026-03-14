'use server';

import { redirect } from 'next/navigation';

import { AUTH, PROVISIONING } from '@/core/contracts';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

import { buildProvisioningInput } from '../auth/build-provisioning-input';

import {
  CrossProviderLinkingNotAllowedError,
  TenantContextRequiredError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning';
import type { ProvisioningService } from '@/modules/provisioning';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'onboarding',
  module: 'onboarding-actions',
});

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

  const provisioningInput = await buildProvisioningInput(rawIdentity);

  let provisioningResult;
  try {
    provisioningResult =
      await provisioningService.ensureProvisioned(provisioningInput);

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

  const displayName = formData.get('displayName');
  const locale = formData.get('locale');
  const timezone = formData.get('timezone');
  const rawRedirectUrl = formData.get('redirect_url');

  logger.debug(
    {
      userId: provisioningResult.internalUserId,
      displayName,
      locale,
      timezone,
    },
    'Onboarding form submission',
  );

  if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
    logger.warn(
      { userId: provisioningResult.internalUserId },
      'Missing required displayName in onboarding',
    );
    return { error: 'Display name is required' };
  }

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  const safeRedirectUrl = sanitizeRedirectUrl(
    typeof rawRedirectUrl === 'string' ? rawRedirectUrl : '',
    '/users',
  );

  const internalUserId = provisioningResult.internalUserId;
  const existingUser = await userRepository.findById(internalUserId);
  if (!existingUser) {
    logger.error(
      { userId: internalUserId },
      'Onboarding invariant violated: provisioned user not found in database',
    );
    throw new Error(
      'Onboarding invariant violated: provisioned user not found in database',
    );
  }

  try {
    await userRepository.updateProfile(internalUserId, {
      displayName: displayName.trim(),
      locale: typeof locale === 'string' && locale ? locale : undefined,
      timezone: typeof timezone === 'string' && timezone ? timezone : undefined,
    });
    await userRepository.updateOnboardingStatus(internalUserId, true);
    logger.debug(
      { userId: internalUserId },
      'User profile and onboarding status updated successfully',
    );
  } catch (err) {
    logger.error(
      { err, userId: internalUserId },
      'Error updating user metadata during onboarding',
    );
    return { error: 'There was an error updating your profile.' };
  }

  redirect(safeRedirectUrl);
};
