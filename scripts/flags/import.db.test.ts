/** @vitest-environment node */
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { FlagsInputError, upsertFlags } from './import';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·C P1 — `flags:import` must obey the post-FF·B writer invariant:
 * a NEW `feature_flags` row is only ever created for a GLOBAL entry (as
 * `intentional_global`); a new organization-scoped row fails closed. Existing
 * rows are update-only — their `organization_id` / `ownership_state` are left
 * to FF·C's evidence-based historical classification.
 */

let testDb: TestDb;

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';

const rowByKey = async (key: string) =>
  (
    await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.key, key))
  )[0];

const countByKey = async (key: string) =>
  (
    await testDb.db
      .select({ n: sql<number>`count(*)::int` })
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.key, key))
  )[0]!.n;

beforeAll(async () => {
  testDb = await resolveTestDb();
  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES
        (${TENANT_A}, 'Tenant A'), (${TENANT_B}, 'Tenant B')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_B1}, ${TENANT_B}, 'Org B1')`,
  );
});

afterEach(async () => {
  await testDb.db.delete(featureFlagsTable);
});

afterAll(async () => {
  await testDb.db.execute(sql`DELETE FROM organizations WHERE id = ${ORG_B1}`);
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
  await testDb.cleanup();
});

describe('flags:import upsertFlags — post-FF·B writer invariant (OZI-71 FF·C P1)', () => {
  it('B — a MISSING global entry is inserted as intentional_global (never unresolved_legacy)', async () => {
    await upsertFlags(testDb.db, {
      flags: [{ key: 'imp-global', enabled: true, tenantId: null }],
    });

    expect(await rowByKey('imp-global')).toMatchObject({
      key: 'imp-global',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
    });
  });

  it('C — a MISSING organization-scoped entry FAILS CLOSED (FlagsInputError) with zero rows inserted', async () => {
    await expect(
      upsertFlags(testDb.db, {
        flags: [{ key: 'imp-scoped-new', enabled: true, tenantId: TENANT_A }],
      }),
    ).rejects.toBeInstanceOf(FlagsInputError);

    expect(await countByKey('imp-scoped-new')).toBe(0);
  });

  it('C — fail-closed happens BEFORE any write: a valid global entry alongside a new scoped one is NOT applied either', async () => {
    await expect(
      upsertFlags(testDb.db, {
        flags: [
          { key: 'imp-ok-global', enabled: true, tenantId: null },
          { key: 'imp-bad-scoped', enabled: true, tenantId: TENANT_A },
        ],
      }),
    ).rejects.toThrow(/organization-scoped feature flag/i);

    expect(await countByKey('imp-ok-global')).toBe(0);
    expect(await countByKey('imp-bad-scoped')).toBe(0);
  });

  it('D — an EXISTING unresolved_legacy scoped row: enabled/description update, ownership_state + organization_id UNCHANGED (FF·C still owns classification)', async () => {
    await testDb.db.execute(sql`
      INSERT INTO feature_flags (key, tenant_id, enabled, description)
      VALUES ('imp-hist', ${TENANT_A}, true, 'original')`);
    const before = await rowByKey('imp-hist');
    expect(before).toMatchObject({
      ownershipState: 'unresolved_legacy',
      organizationId: null,
    });

    await upsertFlags(testDb.db, {
      flags: [
        {
          key: 'imp-hist',
          enabled: false,
          description: 'updated',
          tenantId: TENANT_A,
        },
      ],
    });

    expect(await rowByKey('imp-hist')).toMatchObject({
      id: before!.id,
      key: 'imp-hist',
      tenantId: TENANT_A,
      enabled: false,
      description: 'updated',
      ownershipState: 'unresolved_legacy', // NOT reclassified
      organizationId: null,
    });
  });

  it('E — an EXISTING canonical_organization scoped row: value update PRESERVES canonical organization ownership', async () => {
    await testDb.db.execute(sql`
      INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
      VALUES ('imp-canon', ${ORG_B1}, ${ORG_B1}, 'canonical_organization', false)`);

    await upsertFlags(testDb.db, {
      flags: [{ key: 'imp-canon', enabled: true, tenantId: ORG_B1 }],
    });

    expect(await rowByKey('imp-canon')).toMatchObject({
      key: 'imp-canon',
      tenantId: ORG_B1,
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization', // preserved
      enabled: true, // updated
    });
  });

  it('an EXISTING global row: enabled/description update, still intentional_global', async () => {
    await upsertFlags(testDb.db, {
      flags: [{ key: 'imp-g2', enabled: false, tenantId: null }],
    });
    await upsertFlags(testDb.db, {
      flags: [
        { key: 'imp-g2', enabled: true, description: 'now on', tenantId: null },
      ],
    });

    expect(await rowByKey('imp-g2')).toMatchObject({
      ownershipState: 'intentional_global',
      organizationId: null,
      enabled: true,
      description: 'now on',
    });
  });

  it('A — duplicate MISSING global identities collapse to ONE intentional_global row, last input wins', async () => {
    await upsertFlags(testDb.db, {
      flags: [
        { key: 'dup-g', enabled: false, tenantId: null },
        { key: 'dup-g', enabled: true, tenantId: null },
      ],
    });

    expect(await countByKey('dup-g')).toBe(1);
    expect(await rowByKey('dup-g')).toMatchObject({
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true, // last input wins
    });
  });

  it('B — duplicate EXISTING global identities collapse to ONE row with the last input values', async () => {
    await upsertFlags(testDb.db, {
      flags: [{ key: 'dup-eg', enabled: true, tenantId: null }],
    });
    const before = await rowByKey('dup-eg');

    await upsertFlags(testDb.db, {
      flags: [
        { key: 'dup-eg', enabled: false, description: 'first', tenantId: null },
        { key: 'dup-eg', enabled: true, description: 'last', tenantId: null },
      ],
    });

    expect(await countByKey('dup-eg')).toBe(1);
    expect(await rowByKey('dup-eg')).toMatchObject({
      id: before!.id,
      ownershipState: 'intentional_global',
      enabled: true,
      description: 'last',
    });
  });

  it('C — duplicate EXISTING scoped identities: last input wins, ownership_state / organization_id preserved', async () => {
    await testDb.db.execute(sql`
      INSERT INTO feature_flags (key, tenant_id, organization_id, ownership_state, enabled)
      VALUES ('dup-es', ${ORG_B1}, ${ORG_B1}, 'canonical_organization', false)`);

    await upsertFlags(testDb.db, {
      flags: [
        {
          key: 'dup-es',
          enabled: false,
          description: 'first',
          tenantId: ORG_B1,
        },
        { key: 'dup-es', enabled: true, description: 'last', tenantId: ORG_B1 },
      ],
    });

    expect(await countByKey('dup-es')).toBe(1);
    expect(await rowByKey('dup-es')).toMatchObject({
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization',
      enabled: true,
      description: 'last',
    });
  });

  it('D — duplicate valid globals PLUS one missing scoped entry: FlagsInputError, zero writes for the whole batch', async () => {
    await expect(
      upsertFlags(testDb.db, {
        flags: [
          { key: 'dup-ok', enabled: false, tenantId: null },
          { key: 'dup-ok', enabled: true, tenantId: null },
          { key: 'dup-bad-scoped', enabled: true, tenantId: TENANT_A },
        ],
      }),
    ).rejects.toBeInstanceOf(FlagsInputError);

    expect(await countByKey('dup-ok')).toBe(0);
    expect(await countByKey('dup-bad-scoped')).toBe(0);
  });

  it('never leaves an unresolved_legacy row behind across any of the supported import paths', async () => {
    await testDb.db.execute(sql`
      INSERT INTO feature_flags (key, tenant_id, enabled) VALUES ('imp-hist2', ${TENANT_A}, true)`);
    await upsertFlags(testDb.db, {
      flags: [
        { key: 'imp-newglobal', enabled: true, tenantId: null },
        { key: 'imp-hist2', enabled: false, tenantId: TENANT_A },
      ],
    });
    const rows = await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(
        and(
          eq(featureFlagsTable.ownershipState, 'unresolved_legacy'),
          eq(featureFlagsTable.key, 'imp-newglobal'),
        ),
      );
    expect(rows).toHaveLength(0); // the NEW row is not legacy
  });
});
