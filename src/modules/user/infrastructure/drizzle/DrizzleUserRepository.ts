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
        displayName: usersTable.displayName,
        locale: usersTable.locale,
        timezone: usersTable.timezone,
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
      displayName: row.displayName ?? undefined,
      locale: row.locale ?? undefined,
      timezone: row.timezone ?? undefined,
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
      readonly displayName?: string;
      readonly locale?: string;
      readonly timezone?: string;
    },
  ): Promise<void> {
    const updatePayload: {
      displayName?: string;
      locale?: string;
      timezone?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (profile.displayName !== undefined) {
      updatePayload.displayName = profile.displayName;
    }
    if (profile.locale !== undefined) {
      updatePayload.locale = profile.locale;
    }
    if (profile.timezone !== undefined) {
      updatePayload.timezone = profile.timezone;
    }

    await this.db
      .update(usersTable)
      .set(updatePayload)
      .where(eq(usersTable.id, id));
  }
}
