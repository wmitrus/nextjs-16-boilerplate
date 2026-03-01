import { clerkClient } from '@clerk/nextjs/server';

import type { SubjectId } from '@/core/contracts/primitives';
import type { User, UserRepository } from '@/core/contracts/user';

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? { ...value } : {};
}

export class ClerkUserRepository implements UserRepository {
  async findById(userId: SubjectId): Promise<User | null> {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);

      return {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress,
        onboardingComplete: Boolean(user.publicMetadata?.onboardingComplete),
        targetLanguage: user.publicMetadata?.targetLanguage as string,
        proficiencyLevel: user.publicMetadata?.proficiencyLevel as string,
        learningGoal: user.publicMetadata?.learningGoal as string,
      };
    } catch (_error) {
      // In a real app, we should handle specific Clerk error codes
      return null;
    }
  }

  async updateProfile(
    userId: SubjectId,
    profile: {
      readonly targetLanguage?: string;
      readonly proficiencyLevel?: string;
      readonly learningGoal?: string;
    },
  ): Promise<void> {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    await client.users.updateUser(userId, {
      publicMetadata: {
        ...toRecord(user.publicMetadata),
        ...profile,
      },
    });
  }

  async updateOnboardingStatus(
    userId: SubjectId,
    complete: boolean,
  ): Promise<void> {
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      publicMetadata: {
        onboardingComplete: complete,
      },
    });
  }
}
