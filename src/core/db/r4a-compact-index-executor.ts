/** OZI-214 A.2 — explicit, session-scoped PostgreSQL R4a index executor. */
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
function createSql(table: R4aCompactIndexTable): string {
  const spec = specFor(table);
  return `CREATE UNIQUE INDEX CONCURRENTLY "${spec.index}" ON "public"."${table}" USING btree ("${spec.columns[0]}", "${spec.columns[1]}") NULLS NOT DISTINCT`;
}
async function acquire(runner: R4aCompactIndexSqlRunner): Promise<void> {
  const rows = await runner.query<{ ok: boolean }>(
    `SELECT pg_try_advisory_lock(${R4A_COMPACT_INDEX_LOCK.namespace}, ${R4A_COMPACT_INDEX_LOCK.id}) AS ok`,
  );
  if (rows[0]?.ok !== true) throw new R4aCompactIndexAlreadyRunningError();
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
function settingLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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
  runner: R4aCompactIndexSqlRunner,
  previous: SessionTimeouts,
): Promise<void> {
  await runner.query(
    `SELECT set_config('lock_timeout', ${settingLiteral(previous.lockTimeout)}, false), set_config('statement_timeout', ${settingLiteral(previous.statementTimeout)}, false)`,
  );
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

/** Mutating only when the caller has explicitly entered this function. */
export async function runR4aCompactIndexExecutor(
  runner: R4aCompactIndexSqlRunner,
  tables: readonly R4aCompactIndexTable[] = [
    'feature_flags',
    'audit_log_settings',
  ],
): Promise<readonly R4aCompactIndexExecution[]> {
  await acquire(runner);
  let previous: SessionTimeouts | undefined;
  try {
    previous = await captureTimeouts(runner);
    await applyTimeouts(runner);
    return await converge(runner, tables);
  } finally {
    try {
      if (previous) await restoreTimeouts(runner, previous);
    } finally {
      await release(runner);
    }
  }
}

async function converge(
  runner: R4aCompactIndexSqlRunner,
  tables: readonly R4aCompactIndexTable[],
): Promise<readonly R4aCompactIndexExecution[]> {
  const results: R4aCompactIndexExecution[] = [];
  for (const table of tables) {
    const before = await inspectR4aCompactIndex(runner, table);
    let action: R4aCompactIndexExecution['action'];
    if (before.decision === 'already-converged') action = 'no-op';
    else if (before.decision === 'eligible-to-create') {
      await runner.query(createSql(table));
      action = 'created';
    } else if (recoveryAllowed(before)) {
      await runner.query(
        `DROP INDEX CONCURRENTLY "public"."${specFor(table).index}"`,
      );
      await runner.query(createSql(table));
      action = 'recreated-invalid';
    } else
      throw new R4aCompactIndexExecutorError(
        `${table} is ${before.decision}; refusing DDL`,
      );
    const after = await inspectR4aCompactIndex(runner, table);
    if (after.decision !== 'already-converged')
      throw new R4aCompactIndexExecutorError(
        `${table} did not converge after ${action}`,
      );
    results.push({ table, action, before, after });
  }
  return results;
}
