'use server';

import { AUTH, PROVISIONING } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import type { ProvisioningService } from '@/modules/provisioning/domain/ProvisioningService';

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

  let provisioningResult;
  try {
    provisioningResult = await provisioningService.ensureProvisioned({
      provider: env.AUTH_PROVIDER,
      externalUserId: rawIdentity.userId,
      email: rawIdentity.email,
      emailVerified: rawIdentity.emailVerified,
      tenantExternalId: rawIdentity.tenantExternalId,
      tenantRole: rawIdentity.tenantRole,
      activeTenantId: env.DEFAULT_TENANT_ID,
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
