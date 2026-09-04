/** @vitest-environment node */
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { writeToDb } from './migrate';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·C P1 — `flags:migrate --from=static --to=db` must obey the
 * post-FF·B writer invariant. Static flags are always global, so a MISSING row
 * is inserted EXPLICITLY as `intentional_global` (never the `unresolved_legacy`
 * schema default). An EXISTING row is update-only.
 */

let testDb: TestDb;

// Guard rejects before any DB query, so this need not reference a real tenant.
const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';

const rowByKey = async (key: string) =>
  (
    await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.key, key))
  )[0];

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterEach(async () => {
  await testDb.db.delete(featureFlagsTable);
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('flags:migrate writeToDb — post-FF·B writer invariant (OZI-71 FF·C P1)', () => {
  it('A — a MISSING global row is created as intentional_global (organization_id NULL, tenant_id NULL); never unresolved_legacy', async () => {
    await writeToDb(testDb.db, {
      flags: [
        { key: 'mg-a', enabled: true, tenantId: null },
        { key: 'mg-b', enabled: false, tenantId: null },
      ],
    });

    for (const key of ['mg-a', 'mg-b']) {
      expect(await rowByKey(key)).toMatchObject({
        key,
        tenantId: null,
        organizationId: null,
        ownershipState: 'intentional_global',
      });
    }
    const legacy = await testDb.db
      .select()
      .from(featureFlagsTable)
      .where(eq(featureFlagsTable.ownershipState, 'unresolved_legacy'));
    expect(legacy).toHaveLength(0);
  });

  it('rejects a scoped entry rather than coercing it to a global row (defensive invariant)', async () => {
    await expect(
      writeToDb(testDb.db, {
        flags: [{ key: 'mg-scoped', enabled: true, tenantId: TENANT_A }],
      }),
    ).rejects.toThrow(/organization-scoped entr/i);

    expect(await rowByKey('mg-scoped')).toBeUndefined();
  });

  it('an EXISTING row is update-only — ownership_state is NOT reclassified (FF·C owns that)', async () => {
    // A pre-FF·B legacy global row.
    await testDb.db.execute(sql`
      INSERT INTO feature_flags (key, tenant_id, enabled, description)
      VALUES ('mg-hist', NULL, true, 'original')`);
    const before = await rowByKey('mg-hist');
    if (before === undefined) {
      throw new Error('Expected mg-hist fixture row to exist');
    }
    expect(before).toMatchObject({ ownershipState: 'unresolved_legacy' });

    await writeToDb(testDb.db, {
      flags: [{ key: 'mg-hist', enabled: false, tenantId: null }],
    });

    expect(await rowByKey('mg-hist')).toMatchObject({
      id: before.id,
      enabled: false,
      ownershipState: 'unresolved_legacy', // unchanged
      organizationId: null,
    });
  });
});
