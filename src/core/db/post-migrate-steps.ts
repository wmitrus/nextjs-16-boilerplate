/**
 * OZI-71 AUD-A post-migrate convergence steps.
 *
 * Drizzle's PostgreSQL migrator (both `drizzle-orm/*` migrators and the
 * `drizzle-kit migrate` CLI, which delegates to `drizzle-orm/postgres-js`)
 * wraps every pending migration in ONE `session.transaction()`. That makes
 * two things impossible to express as an ordinary journaled .sql migration:
 *
 *   1. CREATE INDEX CONCURRENTLY -- illegal inside any transaction; the
 *      non-concurrent fallback holds a SHARE lock that blocks writes (not
 *      reads) for the whole build of a large `audit_events`.
 *   2. A real transaction boundary between ADD CONSTRAINT ... NOT VALID and
 *      VALIDATE CONSTRAINT. Inside one transaction the brief SHARE ROW
 *      EXCLUSIVE taken by ADD CONSTRAINT is held until commit -- i.e. for the
 *      whole VALIDATE scan -- defeating the point of the NOT VALID split.
 *
 * So AUD-A ships exactly ONE journaled migration (0023, purely additive: ADD
 * COLUMN, ADD FK NOT VALID, ADD CHECK NOT VALID, small indexes on the empty
 * `audit_log_settings`). The migrator commits it. THEN this module runs, on a
 * fresh connection, OUTSIDE any transaction:
 *
 *   - builds `idx_audit_events_organization_occurred`
 *     (CREATE INDEX CONCURRENTLY on real Postgres; plain CREATE INDEX on
 *     PGlite, which is single-connection with no large-table write-lock
 *     concern);
 *   - VALIDATEs the two deferred organization_id foreign keys, each as its
 *     own statement -- provably after 0023 committed.
 *
 * Idempotent (safe to re-run every deploy) and FAILS CLOSED: an INVALID index
 * (interrupted CONCURRENTLY build) is dropped and rebuilt; a same-name index
 * with a different definition aborts the run; a build that does not yield a
 * valid index is dropped and throws. If the target columns are absent (the
 * expand migration has not been applied yet) the index step defers instead
 * of failing.
 *
 * Invoked from every migration entry point:
 *   - src/core/db/migrations/run-migrations.ts (PGlite CLI, Testcontainers CI
 *     globalSetup, resolveTestDb);
 *   - scripts/db-migrate-prod.ts, after `drizzle-kit migrate` returns.
 *
 * See .copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md
 * section 16 AUD-A ("Production index safety" + "Foreign-key rollout").
 */

/**
 * Minimal query surface both a `postgres.Sql` client and a Drizzle `db` can
 * satisfy. Every statement issued through it is built from compile-time
 * constants (table / index / constraint names from the specs below), never a
 * caller value, so no parameter binding is needed.
 */
export interface SqlRunner {
  query<T = Record<string, unknown>>(text: string): Promise<T[]>;
}

/** 'concurrent' = real Postgres (CONCURRENTLY, non-txn). 'plain' = PGlite. */
export type IndexBuildMode = 'concurrent' | 'plain';

export interface DeferredIndexSpec {
  /** Index relation name (unqualified; always public). */
  readonly name: string;
  /** Table the index is built on (unqualified, public). */
  readonly table: string;
  /** Columns that must exist on the table before the index can be built. */
  readonly requiredColumns: readonly string[];
  /** Parenthesised column list exactly as it appears in CREATE INDEX. */
  readonly columnListSql: string;
  /**
   * pg_get_indexdef() output Postgres produces for the finished index,
   * compared after normalizeIndexdef() to detect a same-name index with a
   * different definition.
   */
  readonly expectedIndexdef: string;
}

export interface DeferredForeignKeyValidation {
  readonly table: string;
  readonly constraint: string;
}

/**
 * OZI-71 AUD-A: the `audit_events` canonical organization lookup index.
 * Mirrors idx_audit_events_organization_occurred in
 * src/modules/audit-log/infrastructure/drizzle/schema.ts. Created ONLY here,
 * never by a journaled .sql migration.
 */
export const AUDIT_EVENTS_ORGANIZATION_INDEX: DeferredIndexSpec = {
  name: 'idx_audit_events_organization_occurred',
  table: 'audit_events',
  requiredColumns: ['organization_id', 'occurred_at'],
  columnListSql: '("organization_id","occurred_at")',
  expectedIndexdef:
    'CREATE INDEX idx_audit_events_organization_occurred ON public.audit_events USING btree (organization_id, occurred_at)',
};

export const AUD_A_DEFERRED_INDEXES: readonly DeferredIndexSpec[] = [
  AUDIT_EVENTS_ORGANIZATION_INDEX,
];

/**
 * OZI-71 AUD-A: the two organization_id FKs added NOT VALID by migration 0023.
 * Validated here, after 0023's transaction has committed.
 */
export const AUD_A_DEFERRED_FK_VALIDATIONS: readonly DeferredForeignKeyValidation[] =
  [
    {
      table: 'audit_events',
      constraint: 'audit_events_organization_id_organizations_id_fk',
    },
    {
      table: 'audit_log_settings',
      constraint: 'audit_log_settings_organization_id_organizations_id_fk',
    },
  ];

export class DeferredIndexDefinitionMismatchError extends Error {
  constructor(
    readonly indexName: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      '[post-migrate-steps] index ' +
        JSON.stringify(indexName) +
        ' already exists with an unexpected definition; refusing to proceed. expected: ' +
        expected +
        ' | actual: ' +
        actual,
    );
    this.name = 'DeferredIndexDefinitionMismatchError';
  }
}

export type DeferredIndexAction =
  | { kind: 'deferred'; reason: string }
  | { kind: 'create' }
  | { kind: 'recreate-invalid' }
  | { kind: 'skip' };

export interface ExistingIndexState {
  readonly exists: boolean;
  readonly valid: boolean;
  readonly indexdef: string | null;
}

/**
 * Lower-cases, collapses whitespace, drops a trailing semicolon, and strips
 * the redundant `public.` schema qualifier (real Postgres' `pg_get_indexdef`
 * emits `ON public.audit_events`; PGlite emits `ON audit_events`). Every
 * deferred index lives in `public`, so the qualifier carries no information.
 */
export function normalizeIndexdef(def: string): string {
  return def
    .toLowerCase()
    .replace(/\bpublic\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*;\s*$/, '')
    .trim();
}

/**
 * Pure decision: given whether the required columns exist and the current
 * state of a same-name index, decide what to do. Throws
 * DeferredIndexDefinitionMismatchError on a wrong-definition collision (the
 * fail-closed case).
 */
export function decideDeferredIndexAction(
  spec: DeferredIndexSpec,
  requiredColumnsPresent: boolean,
  existing: ExistingIndexState,
): DeferredIndexAction {
  if (!requiredColumnsPresent) {
    return {
      kind: 'deferred',
      reason:
        'columns [' +
        spec.requiredColumns.join(', ') +
        '] not all present on ' +
        spec.table +
        ' yet',
    };
  }
  if (!existing.exists) return { kind: 'create' };
  if (!existing.valid) return { kind: 'recreate-invalid' };

  const actual = normalizeIndexdef(existing.indexdef ?? '');
  const expected = normalizeIndexdef(spec.expectedIndexdef);
  if (actual !== expected) {
    throw new DeferredIndexDefinitionMismatchError(spec.name, expected, actual);
  }
  return { kind: 'skip' };
}

/**
 * Session-timeout policy for AUD-A DDL and post-migrate convergence (plan
 * section 16 AUD-A "Production DDL safety planning"). All values in ms.
 *
 * - `LOCK_TIMEOUT` (3s): PostgreSQL's default is 0 = wait forever. A DDL /
 *   convergence statement that cannot take its lock within 3s is blocked
 *   behind a long transaction; continuing to wait would queue every later
 *   query behind the DDL's lock request. Aborting and retrying the deploy is
 *   strictly safer. 3s rides out normal short transactions.
 * - `STATEMENT_TIMEOUT_DDL` (30s): 0023's statements are catalog-only on
 *   PG 11+ (constant-default ADD COLUMN, ADD ... NOT VALID, CREATE INDEX on
 *   the empty audit_log_settings); 30s is ~100x headroom and never touches
 *   audit_events data.
 * - `STATEMENT_TIMEOUT_INDEX` (0 = disabled): a legitimate
 *   CREATE INDEX CONCURRENTLY build of a large audit_events can run for
 *   minutes-to-hours (two heap scans + wait-for-transactions). A finite
 *   statement_timeout would cancel it mid-build, leaving an INVALID index.
 *   `LOCK_TIMEOUT` still bounds its two brief ShareUpdateExclusiveLock phases.
 * - `STATEMENT_TIMEOUT_VALIDATE` (1h): VALIDATE CONSTRAINT scans every
 *   audit_events row but under ShareUpdateExclusiveLock (no DML block). 1h is
 *   a generous ceiling for a very large table that still guarantees the
 *   deploy command cannot hang forever on a wedged statement.
 *
 * PGlite (single-connection, in-memory) has no lock contention and every
 * operation is sub-millisecond; it implements both GUCs, so the same `SET`
 * statements are issued there too, inert but valid.
 */
export const AUD_A_TIMEOUTS = {
  LOCK_TIMEOUT_MS: 3_000,
  STATEMENT_TIMEOUT_DDL_MS: 30_000,
  STATEMENT_TIMEOUT_INDEX_MS: 0,
  STATEMENT_TIMEOUT_VALIDATE_MS: 3_600_000,
} as const;

/**
 * Query-string parameters to append to the migration connection URL so the
 * `drizzle-kit migrate` subprocess (which builds its own client from the URL)
 * starts its session with the 0023-transaction timeout policy. `postgres.js`
 * forwards unrecognised URL params as startup parameters.
 */
export const AUD_A_MIGRATION_URL_PARAMS: Readonly<Record<string, string>> = {
  lock_timeout: String(AUD_A_TIMEOUTS.LOCK_TIMEOUT_MS),
  statement_timeout: String(AUD_A_TIMEOUTS.STATEMENT_TIMEOUT_DDL_MS),
};

/**
 * `enforce` (default) — a real post-migrate run: 0023 has been applied and
 *   committed, so absent columns / FKs are an ERROR, and the run does not
 *   succeed unless the deferred index exists valid with the exact expected
 *   definition and both deferred FKs are validated.
 * `inspect` — pre-migration / `--check`: 0023 may not have run; absent
 *   prerequisites are reported (`deferred` / `missing`), nothing is mutated.
 * A same-name VALID index with a different definition fails closed in BOTH
 * modes (operator must intervene; never auto-dropped).
 */
export type ConvergenceEnforcement = 'enforce' | 'inspect';

export interface PostMigrateStepOptions {
  readonly enforcement?: ConvergenceEnforcement;
  readonly log?: (event: Record<string, unknown>) => void;
}

/** Thrown by `enforce` mode when a required post-migrate condition is unmet. */
export class AudAConvergenceError extends Error {
  constructor(message: string) {
    super('[post-migrate-steps] ' + message);
    this.name = 'AudAConvergenceError';
  }
}

function defaultLog(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ audAPostMigrate: event }, null, 2));
}

function quotedList(values: readonly string[]): string {
  return values.map((v) => "'" + v + "'").join(', ');
}

/** Issue `SET lock_timeout` + `SET statement_timeout` for the current step. */
async function setSessionTimeouts(
  runner: SqlRunner,
  statementTimeoutMs: number,
): Promise<void> {
  await runner.query('SET lock_timeout = ' + AUD_A_TIMEOUTS.LOCK_TIMEOUT_MS);
  await runner.query('SET statement_timeout = ' + statementTimeoutMs);
}

async function requiredColumnsPresent(
  runner: SqlRunner,
  spec: DeferredIndexSpec,
): Promise<boolean> {
  const rows = await runner.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = '" +
      spec.table +
      "' and column_name in (" +
      quotedList(spec.requiredColumns) +
      ')',
  );
  return rows.length === spec.requiredColumns.length;
}

async function introspectIndex(
  runner: SqlRunner,
  name: string,
): Promise<ExistingIndexState> {
  const rows = await runner.query<{ indisvalid: boolean; indexdef: string }>(
    'select i.indisvalid, pg_get_indexdef(i.indexrelid) as indexdef from pg_class c join pg_index i on i.indexrelid = c.oid join pg_namespace n on n.oid = c.relnamespace where n.nspname = ' +
      "'public' and c.relname = '" +
      name +
      "'",
  );
  const row = rows[0];
  return row
    ? { exists: true, valid: row.indisvalid, indexdef: row.indexdef }
    : { exists: false, valid: false, indexdef: null };
}

export interface DeferredIndexOutcome {
  readonly name: string;
  readonly action: DeferredIndexAction['kind'];
  readonly detail?: string;
}

/**
 * Drop a same-name index ONLY if it is INVALID (a partial / interrupted
 * CONCURRENTLY build we own). A VALID index — including a VALID
 * wrong-definition one — is NEVER auto-dropped; that is an operator decision.
 */
async function dropIfInvalid(
  runner: SqlRunner,
  cc: string,
  name: string,
): Promise<boolean> {
  const state = await introspectIndex(runner, name);
  if (state.exists && !state.valid) {
    await runner.query(
      'DROP INDEX' + cc + ' IF EXISTS "public"."' + name + '"',
    );
    return true;
  }
  return false;
}

/**
 * Ensure every deferred index exists, is valid, and matches its expected
 * definition. `buildMode` 'concurrent' uses CREATE/DROP INDEX CONCURRENTLY
 * (real Postgres, outside any transaction); 'plain' uses the non-concurrent
 * forms (PGlite). Idempotent; fails closed.
 *
 * `enforce` mode (default): a deferred index (required column absent) is an
 * ERROR, and the returned outcome is only ever `skip` or `create` — i.e. the
 * index is guaranteed to exist, be valid, and match its expected definition
 * on return. `inspect` mode: report the action that WOULD be taken, mutate
 * nothing (a `SET`-free read-only pass), still throw on a VALID
 * wrong-definition collision.
 *
 * If `CREATE INDEX CONCURRENTLY` throws (lock timeout, cancellation, ...) the
 * failure path removes a same-name INVALID index it left behind and rethrows,
 * so the next run starts clean. (A later convergence run would also detect,
 * drop and rebuild an INVALID index — this just makes the current run tidy.)
 */
export async function ensureDeferredIndexes(
  runner: SqlRunner,
  buildMode: IndexBuildMode,
  specs: readonly DeferredIndexSpec[] = AUD_A_DEFERRED_INDEXES,
  options: PostMigrateStepOptions = {},
): Promise<DeferredIndexOutcome[]> {
  const enforcement = options.enforcement ?? 'enforce';
  const log = options.log ?? defaultLog;
  const cc = buildMode === 'concurrent' ? ' CONCURRENTLY' : '';
  const outcomes: DeferredIndexOutcome[] = [];

  for (const spec of specs) {
    const columnsPresent = await requiredColumnsPresent(runner, spec);
    const before = await introspectIndex(runner, spec.name);
    // Throws (fail closed) on a VALID wrong-definition collision, both modes.
    const action = decideDeferredIndexAction(spec, columnsPresent, before);

    if (action.kind === 'deferred') {
      if (enforcement === 'enforce') {
        throw new AudAConvergenceError(
          'required index ' +
            JSON.stringify(spec.name) +
            ' cannot be built: ' +
            action.reason +
            ' — migration 0023 has not been applied.',
        );
      }
      log({
        step: 'index',
        index: spec.name,
        action: 'deferred',
        enforcement,
        detail: action.reason,
      });
      outcomes.push({
        name: spec.name,
        action: 'deferred',
        detail: action.reason,
      });
      continue;
    }

    if (action.kind === 'skip' || enforcement === 'inspect') {
      log({
        step: 'index',
        index: spec.name,
        action: action.kind,
        enforcement,
      });
      outcomes.push({ name: spec.name, action: action.kind });
      continue;
    }

    // enforce mode, action is 'create' or 'recreate-invalid': mutate.
    await setSessionTimeouts(runner, AUD_A_TIMEOUTS.STATEMENT_TIMEOUT_INDEX_MS);

    if (action.kind === 'recreate-invalid') {
      log({ step: 'index', index: spec.name, op: 'drop-invalid', buildMode });
      await runner.query(
        'DROP INDEX' + cc + ' IF EXISTS "public"."' + spec.name + '"',
      );
    }

    log({ step: 'index', index: spec.name, op: 'create', buildMode });
    try {
      await runner.query(
        'CREATE INDEX' +
          cc +
          ' "' +
          spec.name +
          '" ON "' +
          spec.table +
          '" USING btree ' +
          spec.columnListSql,
      );
    } catch (err) {
      const dropped = await dropIfInvalid(runner, cc, spec.name);
      log({
        step: 'index',
        index: spec.name,
        op: 'build-failed',
        droppedInvalid: dropped,
      });
      throw err;
    }

    const after = await introspectIndex(runner, spec.name);
    if (
      !after.exists ||
      !after.valid ||
      normalizeIndexdef(after.indexdef ?? '') !==
        normalizeIndexdef(spec.expectedIndexdef)
    ) {
      await dropIfInvalid(runner, cc, spec.name);
      throw new AudAConvergenceError(
        'build of ' +
          JSON.stringify(spec.name) +
          ' did not produce a valid index matching the expected definition' +
          ' (exists=' +
          after.exists +
          ', valid=' +
          after.valid +
          ', def=' +
          JSON.stringify(after.indexdef) +
          '). Re-run once the cause is resolved.',
      );
    }

    log({
      step: 'index',
      index: spec.name,
      action: action.kind,
      buildMode,
      done: true,
    });
    outcomes.push({ name: spec.name, action: action.kind });
  }

  return outcomes;
}

export type ForeignKeyValidationAction = 'skip' | 'validate' | 'missing';

export interface DeferredForeignKeyOutcome {
  readonly constraint: string;
  readonly action: ForeignKeyValidationAction;
}

async function constraintConvalidated(
  runner: SqlRunner,
  name: string,
): Promise<boolean | null> {
  const rows = await runner.query<{ convalidated: boolean }>(
    "select convalidated from pg_constraint where conname = '" + name + "'",
  );
  return rows[0] ? rows[0].convalidated : null;
}

/**
 * Run VALIDATE CONSTRAINT for each deferred FK, as its own statement, only if
 * it is not already validated. Runs after (never inside) the expand
 * migration's transaction, so ADD CONSTRAINT's brief SHARE ROW EXCLUSIVE is
 * long released; VALIDATE CONSTRAINT itself takes only SHARE UPDATE EXCLUSIVE
 * on the table (+ ROW SHARE on organizations) and blocks neither reads nor
 * writes. Idempotent.
 *
 * `enforce` mode (default): a missing constraint is an ERROR, and every FK is
 * `convalidated` on return. `inspect` mode: report `missing` / `validate`
 * (would) / `skip`, mutate nothing.
 */
export async function validateDeferredForeignKeys(
  runner: SqlRunner,
  fks: readonly DeferredForeignKeyValidation[] = AUD_A_DEFERRED_FK_VALIDATIONS,
  options: PostMigrateStepOptions = {},
): Promise<DeferredForeignKeyOutcome[]> {
  const enforcement = options.enforcement ?? 'enforce';
  const log = options.log ?? defaultLog;
  const outcomes: DeferredForeignKeyOutcome[] = [];
  let timeoutsSet = false;

  for (const fk of fks) {
    const convalidated = await constraintConvalidated(runner, fk.constraint);

    let action: ForeignKeyValidationAction;
    if (convalidated === null) action = 'missing';
    else if (convalidated) action = 'skip';
    else action = 'validate';

    if (action === 'missing' && enforcement === 'enforce') {
      throw new AudAConvergenceError(
        'required foreign key ' +
          JSON.stringify(fk.constraint) +
          ' is absent on ' +
          fk.table +
          ' — migration 0023 has not been applied.',
      );
    }

    if (action === 'validate' && enforcement === 'enforce') {
      if (!timeoutsSet) {
        await setSessionTimeouts(
          runner,
          AUD_A_TIMEOUTS.STATEMENT_TIMEOUT_VALIDATE_MS,
        );
        timeoutsSet = true;
      }
      await runner.query(
        'ALTER TABLE "' +
          fk.table +
          '" VALIDATE CONSTRAINT "' +
          fk.constraint +
          '"',
      );
      const after = await constraintConvalidated(runner, fk.constraint);
      if (after !== true) {
        throw new AudAConvergenceError(
          'VALIDATE CONSTRAINT ' +
            JSON.stringify(fk.constraint) +
            ' did not mark it validated (convalidated=' +
            String(after) +
            ').',
        );
      }
    }

    log({
      step: 'fk-validate',
      constraint: fk.constraint,
      action,
      enforcement,
    });
    outcomes.push({ constraint: fk.constraint, action });
  }

  return outcomes;
}

/**
 * Return `url` with the 0023-transaction session-timeout params
 * ({@link AUD_A_MIGRATION_URL_PARAMS}) set as query parameters, so a client
 * built from the URL alone (the `drizzle-kit migrate` subprocess, and our own
 * convergence connection) starts its session with the policy applied.
 * Idempotent — overwrites any pre-existing values for those keys.
 */
export function appendMigrationSessionParams(url: string): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(AUD_A_MIGRATION_URL_PARAMS)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export interface AudAPostMigrateResult {
  readonly indexes: DeferredIndexOutcome[];
  readonly foreignKeys: DeferredForeignKeyOutcome[];
}

/**
 * Run every AUD-A post-migrate convergence step, in order:
 *   1. build the deferred index(es) (concurrent vs plain per `buildMode`);
 *   2. validate the deferred foreign keys.
 * Idempotent. In the default `enforce` mode this either brings the database
 * fully to the AUD-A end state (deferred index present, valid and matching
 * its expected definition; both deferred FKs validated) or throws
 * `AudAConvergenceError` — it never returns "success" with the work
 * half-done. `inspect` mode (`--check` / pre-0023) reports only.
 */
export async function runAudAPostMigrateSteps(
  runner: SqlRunner,
  buildMode: IndexBuildMode,
  options: PostMigrateStepOptions = {},
): Promise<AudAPostMigrateResult> {
  const indexes = await ensureDeferredIndexes(
    runner,
    buildMode,
    AUD_A_DEFERRED_INDEXES,
    options,
  );
  const foreignKeys = await validateDeferredForeignKeys(
    runner,
    AUD_A_DEFERRED_FK_VALIDATIONS,
    options,
  );
  return { indexes, foreignKeys };
}

interface PostgresLikeClient {
  unsafe: (text: string) => PromiseLike<unknown>;
}

/** Adapt a postgres.Sql-style unsafe(text) client to SqlRunner. */
export function sqlRunnerFromPostgres(client: PostgresLikeClient): SqlRunner {
  return {
    query: async (text) => (await client.unsafe(text)) as never[],
  };
}

interface DrizzleLikeDb {
  // Drizzle's `execute` param type differs across drivers (string | SQLWrapper
  // vs SQLWrapper); accept anything the `raw()` bridge produces.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (query: any) => Promise<unknown>;
}

/**
 * Adapt a Drizzle `db` (execute(sql) returning rows or { rows }). Pass `raw` =
 * drizzle-orm's `sql.raw` so the runner can issue string SQL.
 */
export function sqlRunnerFromDrizzle(
  db: DrizzleLikeDb,
  raw: (text: string) => unknown,
): SqlRunner {
  return {
    query: async (text) => {
      const result = await db.execute(raw(text));
      if (Array.isArray(result)) return result as never[];
      const rows = (result as { rows?: unknown }).rows;
      return (Array.isArray(rows) ? rows : []) as never[];
    },
  };
}
