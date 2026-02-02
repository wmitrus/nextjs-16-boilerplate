'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';

import { logger } from '@/core/logger/client';

export const completeOnboarding = async (formData: FormData) => {
  const { userId } = await auth();

  if (!userId) {
    logger.warn('Onboarding attempt without userId');
    return { error: 'No logged in user' };
  }

  const targetLanguage = formData.get('targetLanguage');
  const proficiencyLevel = formData.get('proficiencyLevel');
  const learningGoal = formData.get('learningGoal');

  logger.info(
    { userId, targetLanguage, proficiencyLevel, learningGoal },
    'Onboarding form submission',
  );

  if (!targetLanguage || !proficiencyLevel || !learningGoal) {
    logger.warn({ userId }, 'Missing required fields in onboarding');
    return { error: 'Missing required fields' };
  }

  const client = await clerkClient();

  try {
    await client.users.updateUser(userId, {
      publicMetadata: {
        onboardingComplete: true,
        targetLanguage,
        proficiencyLevel,
        learningGoal,
      },
    });
    logger.info(
      { userId },
      'User metadata updated successfully for onboarding',
    );
    return { message: 'Onboarding completed' };
  } catch (err) {
    logger.error(
      { err, userId },
      'Error updating user metadata during onboarding',
    );
    return { error: 'There was an error updating your profile.' };
  }
};
