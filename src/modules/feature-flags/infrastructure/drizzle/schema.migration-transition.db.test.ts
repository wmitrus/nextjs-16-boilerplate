/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { asc, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';

import { runMigrations } from '@/core/db/migrations/run-migrations';
import type { DbDriver } from '@/core/db/types';

import { featureFlagsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 FF·A — real migration-transition test for migration 0021.
 *
 * Proves the primary FF·A migration invariant against rows that already exist
 * BEFORE 0021 is applied (not rows inserted afterwards): every historical
 * `feature_flags` row is initialized to the fail-closed `unresolved_legacy`
 * with a NULL `organization_id`, its legacy `tenant_id` untouched, and a
 * historical `tenant_id IS NULL` row is never promoted to `intentional_global`.
 *
 * It reconstructs the post-0020 state (drop 0021's additive objects + its
 * migration-bookkeeping row), inserts legacy-shaped rows, then re-applies 0021
 * through the repository's own migration runner (`runMigrations`) — a real
 * PostgreSQL DDL transition, not an SQL-text inspection and not a post-migration
 * insert.
 *
 * Serialized DB runs only: `pnpm test:db:local` (real Postgres, fileParallelism
 * false) or the default PGlite runner (a fresh in-memory instance per file).
 */

const JOURNAL_PATH = resolve(
  process.cwd(),
  'src/core/db/migrations/generated/meta/_journal.json',
);
const FFA_MIGRATION_TAG = '0021_sweet_thaddeus_ross';
const FFA_MIGRATION_WHEN = (
  JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>;
  }
).entries.find((e) => e.tag === FFA_MIGRATION_TAG)?.when;

const HIST_KEY_TENANT = 'hist-legacy-tenant';
const HIST_KEY_NULL = 'hist-legacy-null';

// Mirrors `resolveTestDb`'s own driver detection so `runMigrations` gets the
// matching migrator.
const testUrl =
  (inject('TEST_DATABASE_URL') as string | undefined) ??
  process.env.TEST_DATABASE_URL?.trim();
const driver: DbDriver = testUrl ? 'postgres' : 'pglite';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  // Guarantee the shared schema is back at 0021 regardless of where the test
  // stopped, then drop this suite's rows.
  await runMigrations(testDb.db, driver);
  await testDb.cleanup();
});

describe('feature_flags — OZI-71 FF·A migration 0021 transition (real DB)', () => {
  it('initializes pre-0021 historical rows to unresolved_legacy / NULL organization_id, tenant_id unchanged', async () => {
    expect(FFA_MIGRATION_WHEN, 'journal entry for 0021 must exist').toBeTypeOf(
      'number',
    );

    // 1. Reconstruct the post-0020 state: drop 0021's additive objects
    //    (CASCADE also removes its FK, both indexes and the CHECK) and its
    //    migration-bookkeeping row so the runner re-applies ONLY 0021.
    await testDb.db.execute(
      sql`ALTER TABLE feature_flags
            DROP COLUMN IF EXISTS ownership_state CASCADE,
            DROP COLUMN IF EXISTS organization_id CASCADE`,
    );
    await testDb.db.execute(
      sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${FFA_MIGRATION_WHEN}`,
    );

    // 2. Insert legacy-shaped rows that predate 0021.
    await testDb.db.execute(
      sql`INSERT INTO feature_flags (key, tenant_id, enabled) VALUES
            (${HIST_KEY_TENANT}, 'legacy-tenant', true),
            (${HIST_KEY_NULL}, NULL, false)`,
    );

    // 3. Apply 0021 as a real migration transition via the repo's runner.
    await runMigrations(testDb.db, driver);

    // 4. Read those exact rows back.
    const rows = await testDb.db
      .select({
        key: featureFlagsTable.key,
        tenantId: featureFlagsTable.tenantId,
        organizationId: featureFlagsTable.organizationId,
        ownershipState: featureFlagsTable.ownershipState,
      })
      .from(featureFlagsTable)
      .where(inArray(featureFlagsTable.key, [HIST_KEY_TENANT, HIST_KEY_NULL]))
      .orderBy(asc(featureFlagsTable.key));

    const rowTenant = rows.find((r) => r.key === HIST_KEY_TENANT);
    const rowNull = rows.find((r) => r.key === HIST_KEY_NULL);

    for (const row of [rowTenant, rowNull]) {
      expect(row).toBeDefined();
      expect(row?.ownershipState).toBe('unresolved_legacy');
      expect(row?.organizationId).toBeNull();
    }

    // Legacy tenant_id is preserved verbatim by the additive migration.
    expect(rowTenant?.tenantId).toBe('legacy-tenant');
    expect(rowNull?.tenantId).toBeNull();

    // The historical tenant_id IS NULL row must NOT be read as global.
    expect(rowNull?.ownershipState).not.toBe('intentional_global');

    // 5. The CHECK the transition installed is NOT VALID — the historical
    //    back-scan is deferred to a later `VALIDATE CONSTRAINT` (plan §14a.9).
    const con = await testDb.db.execute(
      sql`SELECT convalidated
          FROM pg_constraint
          WHERE conname = 'ck_feature_flags_ownership_state_org'`,
    );
    const conRows = (
      Array.isArray(con) ? con : (con as { rows: unknown[] }).rows
    ) as Array<{ convalidated: boolean }>;
    expect(conRows).toHaveLength(1);
    expect(conRows[0]?.convalidated).toBe(false);
  });
});
