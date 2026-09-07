/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { FeatureFlagEvaluationContext } from '@/core/contracts/feature-flags';

import { DrizzleFeatureFlagService } from './DrizzleFeatureFlagService';
import { featureFlagsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·D — real-PostgreSQL proof of the canonical runtime predicate
 * (§14a.7): the `(organizationId, tenantId)` tuple is proven valid BEFORE
 * either a `canonical_organization` override or an `intentional_global`
 * fallback may match. An invalid tuple yields `false` with NO fallback —
 * the single most security-critical case in this file.
 *
 * Topology:  TENANT_A ┬ ORG_A1        TENANT_B ── ORG_B1
 *                     └ ORG_A2
 */

let testDb: TestDb;
let svc: DrizzleFeatureFlagService;

const TENANT_A = '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a';
const TENANT_B = '4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b';
const ORG_A1 = 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3';
const ORG_A2 = 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4';
const ORG_B1 = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3';

const orgScope = (
  organizationId: string,
  tenantId: string,
): FeatureFlagEvaluationContext => ({
  scope: {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(organizationId),
    tenantId: parentTenantIdFromOrgRow(tenantId),
  },
  subject: { kind: 'system', systemSubjectId: 'test' },
});

const platformScope: FeatureFlagEvaluationContext = {
  scope: { kind: 'platform-global' },
  subject: { kind: 'system', systemSubjectId: 'test' },
};

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleFeatureFlagService(testDb.db);

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

  await testDb.db.insert(featureFlagsTable).values([
    // 1. canonical org positive
    {
      key: 'canonical-only',
      tenantId: 'legacy-canonical-only',
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
      enabled: true,
    },
    // 2. org override > intentional_global (same key, both rows)
    {
      key: 'override-flag',
      tenantId: 'legacy-override-org',
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
      enabled: true,
    },
    {
      key: 'override-flag',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: false,
    },
    // 3. valid org, no override -> intentional_global fallback
    {
      key: 'global-fallback-flag',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
    },
    // 4. sibling organization isolation (ORG_A2 only)
    {
      key: 'sibling-flag',
      tenantId: 'legacy-sibling',
      organizationId: ORG_A2,
      ownershipState: 'canonical_organization',
      enabled: true,
    },
    // 5. cross-tenant isolation (ORG_B1 only)
    {
      key: 'cross-tenant-flag',
      tenantId: 'legacy-cross-tenant',
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization',
      enabled: true,
    },
    // 6. the ORG_A1+TENANT_B invalid-tuple target — a genuinely global row
    // that must NOT be reachable through an invalid tuple.
    {
      key: 'invalid-tuple-target',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
    },
    // 7. unresolved_legacy — never participates in any scope
    {
      key: 'unresolved-flag',
      tenantId: 'some-legacy-value',
      organizationId: null,
      ownershipState: 'unresolved_legacy',
      enabled: true,
    },
    // 8. quarantined — never participates in any scope
    {
      key: 'quarantined-flag',
      tenantId: 'some-quarantined-legacy-value',
      organizationId: null,
      ownershipState: 'quarantined',
      enabled: true,
    },
    // 9. canonical org excluded from platform-global (no intentional_global
    // row shares this key)
    {
      key: 'org-only-flag',
      tenantId: 'legacy-org-only',
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
      enabled: true,
    },
    // 10. platform-global -> intentional_global only
    {
      key: 'global-only-flag',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
    },
  ]);
});

afterAll(async () => {
  await testDb.db.delete(featureFlagsTable);
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
  await testDb.cleanup();
});

describe('DrizzleFeatureFlagService (real DB) — organization scope', () => {
  it('canonical organization positive: ORG_A1 + TENANT_A resolves its own row', async () => {
    expect(
      await svc.isEnabled('canonical-only', orgScope(ORG_A1, TENANT_A)),
    ).toBe(true);
  });

  it('organization override beats intentional_global for the same key', async () => {
    expect(
      await svc.isEnabled('override-flag', orgScope(ORG_A1, TENANT_A)),
    ).toBe(true); // the canonical override (true), not the disabled global
  });

  it('valid tuple with no override falls back to intentional_global', async () => {
    expect(
      await svc.isEnabled('global-fallback-flag', orgScope(ORG_A1, TENANT_A)),
    ).toBe(true);
  });

  it('sibling organization isolation: ORG_A2-owned row is invisible to ORG_A1', async () => {
    expect(
      await svc.isEnabled('sibling-flag', orgScope(ORG_A1, TENANT_A)),
    ).toBe(false);
    // ...and resolves for its own organization.
    expect(
      await svc.isEnabled('sibling-flag', orgScope(ORG_A2, TENANT_A)),
    ).toBe(true);
  });

  it('cross-tenant isolation: ORG_B1-owned row is invisible to ORG_A1', async () => {
    expect(
      await svc.isEnabled('cross-tenant-flag', orgScope(ORG_A1, TENANT_A)),
    ).toBe(false);
  });

  it('CRITICAL: ORG_A1 + TENANT_B (a real organization, wrong tenant) -> false, no global fallback', async () => {
    // ORG_A1 genuinely exists and 'invalid-tuple-target' genuinely is
    // intentional_global -- but ORG_A1's real parent is TENANT_A, not
    // TENANT_B. The tuple-validity gate must dominate the whole predicate.
    expect(
      await svc.isEnabled('invalid-tuple-target', orgScope(ORG_A1, TENANT_B)),
    ).toBe(false);
    // Sanity: the same key resolves fine under its OWN organization's valid
    // tuple context and under platform-global -- proving the false above is
    // the tuple-validity gate, not a fixture mistake.
    expect(
      await svc.isEnabled('invalid-tuple-target', orgScope(ORG_A1, TENANT_A)),
    ).toBe(true);
    expect(await svc.isEnabled('invalid-tuple-target', platformScope)).toBe(
      true,
    );
  });

  it('unresolved_legacy never participates in organization scope', async () => {
    expect(
      await svc.isEnabled('unresolved-flag', orgScope(ORG_A1, TENANT_A)),
    ).toBe(false);
  });

  it('quarantined never participates in organization scope', async () => {
    expect(
      await svc.isEnabled('quarantined-flag', orgScope(ORG_A1, TENANT_A)),
    ).toBe(false);
  });

  it('missing flag -> false', async () => {
    expect(
      await svc.isEnabled('nonexistent-flag', orgScope(ORG_A1, TENANT_A)),
    ).toBe(false);
  });
});

describe('DrizzleFeatureFlagService (real DB) — platform-global scope', () => {
  it('resolves an intentional_global row', async () => {
    expect(await svc.isEnabled('global-only-flag', platformScope)).toBe(true);
  });

  it('excludes a canonical_organization row (no fallback to any organization)', async () => {
    expect(await svc.isEnabled('org-only-flag', platformScope)).toBe(false);
  });

  it('excludes unresolved_legacy', async () => {
    expect(await svc.isEnabled('unresolved-flag', platformScope)).toBe(false);
  });

  it('excludes quarantined', async () => {
    expect(await svc.isEnabled('quarantined-flag', platformScope)).toBe(false);
  });

  it('missing flag -> false', async () => {
    expect(await svc.isEnabled('nonexistent-flag', platformScope)).toBe(false);
  });
});
