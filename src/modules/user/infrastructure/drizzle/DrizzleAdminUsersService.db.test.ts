/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';

import type { AdminUsersDataScope } from './DrizzleAdminUsersService';
import { DrizzleAdminUsersService } from './DrizzleAdminUsersService';
import { usersTable } from './schema';
import { seedUsers } from './seed';

import {
  membershipsTable,
  organizationsTable,
  rolesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { seedAuthorization } from '@/modules/authorization/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleAdminUsersService;
let aliceId: string;
let bobId: string;
let acmeOrgId: string;
let globexOrgId: string;
let acmeTenantId: string;
let globexTenantId: string;

// Test-local same-tenant sibling fixture (NOT added to the shared seed):
// a second organization under ACME's tenant, with a user who is a member of
// ONLY that sibling org. Proves organization isolation WITHIN one tenant.
const ACME_SIBLING_ORG_ID = '15000000-0000-4000-8000-000000000010';
const ACME_SIBLING_ROLE_ID = '20000000-0000-4000-8000-000000000010';
const SIBLING_USER_ID = '00000000-0000-4000-8000-000000000010';

/** Canonical `platform-global` scope — unrestricted by explicit classification. */
const GLOBAL: AdminUsersDataScope = { kind: 'platform-global' };

/** Canonical `organization` scope for a given org + its authoritative parent tenant. */
function orgScope(
  organizationId: string,
  tenantId: string,
): AdminUsersDataScope {
  return {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(organizationId),
    tenantId: parentTenantIdFromOrgRow(tenantId),
  };
}

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
  acmeTenantId = auth.tenants.acme.id;
  globexTenantId = auth.tenants.globex.id;

  // Same-tenant sibling org + a user who belongs ONLY to it.
  await testDb.db.insert(organizationsTable).values({
    id: ACME_SIBLING_ORG_ID,
    tenantId: acmeTenantId,
    name: 'Acme Education',
    slug: 'acme-education',
  });
  await testDb.db.insert(rolesTable).values({
    id: ACME_SIBLING_ROLE_ID,
    organizationId: ACME_SIBLING_ORG_ID,
    name: 'owner',
    isSystem: true,
  });
  await testDb.db.insert(usersTable).values({
    id: SIBLING_USER_ID,
    email: 'sibling-only@example.com',
    onboardingComplete: true,
  });
  await testDb.db.insert(membershipsTable).values({
    userId: SIBLING_USER_ID,
    organizationId: ACME_SIBLING_ORG_ID,
    roleId: ACME_SIBLING_ROLE_ID,
  });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminUsersService (real DB) — canonical DataScope containment', () => {
  describe('platform-global scope', () => {
    it('listAll(platform-global) returns users across multiple tenants', async () => {
      const { users, total } = await svc.listAll({}, GLOBAL);
      expect(total).toBeGreaterThanOrEqual(2);
      expect(users.map((u) => u.id)).toEqual(
        expect.arrayContaining([aliceId, bobId]),
      );
    });

    it('findById(platform-global) reaches a cross-tenant user', async () => {
      const bob = await svc.findById(bobId, GLOBAL);
      expect(bob?.id).toBe(bobId);
    });

    it('updateProfile(platform-global) reaches a cross-tenant user', async () => {
      // Uses alice, not bob -- bob is left pristine for the organization-scope
      // blocks below.
      const updated = await svc.updateProfile(
        aliceId,
        { displayName: 'Alice Global' },
        GLOBAL,
      );
      expect(updated?.displayName).toBe('Alice Global');
    });

    it('deactivate(platform-global) reaches a cross-tenant user', async () => {
      const deactivated = await svc.deactivate(aliceId, new Date(), GLOBAL);
      expect(deactivated?.deactivatedAt).toBeInstanceOf(Date);
    });
  });

  describe('organization scope — read', () => {
    it('list scoped to globex excludes bob (a member only of acme); count matches the scoped rows', async () => {
      const { users, total } = await svc.listAll(
        {},
        orgScope(globexOrgId, globexTenantId),
      );
      expect(users.some((u) => u.id === bobId)).toBe(false);
      expect(users.some((u) => u.id === aliceId)).toBe(true);
      expect(total).toBe(users.length);
    });

    it('list scoped to acme includes both alice and bob', async () => {
      const { users } = await svc.listAll(
        {},
        orgScope(acmeOrgId, acmeTenantId),
      );
      expect(users.map((u) => u.id)).toEqual(
        expect.arrayContaining([aliceId, bobId]),
      );
    });

    it('a multi-membership target (alice, in acme AND globex) is reachable through either authorized org', async () => {
      const viaAcme = await svc.findById(
        aliceId,
        orgScope(acmeOrgId, acmeTenantId),
      );
      const viaGlobex = await svc.findById(
        aliceId,
        orgScope(globexOrgId, globexTenantId),
      );
      expect(viaAcme?.id).toBe(aliceId);
      expect(viaGlobex?.id).toBe(aliceId);
    });

    it('findById scoped to acme resolves bob (a real member of acme)', async () => {
      const result = await svc.findById(
        bobId,
        orgScope(acmeOrgId, acmeTenantId),
      );
      expect(result?.id).toBe(bobId);
    });

    it('findById scoped to globex returns null for bob -- same result as a nonexistent id', async () => {
      const result = await svc.findById(
        bobId,
        orgScope(globexOrgId, globexTenantId),
      );
      expect(result).toBeNull();
    });

    it('findById returns null for a syntactically valid but nonexistent id, any scope', async () => {
      const missingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      expect(await svc.findById(missingId, GLOBAL)).toBeNull();
      expect(
        await svc.findById(missingId, orgScope(acmeOrgId, acmeTenantId)),
      ).toBeNull();
    });

    it('a requested id cannot override scope: bobId with a globex scope still resolves to null', async () => {
      const result = await svc.findById(
        bobId,
        orgScope(globexOrgId, globexTenantId),
      );
      expect(result).toBeNull();
    });
  });

  describe('canonical tuple integrity — mismatched organizationId + tenantId', () => {
    // acmeOrgId belongs to acmeTenantId. Pairing it with globexTenantId is an
    // internally inconsistent DataScope: it MUST authorize nothing, even
    // though bob is a genuine member of acmeOrgId.
    const mismatch = () => orgScope(acmeOrgId, globexTenantId);

    it('LIST with a mismatched tuple returns zero rows and total 0', async () => {
      const { users, total } = await svc.listAll({}, mismatch());
      expect(users).toHaveLength(0);
      expect(total).toBe(0);
    });

    it('GET bob with a mismatched tuple returns null', async () => {
      expect(await svc.findById(bobId, mismatch())).toBeNull();
    });

    it('UPDATE bob with a mismatched tuple returns null and does not change the row', async () => {
      const before = await svc.findById(bobId, GLOBAL);
      const result = await svc.updateProfile(
        bobId,
        { displayName: 'Tuple Mismatch Attack' },
        mismatch(),
      );
      expect(result).toBeNull();

      const after = await svc.findById(bobId, GLOBAL);
      expect(after?.displayName).toBe(before?.displayName);
      expect(after?.displayName).not.toBe('Tuple Mismatch Attack');
    });

    it('DEACTIVATE bob with a mismatched tuple returns null and does not deactivate the row', async () => {
      const before = await svc.findById(bobId, GLOBAL);
      const result = await svc.deactivate(bobId, new Date(), mismatch());
      expect(result).toBeNull();

      const after = await svc.findById(bobId, GLOBAL);
      expect(after?.deactivatedAt).toEqual(before?.deactivatedAt);
    });

    it('the matching tuple (acmeOrgId + acmeTenantId) authorizes the same operations', async () => {
      expect(
        (await svc.findById(bobId, orgScope(acmeOrgId, acmeTenantId)))?.id,
      ).toBe(bobId);
      const updated = await svc.updateProfile(
        bobId,
        { displayName: 'Bob Acme Tuple' },
        orgScope(acmeOrgId, acmeTenantId),
      );
      expect(updated?.displayName).toBe('Bob Acme Tuple');
    });
  });

  describe('organization scope — mutation isolation', () => {
    it('updateProfile scoped to globex is rejected (null) for bob and does not mutate the row', async () => {
      const before = await svc.findById(bobId, GLOBAL);
      const result = await svc.updateProfile(
        bobId,
        { displayName: 'Cross-Org Attack' },
        orgScope(globexOrgId, globexTenantId),
      );
      expect(result).toBeNull();

      const after = await svc.findById(bobId, GLOBAL);
      expect(after?.displayName).toBe(before?.displayName);
      expect(after?.displayName).not.toBe('Cross-Org Attack');
    });

    it('updateProfile scoped to acme is allowed for bob', async () => {
      const result = await svc.updateProfile(
        bobId,
        { displayName: 'Bob Acme-Scoped' },
        orgScope(acmeOrgId, acmeTenantId),
      );
      expect(result?.displayName).toBe('Bob Acme-Scoped');
    });

    it('deactivate scoped to globex is rejected (null) for bob and does not deactivate the row', async () => {
      const before = await svc.findById(bobId, GLOBAL);
      const result = await svc.deactivate(
        bobId,
        new Date(),
        orgScope(globexOrgId, globexTenantId),
      );
      expect(result).toBeNull();

      const after = await svc.findById(bobId, GLOBAL);
      expect(after?.deactivatedAt).toEqual(before?.deactivatedAt);
    });

    it('deactivate scoped to acme is allowed for bob', async () => {
      const result = await svc.deactivate(
        bobId,
        new Date(),
        orgScope(acmeOrgId, acmeTenantId),
      );
      expect(result?.deactivatedAt).toBeInstanceOf(Date);
    });
  });

  describe('same-tenant sibling organization isolation (same TenantId, different OrganizationId)', () => {
    // ACME_HQ and ACME_SIBLING both belong to ACME's tenant. A scope for
    // ACME_HQ must NOT reach a user who is a member only of ACME_SIBLING --
    // organization membership never escalates to tenant-wide authority.
    const acmeHqScope = () => orgScope(acmeOrgId, acmeTenantId);
    const acmeSiblingScope = () => orgScope(ACME_SIBLING_ORG_ID, acmeTenantId);

    it('LIST scoped to ACME_HQ includes bob and excludes the sibling-only user; count matches the scoped rows', async () => {
      const { users, total } = await svc.listAll({}, acmeHqScope());
      expect(users.some((u) => u.id === bobId)).toBe(true);
      expect(users.some((u) => u.id === SIBLING_USER_ID)).toBe(false);
      expect(total).toBe(users.length);
    });

    it('GET the sibling-only user under an ACME_HQ scope returns null', async () => {
      expect(await svc.findById(SIBLING_USER_ID, acmeHqScope())).toBeNull();
    });

    it('UPDATE the sibling-only user under an ACME_HQ scope returns null and does not change the row', async () => {
      const before = await svc.findById(SIBLING_USER_ID, GLOBAL);
      const result = await svc.updateProfile(
        SIBLING_USER_ID,
        { displayName: 'Sibling Escalation Attack' },
        acmeHqScope(),
      );
      expect(result).toBeNull();

      const after = await svc.findById(SIBLING_USER_ID, GLOBAL);
      expect(after?.displayName).toBe(before?.displayName);
      expect(after?.displayName).not.toBe('Sibling Escalation Attack');
    });

    it('DEACTIVATE the sibling-only user under an ACME_HQ scope returns null and does not deactivate the row', async () => {
      const before = await svc.findById(SIBLING_USER_ID, GLOBAL);
      const result = await svc.deactivate(
        SIBLING_USER_ID,
        new Date(),
        acmeHqScope(),
      );
      expect(result).toBeNull();

      const after = await svc.findById(SIBLING_USER_ID, GLOBAL);
      expect(after?.deactivatedAt).toEqual(before?.deactivatedAt);
    });

    it('positive control: a scope for ACME_SIBLING itself reaches the sibling-only user', async () => {
      const hit = await svc.findById(SIBLING_USER_ID, acmeSiblingScope());
      expect(hit?.id).toBe(SIBLING_USER_ID);

      const listed = await svc.listAll({}, acmeSiblingScope());
      expect(listed.users.some((u) => u.id === SIBLING_USER_ID)).toBe(true);
      expect(listed.users.some((u) => u.id === bobId)).toBe(false);

      const updated = await svc.updateProfile(
        SIBLING_USER_ID,
        { displayName: 'Sibling Owner' },
        acmeSiblingScope(),
      );
      expect(updated?.displayName).toBe('Sibling Owner');
    });
  });
});
