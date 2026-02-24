'use server';

import { container } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type {
  IdentityProvider,
  UserRepository,
} from '@/core/contracts/identity';
import { logger as baseLogger } from '@/core/logger/server';

const logger = baseLogger.child({
  type: 'API',
  category: 'onboarding',
  module: 'onboarding-actions',
});

export const completeOnboarding = async (formData: FormData) => {
  const identityProvider = container.resolve<IdentityProvider>(
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

  const userRepository = container.resolve<UserRepository>(
    AUTH.USER_REPOSITORY,
  );

  try {
    await userRepository.updateAttributes(identity.id, {
      onboardingComplete: true,
      targetLanguage,
      proficiencyLevel,
      learningGoal,
    });
    logger.debug(
      { userId: identity.id },
      'User metadata updated successfully for onboarding',
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
