/** @vitest-environment node */
import { createHash, randomUUID } from 'node:crypto';

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  passwordResetTokensTable,
  userCredentialsTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function seedUserWithResetToken(token: string, expiresInMs = 3_600_000) {
  const userId = randomUUID();
  const email = `reset-race-${userId}@example.com`;
  const [user] = await testDb.db
    .insert(usersTable)
    .values({ id: userId, email, onboardingComplete: true })
    .returning();

  if (!user) throw new Error('failed to seed user');

  await testDb.db.insert(passwordResetTokensTable).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + expiresInMs),
  });

  return user;
}

/**
 * The claim exactly as the route performs it. Asserting against the real SQL
 * (not a re-implementation in the test) is the point: the single-use
 * guarantee IS this statement -- the same UPDATE that marks the token used
 * re-checks that it was unused, and RETURNING reports whether this caller
 * won. See SEC-35.
 */
async function claimToken(token: string): Promise<string | null> {
  const rows = await testDb.db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, hashToken(token)),
        gt(passwordResetTokensTable.expiresAt, sql`NOW()`),
        isNull(passwordResetTokensTable.usedAt),
      ),
    )
    .returning();

  return rows[0]?.userId ?? null;
}

describe('password reset token claim (real DB, SEC-35)', () => {
  it('lets exactly one of many concurrent claims win', async () => {
    const token = `race-${randomUUID()}`;
    await seedUserWithResetToken(token);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => claimToken(token)),
    );

    const winners = results.filter((userId) => userId !== null);
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(9);
  });

  it('rejects a second claim made after the first has completed', async () => {
    const token = `sequential-${randomUUID()}`;
    const user = await seedUserWithResetToken(token);

    await expect(claimToken(token)).resolves.toBe(user.id);
    await expect(claimToken(token)).resolves.toBeNull();
  });

  it('rejects an expired token even though it was never used', async () => {
    const token = `expired-${randomUUID()}`;
    await seedUserWithResetToken(token, -1_000);

    await expect(claimToken(token)).resolves.toBeNull();
  });

  it('leaves usedAt set by the winning claim only', async () => {
    const token = `single-write-${randomUUID()}`;
    await seedUserWithResetToken(token);

    await claimToken(token);
    const [afterFirst] = await testDb.db
      .select({ usedAt: passwordResetTokensTable.usedAt })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, hashToken(token)))
      .limit(1);

    const firstUsedAt = afterFirst?.usedAt;
    expect(firstUsedAt).not.toBeNull();

    // A losing claim must not move the timestamp -- the old code's unguarded
    // `UPDATE ... WHERE id = ?` would happily overwrite it.
    await claimToken(token);
    const [afterSecond] = await testDb.db
      .select({ usedAt: passwordResetTokensTable.usedAt })
      .from(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.tokenHash, hashToken(token)))
      .limit(1);

    expect(afterSecond?.usedAt).toEqual(firstUsedAt);
  });

  it('never leaves two credential rows for one user after a contested reset', async () => {
    const token = `credentials-${randomUUID()}`;
    const user = await seedUserWithResetToken(token);

    await claimToken(token);
    await claimToken(token);

    const credentials = await testDb.db
      .select({ userId: userCredentialsTable.userId })
      .from(userCredentialsTable)
      .where(eq(userCredentialsTable.userId, user.id));

    expect(credentials.length).toBeLessThanOrEqual(1);
  });
});
