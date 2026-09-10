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
  DeferredForeignKeyDefinitionMismatchError,
  DeferredIndexDefinitionMismatchError,
  ensureDeferredIndexes,
  gatherAudAConvergenceEvidence,
  inspectAudAConvergence,
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
    'recovers an EXACT interrupted INVALID index by dropping and rebuilding it (real Postgres)',
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

  it.skipIf(!isRealPg)(
    'Codex P2: an INVALID same-name WRONG-definition index is a HARD FAIL and is NEVER dropped/rebuilt (real Postgres)',
    async () => {
      await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
      // Same NAME, wrong columns; then forced INVALID via the catalog.
      await runner.query(
        `CREATE INDEX "${INDEX.name}" ON "audit_events" USING btree ("occurred_at")`,
      );
      await runner.query(
        `UPDATE pg_index SET indisvalid = false
           WHERE indexrelid = '"public"."${INDEX.name}"'::regclass`,
      );
      const before = await indexState();
      expect(before.exists && !before.valid).toBe(true);
      expect(before.def).toMatch(/\(occurred_at\)/);

      await expect(ensureDeferredIndexes(runner, mode)).rejects.toBeInstanceOf(
        DeferredIndexDefinitionMismatchError,
      );
      await expect(
        runAudAPostMigrateSteps(runner, mode, { enforcement: 'enforce' }),
      ).rejects.toBeInstanceOf(DeferredIndexDefinitionMismatchError);

      // Byte-identical: the wrong INVALID index was NOT dropped or rebuilt.
      const after = await indexState();
      expect(after).toEqual(before);
    },
  );

  it.skipIf(!isRealPg)(
    'Codex P2: a failed CREATE INDEX cleanup never removes a WRONG-definition INVALID leftover (real Postgres)',
    async () => {
      // Simulate a build that failed and left a same-name INVALID index with a
      // DIFFERENT definition. `assertDeferredIndexConverged`'s cleanup must not
      // touch it (only an exact-definition INVALID index is dropped).
      await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
      await runner.query(
        `CREATE INDEX "${INDEX.name}" ON "audit_events" USING btree ("occurred_at")`,
      );
      await runner.query(
        `UPDATE pg_index SET indisvalid = false
           WHERE indexrelid = '"public"."${INDEX.name}"'::regclass`,
      );
      const before = await indexState();

      await expect(ensureDeferredIndexes(runner, mode)).rejects.toBeInstanceOf(
        DeferredIndexDefinitionMismatchError,
      );

      expect(await indexState()).toEqual(before);
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

describe('inspectAudAConvergence / gatherAudAConvergenceEvidence (read-only operator evidence)', () => {
  async function snapshot() {
    return {
      idx: await indexState(),
      fk0: await fkConvalidated(AUD_A_DEFERRED_FK_VALIDATIONS[0]!.constraint),
      fk1: await fkConvalidated(AUD_A_DEFERRED_FK_VALIDATIONS[1]!.constraint),
    };
  }

  it('a converged database reports valid-exact / no-op and mutates nothing', async () => {
    const before = await snapshot();
    const ins = await inspectAudAConvergence(runner);

    expect(ins.expandMigrationApplied).toBe(true);
    expect(ins.index.state).toBe('valid-exact');
    expect(ins.index.plannedAction).toBe('no-op');
    expect(ins.foreignKeys.map((f) => f.plannedAction)).toEqual([
      'no-op',
      'no-op',
    ]);
    expect(
      ins.foreignKeys.every((f) => f.present && f.convalidated === true),
    ).toBe(true);
    expect(ins.timeoutPolicy).toEqual({
      lockTimeoutMs: 3_000,
      indexBuildStatementTimeoutMs: 0,
      fkValidateStatementTimeoutMs: 3_600_000,
    });
    expect(await snapshot()).toEqual(before);
  });

  it('an absent index reports create-concurrently (columns present) without creating it', async () => {
    await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
    const ins = await inspectAudAConvergence(runner);
    expect(ins.index.state).toBe('absent');
    expect(ins.index.plannedAction).toBe('create-concurrently');
    expect(ins.index.currentDefinition).toBeNull();
    expect((await indexState()).exists).toBe(false);
  });

  it('a same-name VALID wrong-definition index is REPORTED, not thrown', async () => {
    await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
    await runner.query(
      `CREATE INDEX "${INDEX.name}" ON "audit_events" USING btree ("occurred_at")`,
    );
    const ins = await inspectAudAConvergence(runner);
    expect(ins.index.state).toBe('valid-wrong-definition');
    expect(ins.index.plannedAction).toBe('abort-wrong-definition');
    // still there, untouched
    expect((await indexState()).def).toMatch(/\(occurred_at\)/);
  });

  it.skipIf(!isRealPg)(
    'an EXACT INVALID index reports invalid / rebuild-invalid (real Postgres)',
    async () => {
      await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
      await runner.query(
        `CREATE INDEX "${INDEX.name}" ON "audit_events" USING btree ("organization_id","occurred_at")`,
      );
      await runner.query(
        `UPDATE pg_index SET indisvalid = false
           WHERE indexrelid = '"public"."${INDEX.name}"'::regclass`,
      );
      const ins = await inspectAudAConvergence(runner);
      expect(ins.index.state).toBe('invalid');
      expect(ins.index.plannedAction).toBe('rebuild-invalid');
      expect((await indexState()).valid).toBe(false);
    },
  );

  it.skipIf(!isRealPg)(
    'Codex P2: an INVALID WRONG-definition index reports invalid-wrong-definition / abort — NOT rebuild-invalid (real Postgres)',
    async () => {
      await runner.query(`DROP INDEX IF EXISTS "public"."${INDEX.name}"`);
      await runner.query(
        `CREATE INDEX "${INDEX.name}" ON "audit_events" USING btree ("occurred_at")`,
      );
      await runner.query(
        `UPDATE pg_index SET indisvalid = false
           WHERE indexrelid = '"public"."${INDEX.name}"'::regclass`,
      );
      const before = await indexState();

      const ins = await inspectAudAConvergence(runner);
      expect(ins.index.state).toBe('invalid-wrong-definition');
      expect(ins.index.plannedAction).toBe('abort-wrong-definition');

      // read-only: nothing changed
      expect(await indexState()).toEqual(before);
    },
  );

  it('pre-0023 reports blocked states and expandMigrationApplied=false, no mutation', async () => {
    await reconstructPre0023();
    const ins = await inspectAudAConvergence(runner);
    expect(ins.expandMigrationApplied).toBe(false);
    expect(ins.index.state).toBe('absent');
    expect(ins.index.plannedAction).toBe('blocked-expand-not-applied');
    expect(ins.foreignKeys.map((f) => f.plannedAction)).toEqual([
      'blocked-missing',
      'blocked-missing',
    ]);
    expect(
      ins.foreignKeys.every((f) => !f.present && f.convalidated === null),
    ).toBe(true);
    expect((await indexState()).exists).toBe(false);
  });

  it('gatherAudAConvergenceEvidence returns cardinality and best-effort size, read-only', async () => {
    const before = await snapshot();
    const ev = await gatherAudAConvergenceEvidence(runner);

    expect(ev.inspection.index.state).toBe('valid-exact');
    expect(typeof ev.auditEventsRowCount).toBe('number');
    expect(ev.auditEventsRowCount).toBeGreaterThanOrEqual(0);
    if (isRealPg) {
      expect(ev.auditEventsTableBytes).toBeGreaterThan(0);
      expect(ev.auditEventsTotalRelationBytes).toBeGreaterThanOrEqual(
        ev.auditEventsTableBytes!,
      );
    }
    expect(await snapshot()).toEqual(before);
  });
});

describe('structural FK verification — same-name collisions & definition drift (Codex P2)', () => {
  const FK_EVENTS = AUD_A_DEFERRED_FK_VALIDATIONS[0]!; // audit_events, ON DELETE SET NULL
  const FK_SETTINGS = AUD_A_DEFERRED_FK_VALIDATIONS[1]!; // audit_log_settings, ON DELETE CASCADE

  /** Raw `pg_constraint` row anchored to a specific schema.table (test-only). */
  async function rawFk(
    schema: string,
    table: string,
    name: string,
  ): Promise<{ confdeltype: string; convalidated: boolean } | null> {
    const rows = await runner.query<{
      confdeltype: string;
      convalidated: boolean;
    }>(
      `select c.confdeltype::text as confdeltype, c.convalidated
         from pg_constraint c
         join pg_class rel on rel.oid = c.conrelid
         join pg_namespace ns on ns.oid = rel.relnamespace
        where ns.nspname = '${schema}' and rel.relname = '${table}'
          and c.conname = '${name}'`,
    );
    return rows[0]
      ? {
          confdeltype: rows[0].confdeltype,
          convalidated: rows[0].convalidated === true,
        }
      : null;
  }

  function fkInspection(constraint: string) {
    return inspectAudAConvergence(runner).then(
      (ins) => ins.foreignKeys.find((f) => f.constraint === constraint)!,
    );
  }

  afterEach(async () => {
    // Undo any drift this block introduced BEFORE the file-level afterEach
    // reconstructs 0023. A wrong FK on a non-organization_id local column is
    // NOT removed by `DROP COLUMN organization_id CASCADE`.
    await runner.query(
      `ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS "${FK_EVENTS.constraint}"`,
    );
    await runner.query(
      `ALTER TABLE public.audit_log_settings DROP CONSTRAINT IF EXISTS "${FK_SETTINGS.constraint}"`,
    );
    await runner.query('DROP SCHEMA IF EXISTS aud_p2_other CASCADE');
    await runner.query('DROP TABLE IF EXISTS public.aud_p2_wrong_ref CASCADE');
  });

  it('A: a correct exact NOT VALID FK → exact-unvalidated → enforce validates → final exact + validated', async () => {
    await runner.query(
      `ALTER TABLE public.audit_events DROP CONSTRAINT "${FK_EVENTS.constraint}"`,
    );
    await runner.query(
      `ALTER TABLE public.audit_events ADD CONSTRAINT "${FK_EVENTS.constraint}" ` +
        `FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION NOT VALID`,
    );

    const before = await fkInspection(FK_EVENTS.constraint);
    expect(before.state).toBe('present-exact-unvalidated');
    expect(before.plannedAction).toBe('validate');
    expect(before.convalidated).toBe(false);

    const outcome = await validateDeferredForeignKeys(runner, [FK_EVENTS], {
      enforcement: 'enforce',
    });
    expect(outcome).toEqual([
      { constraint: FK_EVENTS.constraint, action: 'validate' },
    ]);

    const after = await fkInspection(FK_EVENTS.constraint);
    expect(after.state).toBe('present-exact-validated');
    expect(after.plannedAction).toBe('no-op');
    expect(after.convalidated).toBe(true);
  });

  it('B: a correct exact + validated FK is a no-op in both inspect and enforce', async () => {
    // beforeAll already converged both FKs.
    const ins = await inspectAudAConvergence(runner);
    for (const f of ins.foreignKeys) {
      expect(f.state).toBe('present-exact-validated');
      expect(f.plannedAction).toBe('no-op');
      expect(f.convalidated).toBe(true);
    }
    const outcome = await validateDeferredForeignKeys(
      runner,
      AUD_A_DEFERRED_FK_VALIDATIONS,
      { enforcement: 'enforce' },
    );
    expect(outcome.map((o) => o.action)).toEqual(['skip', 'skip']);
  });

  it('C: same table + same name but WRONG ON DELETE (cascade, not set null) → wrong-definition; hard fail; never mutated', async () => {
    await runner.query(
      `ALTER TABLE public.audit_events DROP CONSTRAINT "${FK_EVENTS.constraint}"`,
    );
    await runner.query(
      `ALTER TABLE public.audit_events ADD CONSTRAINT "${FK_EVENTS.constraint}" ` +
        `FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ` +
        `ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`,
    );

    // inspect: REPORTS, never throws, never mutates
    const fk = await fkInspection(FK_EVENTS.constraint);
    expect(fk.state).toBe('present-wrong-definition');
    expect(fk.plannedAction).toBe('abort-wrong-definition');
    expect(fk.definitionMismatches.join(' ')).toMatch(/ON DELETE/i);
    expect(fk.currentDefinition).toMatch(/CASCADE/i);

    // enforce: HARD FAIL, before any VALIDATE
    await expect(
      validateDeferredForeignKeys(runner, [FK_EVENTS], {
        enforcement: 'enforce',
      }),
    ).rejects.toBeInstanceOf(DeferredForeignKeyDefinitionMismatchError);
    await expect(
      runAudAPostMigrateSteps(runner, mode, { enforcement: 'enforce' }),
    ).rejects.toBeInstanceOf(DeferredForeignKeyDefinitionMismatchError);

    // untouched: still CASCADE ('c'), still NOT VALID — not dropped/recreated
    const raw = await rawFk('public', 'audit_events', FK_EVENTS.constraint);
    expect(raw?.confdeltype).toBe('c');
    expect(raw?.convalidated).toBe(false);
  });

  it('D: same constraint name lives in ANOTHER schema while the expected public FK is absent → missing; enforce fails closed; decoy untouched', async () => {
    await runner.query(
      `ALTER TABLE public.audit_events DROP CONSTRAINT "${FK_EVENTS.constraint}"`,
    );
    await runner.query('CREATE SCHEMA aud_p2_other');
    await runner.query(
      `CREATE TABLE aud_p2_other.audit_events (id int primary key, organization_id uuid)`,
    );
    // a fully VALID, convalidated same-name FK on the other schema/table
    await runner.query(
      `ALTER TABLE aud_p2_other.audit_events ADD CONSTRAINT "${FK_EVENTS.constraint}" ` +
        `FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    const decoyBefore = await rawFk(
      'aud_p2_other',
      'audit_events',
      FK_EVENTS.constraint,
    );
    expect(decoyBefore).not.toBeNull();
    expect(decoyBefore?.convalidated).toBe(true);

    // the name-only lookup would have taken this decoy; the structural one MUST NOT
    const fk = await fkInspection(FK_EVENTS.constraint);
    expect(fk.state).toBe('absent');
    expect(fk.present).toBe(false);
    expect(fk.convalidated).toBeNull();
    expect(fk.plannedAction).toBe('blocked-missing');

    await expect(
      validateDeferredForeignKeys(runner, [FK_EVENTS], {
        enforcement: 'enforce',
      }),
    ).rejects.toBeInstanceOf(AudAConvergenceError);

    // the decoy on the other schema was never touched
    const decoyAfter = await rawFk(
      'aud_p2_other',
      'audit_events',
      FK_EVENTS.constraint,
    );
    expect(decoyAfter).toEqual(decoyBefore);
  });

  it('E: expected table + name but WRONG referenced relation → wrong-definition; hard fail', async () => {
    await runner.query(
      `ALTER TABLE public.audit_events DROP CONSTRAINT "${FK_EVENTS.constraint}"`,
    );
    await runner.query(
      'CREATE TABLE public.aud_p2_wrong_ref (id uuid primary key)',
    );
    await runner.query(
      `ALTER TABLE public.audit_events ADD CONSTRAINT "${FK_EVENTS.constraint}" ` +
        `FOREIGN KEY (organization_id) REFERENCES public.aud_p2_wrong_ref(id) ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION NOT VALID`,
    );

    const fk = await fkInspection(FK_EVENTS.constraint);
    expect(fk.state).toBe('present-wrong-definition');
    expect(fk.definitionMismatches.join(' ')).toMatch(/referenced table/i);

    await expect(
      validateDeferredForeignKeys(runner, [FK_EVENTS], {
        enforcement: 'enforce',
      }),
    ).rejects.toBeInstanceOf(DeferredForeignKeyDefinitionMismatchError);

    const raw = await rawFk('public', 'audit_events', FK_EVENTS.constraint);
    expect(raw?.convalidated).toBe(false); // never validated
  });

  it('F: expected table + name but WRONG local column → wrong-definition; hard fail', async () => {
    await runner.query(
      `ALTER TABLE public.audit_events DROP CONSTRAINT "${FK_EVENTS.constraint}"`,
    );
    // audit_events.actor_user_id is a uuid column — right type, WRONG column.
    await runner.query(
      `ALTER TABLE public.audit_events ADD CONSTRAINT "${FK_EVENTS.constraint}" ` +
        `FOREIGN KEY (actor_user_id) REFERENCES public.organizations(id) ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION NOT VALID`,
    );

    const fk = await fkInspection(FK_EVENTS.constraint);
    expect(fk.state).toBe('present-wrong-definition');
    expect(fk.definitionMismatches.join(' ')).toMatch(/local columns/i);

    await expect(
      validateDeferredForeignKeys(runner, [FK_EVENTS], {
        enforcement: 'enforce',
      }),
    ).rejects.toBeInstanceOf(DeferredForeignKeyDefinitionMismatchError);
  });

  it('inspect never mutates for any drift shape (read-only proof)', async () => {
    await runner.query(
      `ALTER TABLE public.audit_events DROP CONSTRAINT "${FK_EVENTS.constraint}"`,
    );
    await runner.query(
      `ALTER TABLE public.audit_events ADD CONSTRAINT "${FK_EVENTS.constraint}" ` +
        `FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ` +
        `ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID`,
    );
    const raw1 = await rawFk('public', 'audit_events', FK_EVENTS.constraint);

    // two inspect calls + an inspect-mode executor pass — all read-only
    await inspectAudAConvergence(runner);
    await gatherAudAConvergenceEvidence(runner);
    const out = await validateDeferredForeignKeys(runner, [FK_EVENTS], {
      enforcement: 'inspect',
    });
    expect(out).toEqual([
      { constraint: FK_EVENTS.constraint, action: 'wrong-definition' },
    ]);

    const raw2 = await rawFk('public', 'audit_events', FK_EVENTS.constraint);
    expect(raw2).toEqual(raw1); // byte-identical: nothing changed
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
