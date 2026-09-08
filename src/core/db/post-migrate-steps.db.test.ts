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

import { runMigrations } from '@/core/db/migrations/run-migrations';
import {
  AUD_A_DEFERRED_FK_VALIDATIONS,
  AUDIT_EVENTS_ORGANIZATION_INDEX,
  AudAConvergenceError,
  DeferredIndexDefinitionMismatchError,
  ensureDeferredIndexes,
  runAudAPostMigrateSteps,
  sqlRunnerFromDrizzle,
  sqlRunnerFromPostgres,
  validateDeferredForeignKeys,
  type IndexBuildMode,
  type SqlRunner,
} from '@/core/db/post-migrate-steps';
import type { DbDriver } from '@/core/db/types';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

/**
 * OZI-71 AUD·A — real-database coverage for the post-migrate convergence
 * executors (`post-migrate-steps.ts`): the executors themselves, the
 * enforce-vs-inspect gate, idempotent rerun, and (real Postgres only) that the
 * `lock_timeout` policy actually aborts a blocked build. PGlite by default;
 * real Postgres under `pnpm test:db:local` / `pnpm test:db:ci`.
 */

const GEN_DIR = resolve(process.cwd(), 'src/core/db/migrations/generated');
const JOURNAL_PATH = resolve(GEN_DIR, 'meta/_journal.json');
const EXPAND_WHEN = (
  JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as {
    entries: Array<{ tag: string; when: number }>;
  }
).entries.find((e) => e.tag === '0023_breezy_sandman')?.when;

const INDEX = AUDIT_EVENTS_ORGANIZATION_INDEX;

const testUrl =
  (inject('TEST_DATABASE_URL') as string | undefined) ??
  process.env.TEST_DATABASE_URL?.trim();
const driver: DbDriver = testUrl ? 'postgres' : 'pglite';
const mode: IndexBuildMode = driver === 'pglite' ? 'plain' : 'concurrent';
const isRealPg = driver === 'postgres';

let testDb: TestDb;
let runner: SqlRunner;

async function indexState(): Promise<{
  exists: boolean;
  valid: boolean;
  def: string | null;
}> {
  const rows = await runner.query<{ indisvalid: boolean; indexdef: string }>(
    `select i.indisvalid, pg_get_indexdef(i.indexrelid) as indexdef
       from pg_class c
       join pg_index i on i.indexrelid = c.oid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = '${INDEX.name}'`,
  );
  return rows[0]
    ? { exists: true, valid: rows[0].indisvalid, def: rows[0].indexdef }
    : { exists: false, valid: false, def: null };
}

async function fkConvalidated(name: string): Promise<boolean | null> {
  const rows = await runner.query<{ convalidated: boolean }>(
    `select convalidated from pg_constraint where conname = '${name}'`,
  );
  return rows[0] ? rows[0].convalidated : null;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await runner.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = '${table}' and column_name = '${column}'`,
  );
  return rows.length > 0;
}

/**
 * `postgres-js` wraps driver errors in drizzle's `DrizzleQueryError` whose
 * top-level `message` is only `"Failed query: ..."`; the real Postgres error
 * (`canceling statement due to lock timeout`, code `55P03`) lives on `.cause`.
 * Walk the chain so an assertion can match the real cause.
 */
function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(' | ');
}

/** Drop both audit tables' AUD·A objects and the 0023 journal row, so the next
 * `runMigrations` replays 0023 from scratch. */
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
  testDb = await resolveTestDb();
  runner = sqlRunnerFromDrizzle(testDb.db, (text) => sql.raw(text));
  // `resolveTestDb` → `runMigrations` already ran the enforce-mode post step.
  await runAudAPostMigrateSteps(runner, mode);
});

afterEach(async () => {
  // Full reconstruction so a test that dropped a column / FK / index — or left
  // a VALID wrong-definition index (fail-closed, never auto-dropped) — cannot
  // leave the enforce-mode post-step in `afterEach` unable to converge. The
  // explicit index drop is needed because a wrong-def index on other columns
  // is not removed by `DROP COLUMN organization_id CASCADE`.
  await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
  await reconstructPre0023();
  await runMigrations(testDb.db, driver, { postgresUrl: testUrl });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('ensureDeferredIndexes executor', () => {
  it('is an idempotent skip when the index already exists and matches', async () => {
    const outcomes = await ensureDeferredIndexes(runner, mode);
    expect(outcomes).toEqual([{ name: INDEX.name, action: 'skip' }]);
    expect((await indexState()).valid).toBe(true);
  });

  it('creates the index when it is absent, valid and matching the expected definition', async () => {
    await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
    expect((await indexState()).exists).toBe(false);

    const outcomes = await ensureDeferredIndexes(runner, mode);
    expect(outcomes).toEqual([{ name: INDEX.name, action: 'create' }]);

    const st = await indexState();
    expect(st.exists && st.valid).toBe(true);
    expect(st.def).toMatch(
      /audit_events USING btree \(organization_id, occurred_at\)/,
    );
  });

  it('FAILS CLOSED on a same-name VALID index with a different definition; never drops it', async () => {
    await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
    await runner.query(
      `CREATE INDEX "${INDEX.name}" ON "audit_events" USING btree ("occurred_at")`,
    );

    await expect(ensureDeferredIndexes(runner, mode)).rejects.toBeInstanceOf(
      DeferredIndexDefinitionMismatchError,
    );
    // Left untouched (fail closed, not silently fixed).
    expect((await indexState()).def).toMatch(/\(occurred_at\)/);
  });

  it.skipIf(!isRealPg)(
    'recovers an INVALID index by dropping and rebuilding it (real Postgres)',
    async () => {
      await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
      await runner.query(
        `CREATE INDEX "${INDEX.name}" ON "audit_events" USING btree ("organization_id","occurred_at")`,
      );
      await runner.query(
        `UPDATE pg_index SET indisvalid = false
           WHERE indexrelid = '"public"."${INDEX.name}"'::regclass`,
      );
      expect((await indexState()).valid).toBe(false);

      const outcomes = await ensureDeferredIndexes(runner, mode);
      expect(outcomes).toEqual([
        { name: INDEX.name, action: 'recreate-invalid' },
      ]);
      expect((await indexState()).valid).toBe(true);
    },
  );

  it('inspect mode reports "create" without mutating', async () => {
    await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
    const outcomes = await ensureDeferredIndexes(runner, mode, undefined, {
      enforcement: 'inspect',
    });
    expect(outcomes).toEqual([{ name: INDEX.name, action: 'create' }]);
    expect((await indexState()).exists).toBe(false);
  });
});

describe('validateDeferredForeignKeys executor', () => {
  it('validates a NOT VALID FK and is then an idempotent skip', async () => {
    const fk = AUD_A_DEFERRED_FK_VALIDATIONS[0]!; // audit_events
    await runner.query(
      `ALTER TABLE "${fk.table}" DROP CONSTRAINT "${fk.constraint}"`,
    );
    await runner.query(
      `ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.constraint}"
         FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
         ON DELETE set null ON UPDATE no action NOT VALID`,
    );
    // A fresh lookup sees it NOT VALID — proof the ADD committed on its own,
    // separate from any VALIDATE below (transaction-boundary check).
    expect(await fkConvalidated(fk.constraint)).toBe(false);

    const first = await validateDeferredForeignKeys(runner, [fk]);
    expect(first).toEqual([{ constraint: fk.constraint, action: 'validate' }]);
    expect(await fkConvalidated(fk.constraint)).toBe(true);

    const second = await validateDeferredForeignKeys(runner, [fk]);
    expect(second).toEqual([{ constraint: fk.constraint, action: 'skip' }]);
  });
});

describe('enforce vs inspect gate (fix 2)', () => {
  it('enforce: throws AudAConvergenceError when organization_id is absent', async () => {
    await reconstructPre0023(); // columns dropped, 0023 not re-applied
    expect(await columnExists('audit_events', 'organization_id')).toBe(false);

    await expect(
      runAudAPostMigrateSteps(runner, mode, { enforcement: 'enforce' }),
    ).rejects.toBeInstanceOf(AudAConvergenceError);
  });

  it('enforce: throws AudAConvergenceError when a required FK is absent', async () => {
    const fk = AUD_A_DEFERRED_FK_VALIDATIONS[1]!; // audit_log_settings
    await runner.query(
      `ALTER TABLE "${fk.table}" DROP CONSTRAINT "${fk.constraint}"`,
    );
    expect(await fkConvalidated(fk.constraint)).toBeNull();

    await expect(
      runAudAPostMigrateSteps(runner, mode, { enforcement: 'enforce' }),
    ).rejects.toBeInstanceOf(AudAConvergenceError);
  });

  it('inspect: pre-0023 reports deferred/missing without mutating', async () => {
    await reconstructPre0023();
    expect(await columnExists('audit_events', 'organization_id')).toBe(false);

    const result = await runAudAPostMigrateSteps(runner, mode, {
      enforcement: 'inspect',
    });
    expect(result.indexes[0]?.action).toBe('deferred');
    expect(result.foreignKeys.map((f) => f.action)).toEqual([
      'missing',
      'missing',
    ]);
    // no mutation
    expect((await indexState()).exists).toBe(false);
  });

  it('normal 0022 -> 0023 -> convergence succeeds, and rerun is idempotent', async () => {
    await reconstructPre0023();

    // 0023 via the bare migrator (no wrapper), then enforce convergence.
    if (driver === 'pglite') {
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await migrate(testDb.db as any, { migrationsFolder: GEN_DIR });
    } else {
      const { migrate } = await import('drizzle-orm/postgres-js/migrator');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await migrate(testDb.db as any, { migrationsFolder: GEN_DIR });
    }

    // After the migrator alone: index absent, both FKs NOT VALID (proves the
    // migrator's transaction committed and released its locks before VALIDATE).
    expect((await indexState()).exists).toBe(false);
    for (const fk of AUD_A_DEFERRED_FK_VALIDATIONS) {
      expect(await fkConvalidated(fk.constraint)).toBe(false);
    }

    const first = await runAudAPostMigrateSteps(runner, mode, {
      enforcement: 'enforce',
    });
    expect(first.indexes).toEqual([{ name: INDEX.name, action: 'create' }]);
    expect(first.foreignKeys.map((f) => f.action)).toEqual([
      'validate',
      'validate',
    ]);
    const st = await indexState();
    expect(st.exists && st.valid).toBe(true);
    for (const fk of AUD_A_DEFERRED_FK_VALIDATIONS) {
      expect(await fkConvalidated(fk.constraint)).toBe(true);
    }

    // Rerun: pure no-op.
    const second = await runAudAPostMigrateSteps(runner, mode, {
      enforcement: 'enforce',
    });
    expect(second.indexes).toEqual([{ name: INDEX.name, action: 'skip' }]);
    expect(second.foreignKeys.map((f) => f.action)).toEqual(['skip', 'skip']);
  });
});

describe('timeout policy actually enforced on a session-affine connection (fixes 1 + 2, real Postgres)', () => {
  it.skipIf(!isRealPg)(
    'lock_timeout aborts a blocked CONCURRENTLY build within a few seconds — SET and CREATE INDEX share one session',
    async () => {
      const postgres = (await import('postgres')).default;
      await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);

      // A dedicated single-connection client == one explicit PostgreSQL
      // session, exactly what `runMigrations`/`db-migrate-prod` reserve for
      // the convergence. `SET lock_timeout` and the `CREATE INDEX
      // CONCURRENTLY` it governs run on THIS connection.
      const affineClient = postgres(testUrl!, { max: 1 });
      const affineRunner = sqlRunnerFromPostgres(affineClient);
      const blocker = postgres(testUrl!, { max: 1 });

      try {
        // Hold ACCESS EXCLUSIVE on audit_events in another session.
        const held = blocker
          .begin(async (tx) => {
            await tx.unsafe('LOCK TABLE audit_events IN ACCESS EXCLUSIVE MODE');
            await new Promise((r) => setTimeout(r, 15_000));
          })
          .catch(() => undefined);

        const started = Date.now();
        let thrown: unknown;
        try {
          await ensureDeferredIndexes(affineRunner, 'concurrent');
        } catch (err) {
          thrown = err;
        }
        expect(
          thrown,
          'the blocked CONCURRENTLY build must abort',
        ).toBeDefined();
        // The real Postgres cause (55P03) is wrapped by drizzle — match the chain.
        expect(errorChainText(thrown)).toMatch(
          /lock[_ ]timeout|canceling statement due to lock timeout|55P03/i,
        );
        // lock_timeout is 3s; allow generous CI slack but far below the 15s hold.
        expect(Date.now() - started).toBeLessThan(12_000);

        await held;
      } finally {
        await affineClient.end({ timeout: 5 });
        await blocker.end({ timeout: 5 });
      }
    },
  );

  it.skipIf(!isRealPg)(
    "0023's SET LOCAL timeouts do not leak past its reset — a later statement in the same outer transaction runs under the default (fix 1 reset contract)",
    async () => {
      const postgres = (await import('postgres')).default;
      const c = postgres(testUrl!, { max: 1 });
      try {
        const r = await c.begin(async (tx) => {
          const before = (await tx.unsafe('SHOW statement_timeout')) as Array<{
            statement_timeout: string;
          }>;
          // 0023's wrapper.
          await tx.unsafe("SET LOCAL lock_timeout = '3s'");
          await tx.unsafe("SET LOCAL statement_timeout = '30s'");
          const mid = (await tx.unsafe('SHOW statement_timeout')) as Array<{
            statement_timeout: string;
          }>;
          // 0023's reset (the last two statements of 0023_breezy_sandman.sql).
          await tx.unsafe('SET LOCAL lock_timeout = DEFAULT');
          await tx.unsafe('SET LOCAL statement_timeout = DEFAULT');
          const afterStmt = (await tx.unsafe(
            'SHOW statement_timeout',
          )) as Array<{ statement_timeout: string }>;
          const afterLock = (await tx.unsafe('SHOW lock_timeout')) as Array<{
            lock_timeout: string;
          }>;
          return {
            before: before[0]!.statement_timeout,
            mid: mid[0]!.statement_timeout,
            afterStmt: afterStmt[0]!.statement_timeout,
            afterLock: afterLock[0]!.lock_timeout,
          };
        });
        expect(r.mid).toBe('30s'); // scoped inside 0023
        expect(r.afterStmt).toBe(r.before); // reset for whatever runs next
        expect(r.afterStmt).not.toBe('30s');
        expect(r.afterLock).not.toBe('3s');
      } finally {
        await c.end({ timeout: 5 });
      }
    },
  );
});
