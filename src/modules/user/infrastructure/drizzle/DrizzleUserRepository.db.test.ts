/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleUserRepository } from './DrizzleUserRepository';
import { seedUsers } from './seed';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let aliceId: string;
let bobId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  aliceId = users.alice.id;
  bobId = users.bob.id;
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

  it('returns deactivatedAt as undefined for a non-deactivated user', async () => {
    const repo = new DrizzleUserRepository(testDb.db);
    const user = await repo.findById(aliceId);

    expect(user).toBeDefined();
    expect(user?.deactivatedAt).toBeUndefined();
  });

  it('returns null for unknown user', async () => {
    const repo = new DrizzleUserRepository(testDb.db);
    const user = await repo.findById('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(user).toBeNull();
  });

  describe('listAll()', () => {
    it('returns all seeded users with pagination defaults', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { users, total } = await repo.listAll();

      expect(total).toBeGreaterThanOrEqual(2);
      const ids = users.map((u) => u.id);
      expect(ids).toContain(aliceId);
      expect(ids).toContain(bobId);
    });

    it('returns correct total count', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { total } = await repo.listAll();

      expect(typeof total).toBe('number');
      expect(total).toBeGreaterThanOrEqual(2);
    });

    it('filters by email search', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { users, total } = await repo.listAll({ search: 'alice@' });

      expect(total).toBe(1);
      expect(users).toHaveLength(1);
      expect(users[0]?.id).toBe(aliceId);
    });

    it('returns empty result for non-matching search', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { users, total } = await repo.listAll({
        search: 'zzz-no-match-xyz',
      });

      expect(total).toBe(0);
      expect(users).toHaveLength(0);
    });

    it('respects limit pagination', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { users, total } = await repo.listAll({ limit: 1, offset: 0 });

      expect(users).toHaveLength(1);
      expect(total).toBeGreaterThanOrEqual(2);
    });

    it('clamps limit to maximum of 100', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { users } = await repo.listAll({ limit: 999 });

      expect(users.length).toBeLessThanOrEqual(100);
    });

    it('includes createdAt in returned users', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { users } = await repo.listAll();

      const alice = users.find((u) => u.id === aliceId);
      expect(alice?.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('deactivate()', () => {
    it('sets deactivatedAt timestamp on the user', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const deactivatedAt = new Date('2026-01-15T10:00:00Z');

      await repo.deactivate(bobId, deactivatedAt);

      const user = await repo.findById(bobId);
      expect(user?.deactivatedAt).toBeInstanceOf(Date);
      expect(user?.deactivatedAt?.toISOString()).toBe(
        deactivatedAt.toISOString(),
      );
    });

    it('returns deactivatedAt in listAll() results', async () => {
      const repo = new DrizzleUserRepository(testDb.db);
      const { users } = await repo.listAll();

      const bob = users.find((u) => u.id === bobId);
      expect(bob?.deactivatedAt).toBeInstanceOf(Date);
    });
  });
});
