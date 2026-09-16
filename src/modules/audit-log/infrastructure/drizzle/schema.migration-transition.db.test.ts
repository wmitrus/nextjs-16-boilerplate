/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { asc, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';

import { runMigrations } from '@/core/db/migrations/run-migrations';
import type { DbDriver } from '@/core/db/types';

import { auditEventsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 AUD·A — real migration-forward test for the `0023` expand migration
 * plus the post-migrate convergence step (`runMigrations` runs both), against
 * a SEEDED `audit_events` fixture that already exists BEFORE the expand
 * migration is applied.
 *
 * Proves the core AUD·A invariant on historical rows (not rows inserted
 * afterwards): every pre-existing `audit_events` row lands in the fail-closed
 * `unresolved_legacy` state with a NULL `organization_id`, its legacy
 * `tenant_id` untouched, and a historical `tenant_id IS NULL` row is never
 * promoted to `intentional_global`. Also proves the end state: the FKs are
 * validated by the post-migrate step, the ownership CHECK is left NOT VALID,
 * and the organization index exists and is valid.
 *
 * It reconstructs the post-0022 state (drop the additive objects on both audit
 * tables + the migration-bookkeeping rows for 0023 and everything after it,
 * since drizzle's migrate() decides what to apply from the LATEST recorded
 * timestamp), seeds legacy-shaped rows, then re-applies through the
 * repository's own migration runner — a real PostgreSQL DDL transition.
 */

const JOURNAL_PATH = resolve(
  process.cwd(),
  'src/core/db/migrations/generated/meta/_journal.json',
);
const EXPAND_TAG = '0023_breezy_sandman';
const EXPAND_WHEN = (
  JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>;
  }
).entries.find((e) => e.tag === EXPAND_TAG)?.when;

// Seeded fixture: legacy audit_events rows that predate 0023.
const FIXTURE = [
  { action: 'seed-1', tenant: 'seed-org-uuid-a' },
  { action: 'seed-2', tenant: 'seed-org-uuid-a' },
  { action: 'seed-3', tenant: 'seed-tenant-uuid' },
  { action: 'seed-4', tenant: 'org_provider_raw' },
  { action: 'seed-5', tenant: 'arbitrary-admin-string' },
  { action: 'seed-6', tenant: null },
] as const;
const FIXTURE_ACTIONS = FIXTURE.map((f) => f.action);

const testUrl =
  (inject('TEST_DATABASE_URL') as string | undefined) ??
  process.env.TEST_DATABASE_URL?.trim();
const driver: DbDriver = testUrl ? 'postgres' : 'pglite';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  // Restore the shared schema to head regardless of where the test stopped,
  // then drop this suite's rows.
  await runMigrations(testDb.db, driver, { postgresUrl: testUrl });
  await testDb.db.execute(
    sql`DELETE FROM audit_events WHERE action IN (${sql.join(
      FIXTURE_ACTIONS.map((a) => sql`${a}`),
      sql`, `,
    )})`,
  );
  await testDb.cleanup();
});

describe('audit_events — OZI-71 AUD·A migration-forward transition (real DB)', () => {
  it('initializes every seeded pre-0023 row to unresolved_legacy / NULL organization_id, tenant_id unchanged', async () => {
    expect(EXPAND_WHEN, 'journal entry for 0023 must exist').toBeTypeOf(
      'number',
    );

    // 1. Reconstruct the post-0022 state on both audit tables. CASCADE also
    //    drops the FKs, the settings indexes, both CHECKs, and the
    //    organization index that depends on the dropped columns.
    await testDb.db.execute(
      sql`ALTER TABLE audit_events
            DROP COLUMN IF EXISTS ownership_state CASCADE,
            DROP COLUMN IF EXISTS organization_id CASCADE`,
    );
    await testDb.db.execute(
      sql`ALTER TABLE audit_log_settings
            DROP COLUMN IF EXISTS ownership_state CASCADE,
            DROP COLUMN IF EXISTS organization_id CASCADE`,
    );
    await testDb.db.execute(
      sql`DELETE FROM drizzle.__drizzle_migrations WHERE created_at >= ${EXPAND_WHEN}`,
    );

    // 2. Seed legacy-shaped rows that predate 0023.
    for (const row of FIXTURE) {
      await testDb.db.execute(
        sql`INSERT INTO audit_events (category, action, outcome, tenant_id)
            VALUES ('auth', ${row.action}, 'success', ${row.tenant})`,
      );
    }

    // 3. Apply 0023 + the post-migrate convergence step (runMigrations does both).
    await runMigrations(testDb.db, driver, { postgresUrl: testUrl });

    // 4. Read the seeded rows back.
    const rows = await testDb.db
      .select({
        action: auditEventsTable.action,
        tenantId: auditEventsTable.tenantId,
        organizationId: auditEventsTable.organizationId,
        ownershipState: auditEventsTable.ownershipState,
      })
      .from(auditEventsTable)
      .where(
        sql`${auditEventsTable.action} IN (${sql.join(
          FIXTURE_ACTIONS.map((a) => sql`${a}`),
          sql`, `,
        )})`,
      )
      .orderBy(asc(auditEventsTable.action));

    expect(rows).toHaveLength(FIXTURE.length);

    for (const row of rows) {
      expect(row.ownershipState, row.action).toBe('unresolved_legacy');
      expect(row.organizationId, row.action).toBeNull();
    }

    // Legacy tenant_id preserved verbatim, including the NULL row — which is
    // NEVER promoted to intentional_global.
    const byAction = new Map(rows.map((r) => [r.action, r]));
    expect(byAction.get('seed-1')?.tenantId).toBe('seed-org-uuid-a');
    expect(byAction.get('seed-4')?.tenantId).toBe('org_provider_raw');
    expect(byAction.get('seed-6')?.tenantId).toBeNull();
    expect(byAction.get('seed-6')?.ownershipState).not.toBe(
      'intentional_global',
    );
  });

  it('after the transition: FKs validated by the post-migrate step, ownership CHECK still NOT VALID, organization index valid', async () => {
    const cons = await testDb.db.execute(
      sql`SELECT conname, convalidated FROM pg_constraint
          WHERE conname IN (
            'audit_events_organization_id_organizations_id_fk',
            'audit_log_settings_organization_id_organizations_id_fk',
            'ck_audit_events_ownership_state_org',
            'ck_audit_log_settings_ownership_state_org'
          )`,
    );
    const conRows = (
      Array.isArray(cons) ? cons : (cons as { rows: unknown[] }).rows
    ) as Array<{ conname: string; convalidated: boolean }>;
    const state = new Map(conRows.map((r) => [r.conname, r.convalidated]));

    expect(state.get('audit_events_organization_id_organizations_id_fk')).toBe(
      true,
    );
    expect(
      state.get('audit_log_settings_organization_id_organizations_id_fk'),
    ).toBe(true);
    expect(state.get('ck_audit_events_ownership_state_org')).toBe(false);
    expect(state.get('ck_audit_log_settings_ownership_state_org')).toBe(false);

    const idx = await testDb.db.execute(
      sql`SELECT i.indisvalid
          FROM pg_class c
          JOIN pg_index i ON i.indexrelid = c.oid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = 'idx_audit_events_organization_occurred'`,
    );
    const idxRows = (
      Array.isArray(idx) ? idx : (idx as { rows: unknown[] }).rows
    ) as Array<{ indisvalid: boolean }>;
    expect(idxRows).toHaveLength(1);
    expect(idxRows[0]?.indisvalid).toBe(true);
  });
});
