'use server';

import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { resolveServerLogger } from '@/core/logger/di';
import { appContainer } from '@/core/runtime/bootstrap';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'onboarding',
  module: 'onboarding-actions',
});

export const completeOnboarding = async (formData: FormData) => {
  const identityProvider = appContainer.resolve<IdentityProvider>(
    AUTH.IDENTITY_PROVIDER,
  );
  const identity = await identityProvider.getCurrentIdentity();

  if (!identity) {
    logger.warn('Onboarding attempt without identity');
    return { error: 'No logged in user' };
  }

  const targetLanguage = formData.get('targetLanguage');
  const proficiencyLevel = formData.get('proficiencyLevel');
  const learningGoal = formData.get('learningGoal');

  logger.debug(
    { userId: identity.id, targetLanguage, proficiencyLevel, learningGoal },
    'Onboarding form submission',
  );

  if (!targetLanguage || !proficiencyLevel || !learningGoal) {
    logger.warn(
      { userId: identity.id },
      'Missing required fields in onboarding',
    );
    return { error: 'Missing required fields' };
  }

  const userRepository = appContainer.resolve<UserRepository>(
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
