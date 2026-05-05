import { count, eq, ilike, or } from 'drizzle-orm';

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
        deactivatedAt: usersTable.deactivatedAt,
        createdAt: usersTable.createdAt,
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
      deactivatedAt: row.deactivatedAt ?? undefined,
      createdAt: row.createdAt,
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

  async listAll(options?: {
    readonly limit?: number;
    readonly offset?: number;
    readonly search?: string;
  }): Promise<{ users: User[]; total: number }> {
    const limit = Math.min(options?.limit ?? 50, 100);
    const offset = Math.max(options?.offset ?? 0, 0);
    const search = options?.search?.trim();

    const whereClause = search
      ? or(
          ilike(usersTable.email, `%${search}%`),
          ilike(usersTable.displayName, `%${search}%`),
        )
      : undefined;

    const [rows, countRows] = await Promise.all([
      this.db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          onboardingComplete: usersTable.onboardingComplete,
          displayName: usersTable.displayName,
          locale: usersTable.locale,
          timezone: usersTable.timezone,
          deactivatedAt: usersTable.deactivatedAt,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(usersTable.createdAt),
      this.db.select({ total: count() }).from(usersTable).where(whereClause),
    ]);

    const total = countRows[0]?.total ?? 0;

    return {
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        onboardingComplete: row.onboardingComplete,
        displayName: row.displayName ?? undefined,
        locale: row.locale ?? undefined,
        timezone: row.timezone ?? undefined,
        deactivatedAt: row.deactivatedAt ?? undefined,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  async deactivate(id: SubjectId, deactivatedAt: Date): Promise<void> {
    await this.db
      .update(usersTable)
      .set({
        deactivatedAt,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id));
  }
}
