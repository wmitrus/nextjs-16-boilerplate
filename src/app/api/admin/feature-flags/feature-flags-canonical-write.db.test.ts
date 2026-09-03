/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveCanonicalFeatureFlagWrite } from './feature-flags-canonical-write';

import { FeatureFlagCanonicalWriteInvariantError } from '@/modules/feature-flags/domain/errors';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·B — real-PostgreSQL proof of §14a.4 authoritative canonical
 * organization resolution: provider-external and internal candidates resolve
 * ONLY through authoritative `organizations` / `auth_organization_identities`
 * state, the parent tenant is ALWAYS read from `organizations.tenant_id`, a
 * `tenants.id` never becomes an `OrganizationId`, a provider external id never
 * enters `organization_id`, UUID shape alone brands nothing, and an ambiguous
 * candidate is rejected without precedence.
 *
 * Topology:  TENANT_A ┬ ORG_A1        TENANT_B ── ORG_B1
 *                     └ ORG_A2
 */

let testDb: TestDb;

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const UNKNOWN_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

// Provider external-org ids (opaque strings, never UUIDs in practice).
const EXT_A1 = 'org_ext_maps_to_a1';
const EXT_UNMAPPED = 'org_ext_unmapped';

const PROVIDER = 'clerk' as const;

async function resolveOrdinary(candidate: string) {
  return resolveCanonicalFeatureFlagWrite({
    isPlatformAdmin: false,
    ordinaryActiveOrganizationId: candidate,
    platformTargetOrganizationId: null,
    db: testDb.db,
    authProvider: PROVIDER,
  });
}

async function resolvePlatformTarget(target: string | null) {
  return resolveCanonicalFeatureFlagWrite({
    isPlatformAdmin: true,
    ordinaryActiveOrganizationId: 'unused',
    platformTargetOrganizationId: target,
    db: testDb.db,
    authProvider: PROVIDER,
  });
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES
        (${TENANT_A}, 'Tenant A'), (${TENANT_B}, 'Tenant B')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_A1}, ${TENANT_A}, 'Org A1'),
        (${ORG_A2}, ${TENANT_A}, 'Org A2'),
        (${ORG_B1}, ${TENANT_B}, 'Org B1')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO auth_organization_identities (provider, external_org_id, organization_id) VALUES
        (${PROVIDER}, ${EXT_A1}, ${ORG_A1})`,
  );
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM auth_organization_identities WHERE organization_id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
  await testDb.cleanup();
});

describe('resolveCanonicalFeatureFlagWrite — platform-admin organization target (real DB)', () => {
  it('resolves a provider external org id through auth_organization_identities to the mapped internal org + its parent tenant', async () => {
    const result = await resolvePlatformTarget(EXT_A1);

    expect(result).toEqual({
      outcome: 'resolved',
      facts: {
        kind: 'organization',
        organizationId: ORG_A1,
        tenantId: TENANT_A,
      },
    });
  });

  it('resolves a verified internal org id and reads the parent tenant from organizations.tenant_id', async () => {
    const result = await resolvePlatformTarget(ORG_A2);

    expect(result).toEqual({
      outcome: 'resolved',
      facts: {
        kind: 'organization',
        organizationId: ORG_A2,
        tenantId: TENANT_A,
      },
    });
  });

  it('rejects a nonexistent internal organization id (UUID shape brands nothing)', async () => {
    expect(await resolvePlatformTarget(UNKNOWN_UUID)).toEqual({
      outcome: 'unresolvable-organization-target',
    });
  });

  it('rejects a provider external id with no mapping', async () => {
    expect(await resolvePlatformTarget(EXT_UNMAPPED)).toEqual({
      outcome: 'unresolvable-organization-target',
    });
  });

  it('rejects a bare tenants.id supplied as an organization target — a tenants.id never becomes an OrganizationId', async () => {
    expect(await resolvePlatformTarget(TENANT_A)).toEqual({
      outcome: 'unresolvable-organization-target',
    });
  });

  it('rejects a malformed candidate without letting it reach a uuid DB predicate', async () => {
    expect(await resolvePlatformTarget('not-a-uuid!!')).toEqual({
      outcome: 'unresolvable-organization-target',
    });
  });

  it('null target is an explicit platform-global create, not an organization resolution', async () => {
    expect(await resolvePlatformTarget(null)).toEqual({
      outcome: 'resolved',
      facts: { kind: 'global' },
    });
  });

  it('rejects an ambiguous candidate that resolves two different ways, without precedence', async () => {
    // The literal UUID of ORG_A1 is ALSO registered as a provider external id
    // mapping to ORG_A2 — internal match and provider match disagree.
    await testDb.db.execute(
      sql`INSERT INTO auth_organization_identities (provider, external_org_id, organization_id)
          VALUES (${PROVIDER}, ${ORG_A1}, ${ORG_A2})`,
    );
    try {
      expect(await resolvePlatformTarget(ORG_A1)).toEqual({
        outcome: 'unresolvable-organization-target',
      });
    } finally {
      await testDb.db.execute(
        sql`DELETE FROM auth_organization_identities WHERE provider = ${PROVIDER} AND external_org_id = ${ORG_A1}`,
      );
    }
  });

  it('accepts a candidate that resolves the same way through both paths', async () => {
    await testDb.db.execute(
      sql`INSERT INTO auth_organization_identities (provider, external_org_id, organization_id)
          VALUES (${PROVIDER}, ${ORG_A1}, ${ORG_A1})`,
    );
    try {
      expect(await resolvePlatformTarget(ORG_A1)).toEqual({
        outcome: 'resolved',
        facts: {
          kind: 'organization',
          organizationId: ORG_A1,
          tenantId: TENANT_A,
        },
      });
    } finally {
      await testDb.db.execute(
        sql`DELETE FROM auth_organization_identities WHERE provider = ${PROVIDER} AND external_org_id = ${ORG_A1}`,
      );
    }
  });
});

describe('resolveCanonicalFeatureFlagWrite — ordinary org-context writer (real DB)', () => {
  it('verifies a claimed internal active organization and brands its parent tenant from the org row', async () => {
    const result = await resolveOrdinary(ORG_A1);

    expect(result).toEqual({
      outcome: 'resolved',
      facts: {
        kind: 'organization',
        organizationId: ORG_A1,
        tenantId: TENANT_A,
      },
    });
  });

  it('resolves a provider-external active-org candidate through its auth_organization_identities mapping — the external string never enters organization_id (§14a.4)', async () => {
    // Degraded legacy resolution can leave a provider external org id in the
    // active-org slot; an ordinary writer must still resolve it authoritatively.
    const result = await resolveOrdinary(EXT_A1);

    expect(result).toEqual({
      outcome: 'resolved',
      facts: {
        kind: 'organization',
        organizationId: ORG_A1, // the MAPPED internal id, not "org_ext_maps_to_a1"
        tenantId: TENANT_A, // read from organizations.tenant_id of that row
      },
    });
  });

  it('resolves when internal-id and provider-mapping evidence agree on the same organization', async () => {
    await testDb.db.execute(
      sql`INSERT INTO auth_organization_identities (provider, external_org_id, organization_id)
          VALUES (${PROVIDER}, ${ORG_A1}, ${ORG_A1})`,
    );
    try {
      expect(await resolveOrdinary(ORG_A1)).toEqual({
        outcome: 'resolved',
        facts: {
          kind: 'organization',
          organizationId: ORG_A1,
          tenantId: TENANT_A,
        },
      });
    } finally {
      await testDb.db.execute(
        sql`DELETE FROM auth_organization_identities WHERE provider = ${PROVIDER} AND external_org_id = ${ORG_A1}`,
      );
    }
  });

  it('fails closed (invariant) when internal-id and provider-mapping evidence disagree — never precedence', async () => {
    // Candidate ORG_A1 (a real internal id) is ALSO a provider external id
    // mapping to ORG_A2.
    await testDb.db.execute(
      sql`INSERT INTO auth_organization_identities (provider, external_org_id, organization_id)
          VALUES (${PROVIDER}, ${ORG_A1}, ${ORG_A2})`,
    );
    try {
      await expect(resolveOrdinary(ORG_A1)).rejects.toBeInstanceOf(
        FeatureFlagCanonicalWriteInvariantError,
      );
    } finally {
      await testDb.db.execute(
        sql`DELETE FROM auth_organization_identities WHERE provider = ${PROVIDER} AND external_org_id = ${ORG_A1}`,
      );
    }
  });

  it('fails closed (invariant) when the active-org slot holds a tenants.id (CF-1) — never NULL, never global', async () => {
    await expect(resolveOrdinary(TENANT_A)).rejects.toBeInstanceOf(
      FeatureFlagCanonicalWriteInvariantError,
    );
  });

  it('fails closed for an unmapped provider-external active-org candidate', async () => {
    await expect(resolveOrdinary(EXT_UNMAPPED)).rejects.toBeInstanceOf(
      FeatureFlagCanonicalWriteInvariantError,
    );
  });

  it('fails closed for a syntactically valid UUID that is not an organizations row', async () => {
    await expect(resolveOrdinary(UNKNOWN_UUID)).rejects.toBeInstanceOf(
      FeatureFlagCanonicalWriteInvariantError,
    );
  });
});
