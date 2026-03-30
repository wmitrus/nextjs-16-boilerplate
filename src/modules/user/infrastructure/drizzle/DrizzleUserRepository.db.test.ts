/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleUserRepository } from './DrizzleUserRepository';
import { seedUsers } from './seed';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let aliceId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  aliceId = users.alice.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleUserRepository (real DB)', () => {
  it('returns seeded user with default onboarding state', async () => {
    const repo = new DrizzleUserRepository(testDb.db);
    const user = await repo.findById(aliceId);

    expect(user).toBeDefined();
    expect(user?.id).toBe(aliceId);
    expect(user?.onboardingComplete).toBe(false);
  });

  it('updates profile fields', async () => {
    const repo = new DrizzleUserRepository(testDb.db);

    await repo.updateProfile(aliceId, {
      displayName: 'Alice Smith',
      locale: 'pl-PL',
      timezone: 'Europe/Warsaw',
    });

    const user = await repo.findById(aliceId);
    expect(user?.displayName).toBe('Alice Smith');
    expect(user?.locale).toBe('pl-PL');
    expect(user?.timezone).toBe('Europe/Warsaw');
  });

  it('updates onboarding status', async () => {
    const repo = new DrizzleUserRepository(testDb.db);

    await repo.updateOnboardingStatus(aliceId, true);

    const user = await repo.findById(aliceId);
    expect(user?.onboardingComplete).toBe(true);
  });

  it('returns null for unknown user', async () => {
    const repo = new DrizzleUserRepository(testDb.db);
    const user = await repo.findById('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(user).toBeNull();
  });
});
