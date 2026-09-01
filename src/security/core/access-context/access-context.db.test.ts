/** @vitest-environment node */
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  Identity,
  RequestIdentitySource,
} from '@/core/contracts/identity';
import type { TenantContext } from '@/core/contracts/tenancy';

import { buildAccessContext } from './build-access-context';
import {
  deriveOrganizationScope,
  deriveTenantScopeAsPlatformAdmin,
} from './derive-data-scope';

import { DrizzleInternalIdentityLookup } from '@/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup';
import { authOrganizationIdentitiesTable } from '@/modules/auth/infrastructure/drizzle/schema';
import { DrizzleMembershipRepository } from '@/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository';
import { DrizzleOrganizationScopeAuthority } from '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority';
import { DrizzleTenantExistenceReader } from '@/modules/authorization/infrastructure/drizzle/DrizzleTenantExistenceReader';
import { organizationsTable } from '@/modules/authorization/infrastructure/drizzle/schema';
import { seedAuthorization } from '@/modules/authorization/infrastructure/drizzle/seed';
import { OrgDbOrganizationResolver } from '@/modules/provisioning/infrastructure/OrgDbOrganizationResolver';
import { PersonalOrganizationResolver } from '@/modules/provisioning/infrastructure/PersonalOrganizationResolver';
import { ProviderOrganizationResolver } from '@/modules/provisioning/infrastructure/ProviderOrganizationResolver';
import type { ActiveTenantContextSource } from '@/modules/provisioning/infrastructure/request-context/ActiveTenantContextSource';
import { SingleTenantResolver } from '@/modules/provisioning/infrastructure/SingleTenantResolver';
import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 Slice 2 — differential + security-negative proof against real
 * PostgreSQL (Testcontainers via `pnpm test:db:ci` / `pnpm test:db:local`;
 * PGlite is supplementary fast coverage only).
 *
 * These depend on real Postgres semantics: `organizations.id ->
 * organizations.tenant_id`, `tenants.id` row existence, the `memberships`
 * composite-PK FK, and sibling/cross-tenant denial.
 *
 * DIFFERENTIAL here does NOT mean `canonicalTenantId === legacyTenantContext
 * .tenantId` — the legacy `tenantId` currently holds the ORGANIZATION id
 * (OZI-67/OZI-71 collapse). It means: for each representative legacy
 * resolver path, canonical construction identifies the SAME internal
 * organization AND independently obtains that organization's REAL parent
 * tenant from `organizations.tenant_id`.
 *
 * No existing consumer, resolver, or `createSecurityContext` path is touched
 * — this module is not wired into any runtime authorization decision.
 */

let testDb: TestDb;
let aliceId: string;
let bobId: string;
let acmeTenantId: string;
let globexTenantId: string;
let acmeOrgId: string;
let globexOrgId: string;

const stubActiveTenantSource = (
  activeTenantId: string | null,
): ActiveTenantContextSource => ({
  getActiveTenantId: () => Promise.resolve(activeTenantId),
});

const stubIdentitySource = (orgExternalId: string): RequestIdentitySource => ({
  get: () => Promise.resolve({ orgExternalId }),
});

const identity = (id: string): Identity => ({ id });

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  aliceId = users.alice.id;
  bobId = users.bob.id;
  acmeTenantId = auth.tenants.acme.id;
  globexTenantId = auth.tenants.globex.id;
  acmeOrgId = auth.orgs.acmeHq.id;
  globexOrgId = auth.orgs.globexHq.id;

  // Provider + personal identity mappings for the resolver paths that need them.
  await testDb.db
    .insert(authOrganizationIdentitiesTable)
    .values([
      {
        provider: 'clerk',
        externalOrgId: 'org_ext_acme',
        organizationId: acmeOrgId,
      },
      // Personal-org lookup keys the internal user id as `externalOrgId`.
      {
        provider: 'personal',
        externalOrgId: aliceId,
        organizationId: globexOrgId,
      },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await testDb.cleanup();
});

/**
 * Runs a legacy resolver, then canonical construction from the SAME inputs,
 * and asserts the differential invariants.
 */
async function assertCanonicalMatchesLegacy(params: {
  legacy: TenantContext;
  expectedInternalUserId: string;
  expectedParentTenantId: string;
}): Promise<void> {
  const { legacy, expectedInternalUserId, expectedParentTenantId } = params;

  // Independent authoritative read — NOT `legacy.tenantId`.
  const parentTenantId = await new DrizzleOrganizationScopeAuthority(
    testDb.db,
  ).readParentTenantId(legacy.organizationId);
  expect(parentTenantId).toBe(expectedParentTenantId);

  const ctx = buildAccessContext({
    internalUserId: legacy.userId,
    activeOrganization: {
      internalOrganizationId: legacy.organizationId,
      parentTenantId: parentTenantId!,
    },
    isPlatformAdmin: false,
  });

  // 1-2. Same internal organization, same internal user.
  expect(ctx.activeOrganization?.organizationId).toBe(legacy.organizationId);
  expect(ctx.userId).toBe(expectedInternalUserId);

  // 3. Canonical tenant id is the REAL parent from the DB...
  expect(ctx.activeOrganization?.tenantId).toBe(expectedParentTenantId);
  // ...and is NOT the collapsed legacy value (which is the organization id).
  expect(ctx.activeOrganization?.tenantId).not.toBe(legacy.tenantId);
  expect(ctx.activeOrganization?.tenantId).not.toBe(
    ctx.activeOrganization?.organizationId,
  );
}

describe('OZI-71 Slice 2 — canonical AccessContext differential vs legacy resolvers (real Postgres)', () => {
  it('OrgDbOrganizationResolver: alice in acme HQ', async () => {
    const resolver = new OrgDbOrganizationResolver(
      stubActiveTenantSource(acmeOrgId),
      new DrizzleMembershipRepository(testDb.db),
    );
    const legacy = await resolver.resolve(identity(aliceId));

    expect(legacy).toMatchObject({
      organizationId: acmeOrgId,
      tenantId: acmeOrgId, // collapsed
      userId: aliceId,
    });
    await assertCanonicalMatchesLegacy({
      legacy,
      expectedInternalUserId: aliceId,
      expectedParentTenantId: acmeTenantId,
    });
  });

  it('OrgDbOrganizationResolver: alice in globex HQ (different tenant)', async () => {
    const resolver = new OrgDbOrganizationResolver(
      stubActiveTenantSource(globexOrgId),
      new DrizzleMembershipRepository(testDb.db),
    );
    const legacy = await resolver.resolve(identity(aliceId));

    await assertCanonicalMatchesLegacy({
      legacy,
      expectedInternalUserId: aliceId,
      expectedParentTenantId: globexTenantId,
    });
  });

  it('ProviderOrganizationResolver: provider org claim -> internal acme HQ', async () => {
    const resolver = new ProviderOrganizationResolver(
      stubIdentitySource('org_ext_acme'),
      new DrizzleInternalIdentityLookup(testDb.db),
      'clerk',
    );
    const legacy = await resolver.resolve(identity(aliceId));

    expect(legacy.organizationId).toBe(acmeOrgId);
    await assertCanonicalMatchesLegacy({
      legacy,
      expectedInternalUserId: aliceId,
      expectedParentTenantId: acmeTenantId,
    });
  });

  it('PersonalOrganizationResolver: personal org lookup -> internal globex HQ', async () => {
    const resolver = new PersonalOrganizationResolver(
      new DrizzleInternalIdentityLookup(testDb.db),
    );
    const legacy = await resolver.resolve(identity(aliceId));

    expect(legacy.organizationId).toBe(globexOrgId);
    await assertCanonicalMatchesLegacy({
      legacy,
      expectedInternalUserId: aliceId,
      expectedParentTenantId: globexTenantId,
    });
  });

  it('SingleTenantResolver: fixed-tenant org lookup -> internal acme HQ', async () => {
    const resolver = new SingleTenantResolver(
      acmeTenantId,
      async (tenantId) => {
        const [org] = await testDb.db
          .select({ id: organizationsTable.id })
          .from(organizationsTable)
          .where(eq(organizationsTable.tenantId, tenantId))
          .orderBy(asc(organizationsTable.id))
          .limit(1);
        return org?.id ?? null;
      },
    );
    const legacy = await resolver.resolve(identity(aliceId));

    expect(legacy.organizationId).toBe(acmeOrgId);
    await assertCanonicalMatchesLegacy({
      legacy,
      expectedInternalUserId: aliceId,
      expectedParentTenantId: acmeTenantId,
    });
  });

  it('load-bearing regression: legacy {orgId: ORG_A, tenantId: ORG_A} => canonical {organizationId: ORG_A, tenantId: TENANT_A}', async () => {
    const ORG_A = acmeOrgId;
    const TENANT_A = acmeTenantId;

    // Legacy shape as produced today.
    const legacy: TenantContext = {
      organizationId: ORG_A,
      tenantId: ORG_A,
      userId: aliceId,
    };

    const parentTenantId = await new DrizzleOrganizationScopeAuthority(
      testDb.db,
    ).readParentTenantId(ORG_A);
    const ctx = buildAccessContext({
      internalUserId: legacy.userId,
      activeOrganization: {
        internalOrganizationId: legacy.organizationId,
        parentTenantId: parentTenantId!,
      },
      isPlatformAdmin: false,
    });

    expect(ctx.activeOrganization).toEqual({
      organizationId: ORG_A,
      tenantId: TENANT_A,
    });
    expect(ctx.activeOrganization?.tenantId).not.toBe(ORG_A);
  });
});

describe('OZI-71 Slice 2 — organization-scope derivation with real membership FKs', () => {
  const authority = () => new DrizzleOrganizationScopeAuthority(testDb.db);

  const ctxFor = (userId: string) =>
    buildAccessContext({
      internalUserId: userId,
      // activeOrganization is deliberately acme for everyone — it must never
      // become authority for a different requested organization.
      activeOrganization: {
        internalOrganizationId: acmeOrgId,
        parentTenantId: acmeTenantId,
      },
      isPlatformAdmin: false,
    });

  it('(E) grants scope whose parent tenant is the one actually read for the requested org', async () => {
    const acme = await deriveOrganizationScope({
      accessContext: ctxFor(aliceId),
      requestedOrganizationId: acmeOrgId,
      authority: authority(),
    });
    expect(acme).toEqual({
      outcome: 'granted',
      scope: {
        kind: 'organization',
        organizationId: acmeOrgId,
        tenantId: acmeTenantId,
      },
    });

    const globex = await deriveOrganizationScope({
      accessContext: ctxFor(aliceId),
      requestedOrganizationId: globexOrgId,
      authority: authority(),
    });
    expect(globex).toEqual({
      outcome: 'granted',
      scope: {
        kind: 'organization',
        organizationId: globexOrgId,
        tenantId: globexTenantId, // globex's real parent, not acme's
      },
    });
  });

  it('(A) membership for ORG_A (acme) cannot be reused to obtain scope for ORG_B (globex)', async () => {
    // bob is a member of acme only.
    const result = await deriveOrganizationScope({
      accessContext: ctxFor(bobId),
      requestedOrganizationId: globexOrgId,
      authority: authority(),
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'organization-membership-required',
    });
  });

  it('(B) the parent tenant for ORG_A (acme) cannot be paired with ORG_B (globex)', async () => {
    // The API takes no caller-supplied (orgId, tenantId) pair; the derived
    // scope for globex can only ever carry globex's own parent tenant.
    const result = await deriveOrganizationScope({
      accessContext: ctxFor(aliceId), // alice is a member of globex too
      requestedOrganizationId: globexOrgId,
      authority: authority(),
    });

    expect(result.outcome).toBe('granted');
    if (result.outcome === 'granted') {
      expect(result.scope.tenantId).toBe(globexTenantId);
      expect(result.scope.tenantId).not.toBe(acmeTenantId);
    }
  });

  it('(C) sibling denial: bob (member of acme) is denied scope for globex', async () => {
    const result = await deriveOrganizationScope({
      accessContext: ctxFor(bobId),
      requestedOrganizationId: globexOrgId,
      authority: authority(),
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'organization-membership-required',
    });
  });

  it('(D) an unknown organization id is denied', async () => {
    const result = await deriveOrganizationScope({
      accessContext: ctxFor(aliceId),
      requestedOrganizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      authority: authority(),
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'not-an-internal-organization',
    });
  });
});

describe('OZI-71 Slice 2 — tenant-scope derivation proves tenant EXISTENCE (real Postgres)', () => {
  const tenants = () => new DrizzleTenantExistenceReader(testDb.db);

  const platformAdminCtx = () =>
    buildAccessContext({
      internalUserId: aliceId,
      activeOrganization: null,
      isPlatformAdmin: true,
    });

  const ordinaryCtx = () =>
    buildAccessContext({
      internalUserId: aliceId,
      activeOrganization: {
        internalOrganizationId: acmeOrgId,
        parentTenantId: acmeTenantId,
      },
      isPlatformAdmin: false,
    });

  it('(A) a valid UUID with no tenants row is denied `not-an-internal-tenant`', async () => {
    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: platformAdminCtx(),
      requestedTenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      operation: { kind: 'tenant-administration' },
      tenants: tenants(),
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'not-an-internal-tenant',
    });
  });

  it('(B) a real tenants.id + platform admin + explicit classification is granted', async () => {
    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: platformAdminCtx(),
      requestedTenantId: acmeTenantId,
      operation: { kind: 'tenant-administration' },
      tenants: tenants(),
    });

    expect(result).toEqual({
      outcome: 'granted',
      scope: { kind: 'tenant', tenantId: acmeTenantId },
    });
  });

  it('(C) a real tenants.id requested by an ordinary user is denied', async () => {
    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: ordinaryCtx(),
      requestedTenantId: acmeTenantId,
      operation: { kind: 'tenant-administration' },
      tenants: tenants(),
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'platform-admin-capability-required',
    });
  });

  it('(D) a platform admin with the other valid classification (platform-global) is denied tenant scope', async () => {
    const result = await deriveTenantScopeAsPlatformAdmin({
      accessContext: platformAdminCtx(),
      requestedTenantId: acmeTenantId,
      operation: { kind: 'platform-global' },
      tenants: tenants(),
    });

    expect(result).toEqual({
      outcome: 'denied',
      reason: 'explicit-tenant-administration-classification-required',
    });
  });
});
