/**
 * OZI-219 — non-Production R4a-A schema bootstrap.
 *
 * Production and Preview receive the R4a compact uniques only through the
 * operator-gated executor (`db:r4a:compact-indexes`, `db:r4a:apply:preview`).
 * Every database built from migrations alone -- PGlite, Testcontainers, the
 * local dev/test containers, E2E -- converges to the same schema A here,
 * after migrations, using the same specification and inspector. It is
 * idempotent: an `already-converged` table is a no-op, and any other
 * non-creatable decision fails closed. It never drops anything.
 *
 * Production reached schema A in two operator steps: OZI-213 validated each
 * table's ownership CHECK, then OZI-216 created the compact unique. A
 * migration-built database still has the CHECK as migrated (NOT VALID), so
 * the bootstrap repeats the OZI-213 step first -- for the two R4a tables only
 * (never `audit_events`, which gates R4b), and only when that gate itself
 * plans `validate-constraint` (settled rows, exact definition).
 *
 * Target identity: a loopback hostname is NOT proof of a local database -- a
 * tunnel or port-forward can put Production behind 127.0.0.1. Every real
 * PostgreSQL bootstrap therefore requires the cluster's `system_identifier`
 * (random per initdb) read through a trusted channel -- inside the
 * Testcontainers container the fixture started, or inside the repository's
 * local compose container -- and verifies it on the very session that runs
 * the DDL, before any statement that writes. A mismatch, an unreadable
 * identity or a missing proof refuses with no DDL.
 */
import { gatherOwnershipDispositionTableEvidence } from './ownership-disposition-gate';
import type { SqlRunner } from './post-migrate-steps';
import {
  r4aCompactIndexCreateSql,
  R4aCompactIndexExecutorError,
  runR4aCompactIndexExecutor,
  type R4aCompactIndexExecutorRunner,
} from './r4a-compact-index-executor';
import {
  inspectR4aCompactIndex,
  R4A_COMPACT_INDEX_SPECS,
  type R4aCompactIndexSqlRunner,
  type R4aCompactIndexTable,
} from './r4a-compact-index-inspection';

export interface R4aSchemaABootstrapResult {
  readonly table: R4aCompactIndexTable;
  readonly action: 'created' | 'no-op';
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export const R4A_SYSTEM_IDENTIFIER_SQL =
  'SELECT system_identifier::text AS id FROM pg_control_system()';

/**
 * Defense-in-depth only: a non-loopback URL is refused outright, but a
 * loopback one still needs the identity proof (`assertR4aBootstrapTargetIdentity`).
 */
export function isLocalR4aBootstrapTarget(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Fails closed unless the session's cluster is the one whose identity was read
 * through a trusted channel. Must run on the same session as the DDL.
 */
export async function assertR4aBootstrapTargetIdentity(
  runner: R4aCompactIndexSqlRunner,
  expectedSystemIdentifier: string | undefined,
): Promise<void> {
  if (!expectedSystemIdentifier || !/^\d{1,20}$/.test(expectedSystemIdentifier))
    throw new R4aCompactIndexExecutorError(
      'schema A bootstrap requires a trusted target identity proof; refused, no DDL',
    );
  let actual: string | undefined;
  try {
    actual = (await runner.query<{ id: string }>(R4A_SYSTEM_IDENTIFIER_SQL))[0]
      ?.id;
  } catch {
    actual = undefined;
  }
  if (actual !== expectedSystemIdentifier)
    throw new R4aCompactIndexExecutorError(
      'schema A bootstrap target is not the trusted local cluster (system_identifier mismatch or unreadable); refused, no DDL',
    );
}

async function settleR4aOwnershipChecks(runner: SqlRunner): Promise<void> {
  for (const { table } of R4A_COMPACT_INDEX_SPECS) {
    const evidence = await gatherOwnershipDispositionTableEvidence(
      runner,
      table,
    );
    if (evidence.plannedAction === 'validate-constraint')
      await runner.query(
        `ALTER TABLE "public"."${table}" VALIDATE CONSTRAINT "${evidence.constraint.name}"`,
      );
  }
}

/**
 * Real PostgreSQL: the R4a executor itself (session lock, timeout policy,
 * CREATE INDEX CONCURRENTLY, in-lock re-inspection, postflight). Standard
 * convergence only -- an INVALID index is refused, never dropped.
 */
export async function bootstrapR4aSchemaAConcurrent(
  runner: R4aCompactIndexExecutorRunner,
  { expectedSystemIdentifier }: { readonly expectedSystemIdentifier: string },
): Promise<readonly R4aSchemaABootstrapResult[]> {
  await assertR4aBootstrapTargetIdentity(runner, expectedSystemIdentifier);
  await settleR4aOwnershipChecks(runner);
  const results = await runR4aCompactIndexExecutor(runner);
  return results.map(({ table, action }) => {
    if (action === 'recreated-invalid')
      throw new R4aCompactIndexExecutorError(
        `${table}: schema A bootstrap never recovers INVALID indexes`,
      );
    return { table, action };
  });
}

/**
 * PGlite: one in-process session with no concurrent writers, so the same
 * definition is built without CONCURRENTLY and verified by the same inspector.
 */
export async function bootstrapR4aSchemaAPlain(
  runner: R4aCompactIndexSqlRunner,
): Promise<readonly R4aSchemaABootstrapResult[]> {
  await settleR4aOwnershipChecks(runner);
  const results: R4aSchemaABootstrapResult[] = [];
  for (const { table } of R4A_COMPACT_INDEX_SPECS) {
    const before = await inspectR4aCompactIndex(runner, table);
    if (before.decision === 'already-converged') {
      results.push({ table, action: 'no-op' });
      continue;
    }
    if (before.decision !== 'eligible-to-create')
      throw new R4aCompactIndexExecutorError(
        `${table} is ${before.decision}; schema A bootstrap refused, no DDL`,
      );
    await runner.query(
      r4aCompactIndexCreateSql(table, { concurrently: false }),
    );
    const after = await inspectR4aCompactIndex(runner, table);
    if (after.decision !== 'already-converged')
      throw new R4aCompactIndexExecutorError(
        `${table} did not converge after schema A bootstrap`,
      );
    results.push({ table, action: 'created' });
  }
  return results;
}
