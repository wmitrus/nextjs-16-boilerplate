/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleMembershipRepository } from './DrizzleMembershipRepository';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let aliceId: string;
let acmeTenantId: string;
let globexTenantId: string;
let bobId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  aliceId = users.alice.id;
  bobId = users.bob.id;
  acmeTenantId = auth.tenants.acme.id;
  globexTenantId = auth.tenants.globex.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleMembershipRepository (real DB)', () => {
  it('returns true when alice is a member of acme', async () => {
    const repo = new DrizzleMembershipRepository(testDb.db);
    const result = await repo.isMember(aliceId, acmeTenantId);
    expect(result).toBe(true);
  });

  it('returns true when alice is a member of globex', async () => {
    const repo = new DrizzleMembershipRepository(testDb.db);
    const result = await repo.isMember(aliceId, globexTenantId);
    expect(result).toBe(true);
  });

  it('returns true when bob is a member of acme', async () => {
    const repo = new DrizzleMembershipRepository(testDb.db);
    const result = await repo.isMember(bobId, acmeTenantId);
    expect(result).toBe(true);
  });

  it('returns false when bob is NOT a member of globex', async () => {
    const repo = new DrizzleMembershipRepository(testDb.db);
    const result = await repo.isMember(bobId, globexTenantId);
    expect(result).toBe(false);
  });

  it('returns false for unknown user', async () => {
    const repo = new DrizzleMembershipRepository(testDb.db);
    const result = await repo.isMember(
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      acmeTenantId,
    );
    expect(result).toBe(false);
  });
});
