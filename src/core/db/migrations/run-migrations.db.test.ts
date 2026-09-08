/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  inject,
} from 'vitest';

import { AudAConvergenceError } from '@/core/db/post-migrate-steps';
import type { DbDriver } from '@/core/db/types';

import { getRuntimeDiagnosticState } from '@/shared/lib/observability/runtime-diagnostic-state';

import { runMigrations } from './run-migrations';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 AUD·A — real-database orchestration contract for `runMigrations`.
 *
 * `runMigrations` runs the drizzle migrator and THEN the AUD·A post-migrate
 * convergence in `enforce` mode. After it returns, the journal is at head, so
 * a missing required AUD·A object is a hard failure — not a silent no-op.
 *
 * This file is `*.db.test.ts` so it runs in the standard executed DB gates:
 *   pnpm test:db            (PGlite fallback — fast, no external DB)
 *   pnpm test:db:local      (real Postgres on 127.0.0.1:5433)
 *   pnpm test:db:ci         (Testcontainers Postgres — the required CI job)
 * The previous mock-based `run-migrations.test.ts` lived under
 * `src/core/db/migrations/**`, which `vitest.unit.config.ts` excludes, so no
 * standard gate executed it.
 */

const FK_EVENTS = 'audit_events_organization_id_organizations_id_fk';
const FK_SETTINGS = 'audit_log_settings_organization_id_organizations_id_fk';

const EXPAND_WHEN = (
  JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'src/core/db/migrations/generated/meta/_journal.json',
      ),
      'utf8',
    ),
  ) as { entries: Array<{ tag: string; when: number }> }
).entries.find((e) => e.tag === '0023_breezy_sandman')?.when;

const testUrl =
  (inject('TEST_DATABASE_URL') as string | undefined) ??
  process.env.TEST_DATABASE_URL?.trim();
const driver: DbDriver = testUrl ? 'postgres' : 'pglite';

let testDb: TestDb;

async function fkConvalidated(name: string): Promise<boolean | null> {
  const res = await testDb.db.execute(
    sql`SELECT convalidated FROM pg_constraint WHERE conname = ${name}`,
  );
  const rows = (
    Array.isArray(res) ? res : (res as { rows: unknown[] }).rows
  ) as Array<{ convalidated: boolean }>;
  return rows[0] ? rows[0].convalidated : null;
}

/** Drop 0023's objects + journal row so the next `runMigrations` fully
 * replays the expand migration and re-converges. */
async function reconstructPre0023(): Promise<void> {
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
}

beforeAll(async () => {
  // `resolveTestDb()` itself calls `runMigrations` — reaching this line already
  // proves the happy path (migrator + enforce convergence) succeeds.
  testDb = await resolveTestDb();
});

afterEach(async () => {
  // A converged schema makes this a no-op. If a test left it unconvergeable,
  // fully reconstruct and replay 0023.
  try {
    await runMigrations(testDb.db, driver, { postgresUrl: testUrl });
  } catch {
    await reconstructPre0023();
    await runMigrations(testDb.db, driver, { postgresUrl: testUrl });
  }
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('runMigrations — AUD·A orchestration (real DB)', () => {
  it('succeeds and is idempotent: a second run is a clean no-op on a converged database', async () => {
    await expect(
      runMigrations(testDb.db, driver, { postgresUrl: testUrl }),
    ).resolves.toBeUndefined();

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

    expect(await fkConvalidated(FK_EVENTS)).toBe(true);
    expect(await fkConvalidated(FK_SETTINGS)).toBe(true);
  });

  it('FAILS CLOSED: a required AUD·A FK missing after the migrator (journal at head) makes runMigrations reject', async () => {
    // Drop a deferred FK without touching the journal — the migrator no-ops
    // (nothing pending) and the enforce-mode convergence must throw.
    await testDb.db.execute(
      sql`ALTER TABLE audit_events DROP CONSTRAINT ${sql.raw(`"${FK_EVENTS}"`)}`,
    );
    expect(await fkConvalidated(FK_EVENTS)).toBeNull();

    let thrown: unknown;
    try {
      await runMigrations(testDb.db, driver, { postgresUrl: testUrl });
    } catch (err) {
      thrown = err;
    }
    expect(
      thrown,
      'runMigrations must reject when a required FK is absent',
    ).toBeDefined();

    const chain: string[] = [];
    let cur: unknown = thrown;
    for (let i = 0; i < 8 && cur; i += 1) {
      if (cur instanceof Error) {
        chain.push(cur.message);
        cur = (cur as { cause?: unknown }).cause;
      } else break;
    }
    const isConvergenceFailure =
      thrown instanceof AudAConvergenceError ||
      chain.some((m) => /post-migrate-steps|required foreign key/i.test(m));
    expect(isConvergenceFailure).toBe(true);

    // Restore the FK so `afterEach`'s `runMigrations` stays a clean no-op.
    await testDb.db.execute(
      sql`ALTER TABLE audit_events ADD CONSTRAINT ${sql.raw(`"${FK_EVENTS}"`)}
          FOREIGN KEY ("organization_id")
          REFERENCES public.organizations(id) ON DELETE SET NULL NOT VALID`,
    );
    await testDb.db.execute(
      sql`ALTER TABLE audit_events VALIDATE CONSTRAINT ${sql.raw(`"${FK_EVENTS}"`)}`,
    );
  });

  // These two exercise the postgres-only pre-migrator validation. `testDb.db`
  // is never touched — the rejection happens before the migrator dispatch —
  // so they run in every DB lane regardless of the actual driver.
  it("driver 'postgres' without postgresUrl is rejected without leaking migrationActiveCount", async () => {
    const diag = getRuntimeDiagnosticState();
    const before = diag.migrationActiveCount;

    await expect(runMigrations(testDb.db, 'postgres')).rejects.toThrow(
      /requires options\.postgresUrl/i,
    );

    // Rejection went through try/catch/finally: the counter is balanced.
    expect(diag.migrationActiveCount).toBe(before);
  });

  it('a POOLED postgresUrl is rejected fail-closed without leaking migrationActiveCount', async () => {
    const diag = getRuntimeDiagnosticState();
    const before = diag.migrationActiveCount;

    await expect(
      runMigrations(testDb.db, 'postgres', {
        postgresUrl: 'postgresql://u:p@ep-x-pooler.us-east-1.aws.neon.tech/app',
      }),
    ).rejects.toThrow(/DIRECT \(unpooled\)/i);

    expect(diag.migrationActiveCount).toBe(before);
  });

  it('refuses to run in the Edge runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';
    try {
      await expect(
        runMigrations(testDb.db, driver, { postgresUrl: testUrl }),
      ).rejects.toThrow(/not supported in Edge runtime/i);
    } finally {
      delete process.env.NEXT_RUNTIME;
    }
  });
});
