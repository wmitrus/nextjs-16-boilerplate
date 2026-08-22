/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAdminUsersService } from './DrizzleAdminUsersService';
import { seedUsers } from './seed';

import { seedAuthorization } from '@/modules/authorization/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleAdminUsersService;
let aliceId: string;
let bobId: string;
let acmeOrgId: string;
let globexOrgId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleAdminUsersService(testDb.db);

  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  aliceId = users.alice.id;
  bobId = users.bob.id;
  // alice belongs to both acme and globex; bob belongs only to acme
  // (see `seedAuthorization` fixture data).
  acmeOrgId = auth.orgs.acmeHq.id;
  globexOrgId = auth.orgs.globexHq.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminUsersService (real DB) — cross-tenant IDOR regression coverage', () => {
  describe('unscoped (platform admin)', () => {
    it('listAll(null) returns every user regardless of tenant', async () => {
      const { users, total } = await svc.listAll({}, null);
      expect(total).toBeGreaterThanOrEqual(2);
      expect(users.map((u) => u.id)).toEqual(
        expect.arrayContaining([aliceId, bobId]),
      );
    });

    it('findById(null) resolves any user by id', async () => {
      const bob = await svc.findById(bobId, null);
      expect(bob?.id).toBe(bobId);
    });

    it('updateProfile(null) mutates any user by id', async () => {
      // Uses alice, not bob -- bob is left untouched here because the
      // tenant-scoped describe block below depends on bob's row still
      // being un-deactivated/un-renamed at that point.
      const updated = await svc.updateProfile(
        aliceId,
        { displayName: 'Alice Unscoped' },
        null,
      );
      expect(updated?.displayName).toBe('Alice Unscoped');
    });

    it('deactivate(null) mutates any user by id', async () => {
      const deactivated = await svc.deactivate(aliceId, new Date(), null);
      expect(deactivated?.deactivatedAt).toBeInstanceOf(Date);
    });
  });

  describe('tenant-scoped (ABAC-authorized, non-platform-admin)', () => {
    it('listAll scoped to globex does not include bob, who is only a member of acme', async () => {
      const { users } = await svc.listAll({}, { tenantId: globexOrgId });
      expect(users.some((u) => u.id === bobId)).toBe(false);
      expect(users.some((u) => u.id === aliceId)).toBe(true);
    });

    it('listAll scoped to acme includes both alice and bob', async () => {
      const { users } = await svc.listAll({}, { tenantId: acmeOrgId });
      expect(users.map((u) => u.id)).toEqual(
        expect.arrayContaining([aliceId, bobId]),
      );
    });

    it('findById scoped to globex returns null for bob (a real user, but outside globex) -- the caller must see the same result as a nonexistent id', async () => {
      const result = await svc.findById(bobId, { tenantId: globexOrgId });
      expect(result).toBeNull();
    });

    it('findById scoped to acme resolves bob (a real member of acme)', async () => {
      const result = await svc.findById(bobId, { tenantId: acmeOrgId });
      expect(result?.id).toBe(bobId);
    });

    it('updateProfile scoped to globex is rejected (returns null) for bob and does not mutate the row', async () => {
      const result = await svc.updateProfile(
        bobId,
        { displayName: 'Cross-Tenant Attack' },
        { tenantId: globexOrgId },
      );
      expect(result).toBeNull();

      const unaffected = await svc.findById(bobId, null);
      expect(unaffected?.displayName).not.toBe('Cross-Tenant Attack');
    });

    it('updateProfile scoped to acme is allowed for bob', async () => {
      const result = await svc.updateProfile(
        bobId,
        { displayName: 'Bob Acme-Scoped' },
        { tenantId: acmeOrgId },
      );
      expect(result?.displayName).toBe('Bob Acme-Scoped');
    });

    it('deactivate scoped to globex is rejected (returns null) for bob and does not deactivate the row', async () => {
      const result = await svc.deactivate(bobId, new Date(), {
        tenantId: globexOrgId,
      });
      expect(result).toBeNull();

      const unaffected = await svc.findById(bobId, null);
      expect(unaffected?.deactivatedAt).toBeUndefined();
    });

    it('deactivate scoped to acme is allowed for bob', async () => {
      const result = await svc.deactivate(bobId, new Date(), {
        tenantId: acmeOrgId,
      });
      expect(result?.deactivatedAt).toBeInstanceOf(Date);
    });
  });

  it('findById returns null for a syntactically valid but nonexistent id, scoped or not', async () => {
    const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    expect(await svc.findById(missingId, null)).toBeNull();
    expect(await svc.findById(missingId, { tenantId: acmeOrgId })).toBeNull();
  });
});
