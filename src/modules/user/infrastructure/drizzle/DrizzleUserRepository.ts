import { eq } from 'drizzle-orm';

import type { SubjectId } from '@/core/contracts/primitives';
import type { User, UserRepository } from '@/core/contracts/user';
import type { DrizzleDb } from '@/core/db';

import { usersTable } from './schema';

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: SubjectId): Promise<User | null> {
    const rows = await this.db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        onboardingComplete: usersTable.onboardingComplete,
        targetLanguage: usersTable.targetLanguage,
        proficiencyLevel: usersTable.proficiencyLevel,
        learningGoal: usersTable.learningGoal,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      onboardingComplete: row.onboardingComplete,
      targetLanguage: row.targetLanguage ?? undefined,
      proficiencyLevel: row.proficiencyLevel ?? undefined,
      learningGoal: row.learningGoal ?? undefined,
    };
  }

  async updateOnboardingStatus(
    id: SubjectId,
    complete: boolean,
  ): Promise<void> {
    await this.db
      .update(usersTable)
      .set({
        onboardingComplete: complete,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id));
  }

  async updateProfile(
    id: SubjectId,
    profile: {
      readonly targetLanguage?: string;
      readonly proficiencyLevel?: string;
      readonly learningGoal?: string;
    },
  ): Promise<void> {
    const updatePayload: {
      targetLanguage?: string;
      proficiencyLevel?: string;
      learningGoal?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (profile.targetLanguage !== undefined) {
      updatePayload.targetLanguage = profile.targetLanguage;
    }
    if (profile.proficiencyLevel !== undefined) {
      updatePayload.proficiencyLevel = profile.proficiencyLevel;
    }
    if (profile.learningGoal !== undefined) {
      updatePayload.learningGoal = profile.learningGoal;
    }

    await this.db
      .update(usersTable)
      .set(updatePayload)
      .where(eq(usersTable.id, id));
  }
}
