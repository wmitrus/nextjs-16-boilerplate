/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  runFeatureFlagOwnershipBackfill,
  type BackfillDecision,
} from './backfill-canonical-ownership';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·C — real-PostgreSQL (and PGlite) proof: §14a.10 classification
 * matrix (incl. cross-provider evidence), dry-run/apply parity incl. collisions,
 * FF·B collision quarantine, idempotency, keyset resumability, expected-state
 * concurrency protection (state / org / legacy evidence), bounded-memory
 * reporting, and per-decision authoritative evidence.
 *
 * Topology:  TENANT_A ┬ ORG_A1        TENANT_B ── ORG_B1
 *                     └ ORG_A2
 * Provider mappings are seeded PER-TEST (historical data is not provider-scoped).
 */

let testDb: TestDb;

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const UNKNOWN_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const backfill = (
  mode: 'dry-run' | 'apply',
  over: Partial<Parameters<typeof runFeatureFlagOwnershipBackfill>[1]> = {},
) =>
  runFeatureFlagOwnershipBackfill(testDb.db, { mode, batchSize: 500, ...over });

async function insertLegacy(
  key: string,
  tenantId: string | null,
): Promise<string> {
  const [row] = await testDb.db
    .insert(featureFlagsTable)
    .values({ key, tenantId, enabled: true })
    .returning();
  return row!.id;
}

async function insertFfbCanonical(
  key: string,
  organizationId: string,
  legacyTenantId: string,
): Promise<void> {
  await testDb.db.execute(
    sql`INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
        VALUES (${key}, ${legacyTenantId}, ${organizationId}, 'canonical_organization', true)`,
  );
}

async function insertMapping(
  provider: string,
  externalOrgId: string,
  organizationId: string,
): Promise<void> {
  await testDb.db.execute(
    sql`INSERT INTO auth_organization_identities (provider, external_org_id, organization_id)
        VALUES (${provider}, ${externalOrgId}, ${organizationId})`,
  );
}

const allRows = () =>
  testDb.db
    .select({
      id: featureFlagsTable.id,
      key: featureFlagsTable.key,
      tenantId: featureFlagsTable.tenantId,
      organizationId: featureFlagsTable.organizationId,
      ownershipState: featureFlagsTable.ownershipState,
    })
    .from(featureFlagsTable)
    .orderBy(featureFlagsTable.key, featureFlagsTable.tenantId);

const rowByKey = async (key: string) =>
  (await allRows()).find((r) => r.key === key);
const rowById = async (id: string) =>
  (await allRows()).find((r) => r.id === id);

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
});

afterEach(async () => {
  await testDb.db.delete(featureFlagsTable);
  await testDb.db.execute(
    sql`DELETE FROM auth_organization_identities WHERE organization_id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
  await testDb.cleanup();
});

describe('runFeatureFlagOwnershipBackfill — classification matrix + cross-provider evidence (real DB)', () => {
  it('apply: classifies every §14a.10 evidence class and mutates only the resolved ones', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);
    await insertMapping('clerk', ORG_A1, ORG_A2); // ORG_A1's UUID also maps -> ORG_A2

    await insertLegacy('internal-org', ORG_B1);
    await insertLegacy('provider-ext', 'ext-a1');
    await insertLegacy('legacy-null', null);
    await insertLegacy('bare-tenant', TENANT_A);
    await insertLegacy('unknown-uuid', UNKNOWN_UUID);
    await insertLegacy('arbitrary-str', 'legacy-acme');
    await insertLegacy('ambiguous', ORG_A1); // internal ORG_A1 vs provider ORG_A2

    const report = await backfill('apply');

    expect(report.candidateCount).toBe(7);
    expect(report.classifiedCanonicalOrganizationCount).toBe(2);
    expect(report.classifiedIntentionalGlobalCount).toBe(1);
    expect(report.unresolvedCount).toBe(4);
    expect(report.reasonCounts).toMatchObject({
      resolved_internal_organization: 1,
      resolved_provider_organization: 1,
      intentional_global_legacy_null: 1,
      unresolved_tenant_id_only: 1,
      unresolved_unknown_uuid: 1,
      unresolved_arbitrary_string: 1,
      ambiguous_internal_vs_provider: 1,
    });

    expect(await rowByKey('internal-org')).toMatchObject({
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization',
      tenantId: ORG_B1,
    });
    expect(await rowByKey('provider-ext')).toMatchObject({
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
      tenantId: 'ext-a1',
    });
    expect(await rowByKey('legacy-null')).toMatchObject({
      organizationId: null,
      ownershipState: 'intentional_global',
    });
    for (const key of [
      'bare-tenant',
      'unknown-uuid',
      'arbitrary-str',
      'ambiguous',
    ]) {
      expect(await rowByKey(key)).toMatchObject({
        organizationId: null,
        ownershipState: 'unresolved_legacy',
      });
    }
  });

  it('provider mapping only under authjs still resolves — current AUTH_PROVIDER is NOT a filter', async () => {
    await insertMapping('authjs', 'ext-authjs-only', ORG_B1);
    await insertLegacy('k', 'ext-authjs-only');

    const report = await backfill('apply');
    expect(report.classifiedCanonicalOrganizationCount).toBe(1);
    expect(report.reasonCounts.resolved_provider_organization).toBe(1);
    expect(await rowByKey('k')).toMatchObject({
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization',
    });
  });

  it('two providers -> SAME organization -> canonical (multi-provider agreement)', async () => {
    await insertMapping('clerk', 'ext-multi', ORG_A1);
    await insertMapping('authjs', 'ext-multi', ORG_A1);
    await insertLegacy('k', 'ext-multi');

    const report = await backfill('apply');
    expect(report.reasonCounts.resolved_multi_provider_organization).toBe(1);
    expect(await rowByKey('k')).toMatchObject({
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
    });
  });

  it('two providers -> DIFFERENT organizations -> unresolved, both evidence rows reported, no precedence', async () => {
    await insertMapping('clerk', 'ext-conflict', ORG_A1);
    await insertMapping('authjs', 'ext-conflict', ORG_A2);
    const id = await insertLegacy('k', 'ext-conflict');

    const decisions: BackfillDecision[] = [];
    const report = await backfill('apply', {
      onDecision: (d) => {
        decisions.push(d);
      },
    });

    expect(report.classifiedCanonicalOrganizationCount).toBe(0);
    expect(report.reasonCounts.ambiguous_provider_evidence).toBe(1);
    expect(await rowById(id)).toMatchObject({
      organizationId: null,
      ownershipState: 'unresolved_legacy',
    });

    const decision = decisions.find((d) => d.featureFlagId === id)!;
    expect(decision.outcome).toBe('unresolved_legacy');
    expect(
      decision.evidence.providerMappings.map((m) => m.organizationId).sort(),
    ).toEqual([ORG_A1, ORG_A2].sort());
    expect(
      decision.evidence.providerMappings.map((m) => m.provider).sort(),
    ).toEqual(['authjs', 'clerk']);
  });

  it('direct internal + all provider mappings agree -> canonical (resolved_same_internal_and_provider)', async () => {
    await insertMapping('clerk', ORG_B1, ORG_B1);
    await insertMapping('authjs', ORG_B1, ORG_B1);
    await insertLegacy('k', ORG_B1);

    const report = await backfill('apply');
    expect(report.reasonCounts.resolved_same_internal_and_provider).toBe(1);
    expect(await rowByKey('k')).toMatchObject({
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization',
    });
  });

  it('direct internal ORG_B1 but one provider maps to ORG_A2 -> unresolved, no precedence', async () => {
    await insertMapping('clerk', ORG_B1, ORG_A2);
    const id = await insertLegacy('k', ORG_B1);

    const report = await backfill('apply');
    expect(report.classifiedCanonicalOrganizationCount).toBe(0);
    expect(report.reasonCounts.ambiguous_internal_vs_provider).toBe(1);
    expect(await rowById(id)).toMatchObject({
      organizationId: null,
      ownershipState: 'unresolved_legacy',
    });
  });

  it('per-decision evidence records every authoritative source consulted', async () => {
    await insertMapping('clerk', ORG_B1, ORG_B1);
    const id = await insertLegacy('k', ORG_B1);

    const decisions: BackfillDecision[] = [];
    await backfill('dry-run', {
      onDecision: (d) => {
        decisions.push(d);
      },
    });

    const d = decisions.find((x) => x.featureFlagId === id)!;
    expect(d.runId).toEqual(expect.any(String));
    expect(d.evidence).toMatchObject({
      sourceTable: 'feature_flags',
      nullSemantics: 'proven_intentional_global',
      directInternalOrganization: {
        matched: true,
        organizationId: ORG_B1,
        parentTenantId: TENANT_B,
      },
      tenantId: { matched: false },
      providerMappings: [
        {
          provider: 'clerk',
          mappedOrganizationId: ORG_B1,
          verified: true,
          organizationId: ORG_B1,
          parentTenantId: TENANT_B,
        },
      ],
    });
    expect(d.organizationId).toBe(ORG_B1);
    expect(d.parentTenantId).toBe(TENANT_B);
  });
});

describe('runFeatureFlagOwnershipBackfill — dry-run / apply parity incl. collisions (real DB)', () => {
  it('mixed fixture: dry-run mutates nothing and its per-decision counts equal the subsequent apply', async () => {
    await insertMapping('clerk', 'ext-b', ORG_A1);
    await insertLegacy('a', ORG_B1);
    await insertLegacy('b', 'ext-b');
    await insertLegacy('c', null);
    await insertLegacy('d', 'nope');
    await insertFfbCanonical('e', ORG_A2, 'ffb-legacy-e');
    await insertLegacy('e', ORG_A2); // canonical -> ORG_A2 -> COLLIDES

    const before = await allRows();
    const dry = await backfill('dry-run');
    expect(await allRows()).toEqual(before);
    expect(dry.classifiedCanonicalOrganizationCount).toBe(2);
    expect(dry.classifiedIntentionalGlobalCount).toBe(1);
    expect(dry.unresolvedCount).toBe(1);
    expect(dry.quarantinedCount).toBe(1);

    const applied = await backfill('apply');
    expect({
      canonical: applied.classifiedCanonicalOrganizationCount,
      global: applied.classifiedIntentionalGlobalCount,
      unresolved: applied.unresolvedCount,
      quarantined: applied.quarantinedCount,
      reasons: applied.reasonCounts,
    }).toEqual({
      canonical: dry.classifiedCanonicalOrganizationCount,
      global: dry.classifiedIntentionalGlobalCount,
      unresolved: dry.unresolvedCount,
      quarantined: dry.quarantinedCount,
      reasons: dry.reasonCounts,
    });
  });

  it('collision parity: a pre-existing FF·B canonical row makes BOTH dry-run and apply decide quarantine', async () => {
    await insertFfbCanonical('k', ORG_B1, 'ffb-legacy-key');
    const histId = await insertLegacy('k', ORG_B1);

    const dry = await backfill('dry-run');
    expect(dry.quarantinedCount).toBe(1);
    expect(dry.classifiedCanonicalOrganizationCount).toBe(0);
    expect(dry.quarantinedRowsSample[0]).toMatchObject({
      key: 'k',
      outcome: 'quarantined',
      reason: 'canonical_collision_quarantined',
      organizationId: ORG_B1,
    });
    expect(await rowById(histId)).toMatchObject({
      ownershipState: 'unresolved_legacy',
      organizationId: null,
    });

    const applied = await backfill('apply');
    expect(applied.quarantinedCount).toBe(1);
    const rows = await allRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.tenantId === 'ffb-legacy-key')).toMatchObject({
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization',
    });
    expect(await rowById(histId)).toMatchObject({
      organizationId: null,
      ownershipState: 'quarantined',
      tenantId: ORG_B1,
    });
  });
});

describe('runFeatureFlagOwnershipBackfill — idempotency & resumability (real DB)', () => {
  it('a second apply run makes zero new mutations', async () => {
    await insertLegacy('x', ORG_B1);
    await insertLegacy('y', null);
    await insertLegacy('z', 'unresolved-forever');

    await backfill('apply');
    const afterFirst = await allRows();
    const second = await backfill('apply');
    expect(second.classifiedCanonicalOrganizationCount).toBe(0);
    expect(second.classifiedIntentionalGlobalCount).toBe(0);
    expect(second.quarantinedCount).toBe(0);
    expect(second.candidateCount).toBe(1);
    expect(await allRows()).toEqual(afterFirst);
  });

  it('small batches process every eligible row once; --start-after resumes with no missed / duplicated work', async () => {
    const ids = (
      await Promise.all([
        insertLegacy('r1', ORG_B1),
        insertLegacy('r2', ORG_A2),
        insertLegacy('r3', ORG_B1),
        insertLegacy('r4', null),
        insertLegacy('r5', ORG_A2),
      ])
    ).sort();

    const resumed = await backfill('apply', {
      batchSize: 2,
      startAfterId: ids[1],
    });
    expect(resumed.candidateCount).toBe(3);
    expect(resumed.startAfterId).toBe(ids[1]);

    const stillUnresolved = (await allRows())
      .filter((r) => r.ownershipState === 'unresolved_legacy')
      .map((r) => r.id)
      .sort();
    expect(stillUnresolved).toEqual([ids[0], ids[1]].sort());

    const finish = await backfill('apply', { batchSize: 2 });
    expect(finish.candidateCount).toBe(2);
    const final = await allRows();
    expect(final.every((r) => r.ownershipState !== 'unresolved_legacy')).toBe(
      true,
    );
    expect(
      final.filter((r) => r.ownershipState === 'canonical_organization'),
    ).toHaveLength(4);
  });
});

describe('runFeatureFlagOwnershipBackfill — expected-state concurrency protection (real DB)', () => {
  it('state/org changed to canonical before UPDATE: zero rows, reported, not overwritten', async () => {
    const id = await insertLegacy('race-state', ORG_B1);
    const report = await backfill('apply', {
      onBeforeRowUpdate: async (row) => {
        if (row.id !== id) return;
        await testDb.db.execute(
          sql`UPDATE feature_flags SET organization_id = ${ORG_A2}, ownership_state = 'canonical_organization' WHERE id = ${id}`,
        );
      },
    });
    expect(report.skippedConcurrentChangeCount).toBe(1);
    expect(report.classifiedCanonicalOrganizationCount).toBe(0);
    expect(await rowById(id)).toMatchObject({
      organizationId: ORG_A2,
      ownershipState: 'canonical_organization',
    });
  });

  it('A — legacy tenant_id NULL -> non-NULL before UPDATE: zero rows, never becomes intentional_global', async () => {
    const id = await insertLegacy('race-null', null);
    const report = await backfill('apply', {
      onBeforeRowUpdate: async (row) => {
        if (row.id !== id) return;
        await testDb.db.execute(
          sql`UPDATE feature_flags SET tenant_id = 'sneaked-in' WHERE id = ${id}`,
        );
      },
    });
    expect(report.skippedConcurrentChangeCount).toBe(1);
    expect(report.classifiedIntentionalGlobalCount).toBe(0);
    expect(await rowById(id)).toMatchObject({
      ownershipState: 'unresolved_legacy',
      organizationId: null,
      tenantId: 'sneaked-in',
    });
  });

  it('B — legacy tenant_id evidence changes before UPDATE: stale organization is never persisted', async () => {
    const id = await insertLegacy('race-org', ORG_B1);
    const report = await backfill('apply', {
      onBeforeRowUpdate: async (row) => {
        if (row.id !== id) return;
        await testDb.db.execute(
          sql`UPDATE feature_flags SET tenant_id = ${ORG_A2} WHERE id = ${id}`,
        );
      },
    });
    expect(report.skippedConcurrentChangeCount).toBe(1);
    expect(report.classifiedCanonicalOrganizationCount).toBe(0);
    expect(await rowById(id)).toMatchObject({
      ownershipState: 'unresolved_legacy',
      organizationId: null,
      tenantId: ORG_A2,
    });
  });
});

describe('runFeatureFlagOwnershipBackfill — bounded-memory reporting (real DB)', () => {
  it('the summary keeps only a capped sample; the onDecision sink receives every row-level decision', async () => {
    const total = 30;
    for (let i = 0; i < total; i += 1) {
      await insertLegacy(`u${i}`, 'no-authoritative-match');
    }

    const decisions: BackfillDecision[] = [];
    const report = await backfill('dry-run', {
      onDecision: (d) => {
        decisions.push(d);
      },
    });

    expect(report.candidateCount).toBe(total);
    expect(report.unresolvedCount).toBe(total);
    expect(report.unresolvedRowsSample.length).toBe(report.sampleLimit);
    expect(report.unresolvedRowsSample.length).toBeLessThan(total);
    expect(report.unresolvedRowsTruncated).toBe(true);
    expect(report.reasonCounts.unresolved_arbitrary_string).toBe(total);
    expect(decisions).toHaveLength(total);
    expect(decisions.every((d) => d.outcome === 'unresolved_legacy')).toBe(
      true,
    );
    expect(new Set(decisions.map((d) => d.runId)).size).toBe(1);
  });
});
