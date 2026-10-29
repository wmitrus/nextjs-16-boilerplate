/**
 * OZI-214 A.2 — explicit, session-scoped PostgreSQL R4a index executor.
 *
 * OZI-217: two separately authorized operations share one session lifecycle.
 * Standard convergence may only CREATE a missing index; it never DROPs.
 * INVALID recovery (DROP + CREATE) runs only for explicitly named tables and
 * only when the fresh in-lock inspection qualifies every one of them.
 */
import {
  inspectR4aCompactIndex,
  R4A_COMPACT_INDEX_SPECS,
  type R4aCompactIndexInspection,
  type R4aCompactIndexSqlRunner,
  type R4aCompactIndexTable,
} from './r4a-compact-index-inspection';

export const R4A_COMPACT_INDEX_LOCK = { namespace: 0x52344149, id: 1 } as const;
export const R4A_COMPACT_INDEX_TIMEOUTS = {
  lockMs: 3000,
  statementMs: 0,
} as const;

export class R4aCompactIndexExecutorError extends Error {
  constructor(message: string) {
    super(`[r4a-compact-index-executor] ${message}`);
    this.name = 'R4aCompactIndexExecutorError';
  }
}
export class R4aCompactIndexAlreadyRunningError extends R4aCompactIndexExecutorError {
  constructor() {
    super('another R4a compact-index executor holds the advisory lock');
    this.name = 'R4aCompactIndexAlreadyRunningError';
  }
}
/**
 * The executor's session runner. Besides plain statements it must bind values
 * as real driver parameters ($1, $2, ...) -- values are never spliced into SQL
 * text. A runner without this capability is refused before any SQL runs.
 */
export interface R4aCompactIndexExecutorRunner extends R4aCompactIndexSqlRunner {
  queryWithParams<T>(
    statement: string,
    params: readonly string[],
  ): Promise<T[]>;
}
interface PostgresParameterClient {
  unsafe(text: string, params?: string[]): PromiseLike<unknown>;
}
/**
 * Adapts one postgres.js session (`max: 1`). With parameters, postgres.js
 * uses the extended protocol: the text goes in Parse, the values in Bind.
 */
export function r4aExecutorRunnerFromPostgres(
  client: PostgresParameterClient,
): R4aCompactIndexExecutorRunner {
  return {
    query: async <T>(text: string) => (await client.unsafe(text)) as T[],
    queryWithParams: async <T>(text: string, params: readonly string[]) =>
      (await client.unsafe(text, [...params])) as T[],
  };
}
const RESTORE_TIMEOUTS_SQL =
  "SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)";
export interface R4aCompactIndexExecution {
  readonly table: R4aCompactIndexTable;
  readonly action: 'created' | 'recreated-invalid' | 'no-op';
  readonly before: R4aCompactIndexInspection;
  readonly after: R4aCompactIndexInspection;
}

function specFor(table: R4aCompactIndexTable) {
  const spec = R4A_COMPACT_INDEX_SPECS.find(
    (candidate) => candidate.table === table,
  );
  if (!spec)
    throw new R4aCompactIndexExecutorError(`unsupported table: ${table}`);
  return spec;
}
/**
 * The one R4a-A index definition. `concurrently: false` exists only for the
 * non-Production PGlite bootstrap, where CONCURRENTLY has no meaning.
 */
export function r4aCompactIndexCreateSql(
  table: R4aCompactIndexTable,
  { concurrently }: { readonly concurrently: boolean },
): string {
  const spec = specFor(table);
  return `CREATE UNIQUE INDEX ${concurrently ? 'CONCURRENTLY ' : ''}"${spec.index}" ON "public"."${table}" USING btree ("${spec.columns[0]}", "${spec.columns[1]}") NULLS NOT DISTINCT`;
}
const createSql = (table: R4aCompactIndexTable) =>
  r4aCompactIndexCreateSql(table, { concurrently: true });
async function acquire(runner: R4aCompactIndexSqlRunner): Promise<void> {
  const rows = await runner.query<{ ok: boolean }>(
    `SELECT pg_try_advisory_lock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id}) AS ok`,
  );
  if (rows[0]?.ok !== true) throw new R4aCompactIndexAlreadyRunningError();
}
/**
 * The advisory lock is session-scoped, so holding it proves the runner is
 * still on the session that acquired it -- and that carries the timeout
 * policy. If the driver retired or reconnected the connection, this fails and
 * no further DDL runs.
 */
async function assertLockHeld(runner: R4aCompactIndexSqlRunner): Promise<void> {
  const rows = await runner.query<{ held: unknown }>(
    `SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid() AND classid = ${R4A_COMPACT_INDEX_LOCK.namespace} AND objid = ${R4A_COMPACT_INDEX_LOCK.id} AND objsubid = 2) AS held`,
  );
  if (rows[0]?.held !== true)
    throw new R4aCompactIndexExecutorError(
      'the session no longer holds the advisory lock; refusing DDL',
    );
}
async function runDdl(
  runner: R4aCompactIndexSqlRunner,
  statement: string,
): Promise<void> {
  await assertLockHeld(runner);
  await runner.query(statement);
}
async function release(runner: R4aCompactIndexSqlRunner): Promise<void> {
  await runner.query(
    `SELECT pg_advisory_unlock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id})`,
  );
}
interface SessionTimeouts {
  readonly lockTimeout: string;
  readonly statementTimeout: string;
}
/**
 * Captures the session's own timeouts, then applies the executor policy to
 * every statement that follows -- preflight, recovery, CREATE and postflight.
 * `statement_timeout = 0` is deliberate: a concurrent build may legitimately
 * run for a long time; `lock_timeout` bounds every wait on a table lock.
 * The captured values are returned before any SET so a partial failure can
 * still be restored.
 */
async function captureTimeouts(
  runner: R4aCompactIndexSqlRunner,
): Promise<SessionTimeouts> {
  const rows = await runner.query<{
    lock_timeout: unknown;
    statement_timeout: unknown;
  }>(
    "SELECT current_setting('lock_timeout') AS lock_timeout, current_setting('statement_timeout') AS statement_timeout",
  );
  const lockTimeout = rows[0]?.lock_timeout;
  const statementTimeout = rows[0]?.statement_timeout;
  if (typeof lockTimeout !== 'string' || typeof statementTimeout !== 'string')
    throw new R4aCompactIndexExecutorError(
      'could not read the session timeout settings',
    );
  return { lockTimeout, statementTimeout };
}
async function applyTimeouts(runner: R4aCompactIndexSqlRunner): Promise<void> {
  await runner.query(`SET lock_timeout = ${R4A_COMPACT_INDEX_TIMEOUTS.lockMs}`);
  await runner.query(
    `SET statement_timeout = ${R4A_COMPACT_INDEX_TIMEOUTS.statementMs}`,
  );
}
async function restoreTimeouts(
  runner: R4aCompactIndexExecutorRunner,
  previous: SessionTimeouts,
): Promise<void> {
  await runner.queryWithParams(RESTORE_TIMEOUTS_SQL, [
    previous.lockTimeout,
    previous.statementTimeout,
  ]);
}
function recoveryAllowed(inspection: R4aCompactIndexInspection): boolean {
  const target = inspection.target;
  return (
    inspection.decision === 'invalid-index-recovery-required' &&
    target.exists &&
    target.exact &&
    target.valid === false &&
    target.ready === false &&
    target.live === true
  );
}

/** Lock -> timeout policy -> `work` -> restore timeouts -> unlock. */
async function withExecutorSession(
  runner: R4aCompactIndexExecutorRunner,
  work: () => Promise<readonly R4aCompactIndexExecution[]>,
): Promise<readonly R4aCompactIndexExecution[]> {
  if (
    typeof (runner as Partial<R4aCompactIndexExecutorRunner>)
      .queryWithParams !== 'function'
  )
    throw new R4aCompactIndexExecutorError(
      'runner cannot bind query parameters; refusing to run',
    );
  await acquire(runner);
  let previous: SessionTimeouts | undefined;
  try {
    previous = await captureTimeouts(runner);
    await applyTimeouts(runner);
    return await work();
  } finally {
    try {
      if (previous) await restoreTimeouts(runner, previous);
    } finally {
      await release(runner);
    }
  }
}

/**
 * Standard convergence (`--apply --production-approved`). Mutating only when
 * the caller has explicitly entered this function. Never DROPs: an INVALID
 * index is refused and needs the separate recovery authorization.
 */
export async function runR4aCompactIndexExecutor(
  runner: R4aCompactIndexExecutorRunner,
  tables: readonly R4aCompactIndexTable[] = [
    'feature_flags',
    'audit_log_settings',
  ],
): Promise<readonly R4aCompactIndexExecution[]> {
  return withExecutorSession(runner, () => converge(runner, tables));
}

/**
 * Exceptional INVALID-index recovery (`--recover-invalid --table <t>
 * --production-approved`). Only the explicitly named tables are eligible, and
 * every one must qualify under the lock before any DDL runs. A missing index
 * is refused here -- recovery never performs an ordinary CREATE.
 */
export async function runR4aCompactIndexRecovery(
  runner: R4aCompactIndexExecutorRunner,
  tables: readonly R4aCompactIndexTable[],
): Promise<readonly R4aCompactIndexExecution[]> {
  if (tables.length === 0)
    throw new R4aCompactIndexExecutorError(
      'recovery requires at least one explicitly named table',
    );
  if (new Set(tables).size !== tables.length)
    throw new R4aCompactIndexExecutorError('recovery tables must not repeat');
  for (const table of tables) specFor(table);
  return withExecutorSession(runner, () => recover(runner, tables));
}

async function recover(
  runner: R4aCompactIndexSqlRunner,
  tables: readonly R4aCompactIndexTable[],
): Promise<readonly R4aCompactIndexExecution[]> {
  // Qualify every named table before the first DROP, so a refused table can
  // never leave an earlier one half-handled.
  for (const table of tables) {
    await assertLockHeld(runner);
    assertRecoverable(table, await inspectR4aCompactIndex(runner, table));
  }
  const results: R4aCompactIndexExecution[] = [];
  for (const table of tables) {
    await assertLockHeld(runner);
    // Re-inspect: an earlier table's rebuild may have taken a long time.
    const before = await inspectR4aCompactIndex(runner, table);
    assertRecoverable(table, before);
    await runDdl(
      runner,
      `DROP INDEX CONCURRENTLY "public"."${specFor(table).index}"`,
    );
    await runDdl(runner, createSql(table));
    results.push(await postflight(runner, table, 'recreated-invalid', before));
  }
  return results;
}

function assertRecoverable(
  table: R4aCompactIndexTable,
  inspection: R4aCompactIndexInspection,
): void {
  if (!recoveryAllowed(inspection))
    throw new R4aCompactIndexExecutorError(
      `${table} is ${inspection.decision}; INVALID recovery refused, no DDL`,
    );
}

async function postflight(
  runner: R4aCompactIndexSqlRunner,
  table: R4aCompactIndexTable,
  action: R4aCompactIndexExecution['action'],
  before: R4aCompactIndexInspection,
): Promise<R4aCompactIndexExecution> {
  const after = await inspectR4aCompactIndex(runner, table);
  if (after.decision !== 'already-converged')
    throw new R4aCompactIndexExecutorError(
      `${table} did not converge after ${action}`,
    );
  return { table, action, before, after };
}

async function converge(
  runner: R4aCompactIndexSqlRunner,
  tables: readonly R4aCompactIndexTable[],
): Promise<readonly R4aCompactIndexExecution[]> {
  const results: R4aCompactIndexExecution[] = [];
  for (const table of tables) {
    await assertLockHeld(runner);
    const before = await inspectR4aCompactIndex(runner, table);
    let action: R4aCompactIndexExecution['action'];
    if (before.decision === 'already-converged') action = 'no-op';
    else if (before.decision === 'eligible-to-create') {
      await runDdl(runner, createSql(table));
      action = 'created';
    } else if (before.decision === 'invalid-index-recovery-required')
      throw new R4aCompactIndexExecutorError(
        `${table} is invalid-index-recovery-required; standard apply never drops -- use the separate --recover-invalid authorization; refusing DDL`,
      );
    else
      throw new R4aCompactIndexExecutorError(
        `${table} is ${before.decision}; refusing DDL`,
      );
    results.push(await postflight(runner, table, action, before));
  }
  return results;
}
