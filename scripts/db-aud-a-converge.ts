import './load-env';

import postgres from 'postgres';

import {
  assertDirectPostgresUrl,
  AUDIT_EVENTS_ORGANIZATION_INDEX,
  gatherAudAConvergenceEvidence,
  runAudAPostMigrateSteps,
  sqlRunnerFromPostgres,
  type AudAConvergenceEvidence,
  type AudAForeignKeyPlan,
  type AudAIndexPlan,
  type SqlRunner,
} from '@/core/db/post-migrate-steps';

import {
  describeMigrationTarget,
  resolveMigrationUrlWithSource,
} from './db-migrate-prod';
import {
  assertMigrationJournalComplete,
  formatMigrationJournalSummary,
  validateMigrationJournal,
} from './validate-migration-journal';

/**
 * OZI-71 AUD·A — dedicated Production convergence operator CLI.
 *
 * `pnpm db:migrate:prod` applies the one journaled AUD·A migration (`0023`,
 * purely additive) and exits. It does NOT run the long-running AUD·A
 * convergence, because per the AUD·A Production DDL safety plan (plan §16
 * AUD·A) every potentially long-running Production schema operation requires
 * dry-run size/cardinality evidence, an explicit operator gate, abort criteria
 * and recovery guidance. The convergence — `CREATE INDEX CONCURRENTLY
 * idx_audit_events_organization_occurred` (statement_timeout = 0) and
 * `VALIDATE CONSTRAINT` on both deferred FKs (statement_timeout up to 1h) — is
 * that class of operation.
 *
 *   pnpm db:aud-a:converge --check                       (read-only; evidence)
 *   pnpm db:aud-a:converge --apply --production-approved  (mutating)
 *
 * The mutating path reuses the SAME convergence executor as the automatic
 * Preview / Testcontainers / local path (`runAudAPostMigrateSteps` in
 * `src/core/db/post-migrate-steps.ts`) — there is no second implementation.
 * AUD·A is additive-only, so a deployment that has applied `0023` but not yet
 * run this step is safe: the legacy runtime path stays authoritative, the
 * NOT VALID FKs still enforce new/changed rows, and the deferred index is not
 * required by the legacy runtime. AUD·B must not begin until this step passes.
 */

const CTX = 'db:aud-a:converge';
const APPROVAL_FLAG = '--production-approved';
const KNOWN_FLAGS = new Set(['--check', '--apply', APPROVAL_FLAG]);

/**
 * Strict, fail-closed CLI parsing for a Production mutation tool: exactly one
 * of `--check` or `--apply --production-approved`. Every other combination —
 * no mode, both modes, `--production-approved` without `--apply`, `--apply`
 * without approval, any unknown token — is rejected here, before a connection
 * is opened.
 */
export function parseArgs(argv: readonly string[]): {
  mode: 'check' | 'apply';
} {
  const unknown = argv.filter((a) => !KNOWN_FLAGS.has(a));
  if (unknown.length > 0) {
    throw new Error(
      `[${CTX}] unknown argument(s): ${unknown.join(', ')}. ` +
        'Usage: `pnpm db:aud-a:converge --check` OR ' +
        '`pnpm db:aud-a:converge --apply --production-approved`.',
    );
  }

  const wantCheck = argv.includes('--check');
  const wantApply = argv.includes('--apply');
  const approved = argv.includes(APPROVAL_FLAG);

  if (wantCheck && wantApply) {
    throw new Error(
      `[${CTX}] choose exactly one mode: --check OR --apply --production-approved, not both.`,
    );
  }
  if (approved && !wantApply) {
    throw new Error(
      `[${CTX}] ${APPROVAL_FLAG} is only valid together with --apply.`,
    );
  }
  if (!wantCheck && !wantApply) {
    throw new Error(
      `[${CTX}] a mode is required: --check (read-only) OR --apply --production-approved (mutating).`,
    );
  }
  if (wantApply && !approved) {
    throw new Error(
      `[${CTX}] --apply requires the explicit operator gate ${APPROVAL_FLAG}. ` +
        'Refusing to start a potentially long CREATE INDEX CONCURRENTLY build / ' +
        'FK VALIDATE scan on an unconfirmed invocation.\n' +
        '  Run first : pnpm db:aud-a:converge --check   (read-only evidence)\n' +
        `  Then      : pnpm db:aud-a:converge --apply ${APPROVAL_FLAG}`,
    );
  }

  return { mode: wantApply ? 'apply' : 'check' };
}

/**
 * The AUD·A Production DDL safety plan requires size/cardinality evidence
 * before any potentially long-running Production schema operation. Row count
 * and table size are MANDATORY for `--apply`; total relation size stays
 * best-effort. Returns the human names of any mandatory item that is missing
 * or not a finite non-negative number.
 */
export function missingMandatoryEvidence(
  evidence: AudAConvergenceEvidence,
): string[] {
  const ok = (n: number | null): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const missing: string[] = [];
  if (!ok(evidence.auditEventsRowCount)) missing.push('audit_events row count');
  if (!ok(evidence.auditEventsTableBytes)) {
    missing.push('audit_events table size');
  }
  return missing;
}

/**
 * Injectable seams so the `--apply` orchestration can be unit-tested
 * deterministically without a database. Defaults are the real
 * implementations — the production call path is `run(argv)` unchanged.
 */
export interface ConvergeDeps {
  gatherEvidence: typeof gatherAudAConvergenceEvidence;
  validateJournal: typeof validateMigrationJournal;
  assertJournalComplete: typeof assertMigrationJournalComplete;
  runConvergence: typeof runAudAPostMigrateSteps;
  openRunner: (url: string) => {
    runner: SqlRunner;
    close: () => Promise<unknown>;
  };
}

function defaultDeps(): ConvergeDeps {
  return {
    gatherEvidence: gatherAudAConvergenceEvidence,
    validateJournal: validateMigrationJournal,
    assertJournalComplete: assertMigrationJournalComplete,
    runConvergence: runAudAPostMigrateSteps,
    openRunner: (url) => {
      const sql = postgres(url, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
      });
      return {
        runner: sqlRunnerFromPostgres(sql),
        close: () => sql.end({ timeout: 5 }),
      };
    },
  };
}

function describeIndexPlan(plan: AudAIndexPlan): string {
  switch (plan) {
    case 'no-op':
      return 'already converged — CREATE INDEX will NOT run';
    case 'create-concurrently':
      return 'CREATE INDEX CONCURRENTLY WILL run (may scan a large audit_events)';
    case 'rebuild-invalid':
      return 'an INVALID index will be DROP INDEX CONCURRENTLY-ed and rebuilt';
    case 'abort-wrong-definition':
      return 'HARD FAIL — a VALID index with a different definition exists; --apply aborts and NEVER drops it';
    case 'blocked-expand-not-applied':
      return 'BLOCKED — migration 0023 is not applied; --apply fails closed';
  }
}

function describeFkPlan(plan: AudAForeignKeyPlan): string {
  switch (plan) {
    case 'no-op':
      return 'already validated — VALIDATE CONSTRAINT will NOT run';
    case 'validate':
      return 'VALIDATE CONSTRAINT WILL run (scans audit_events under SHARE UPDATE EXCLUSIVE)';
    case 'blocked-missing':
      return 'BLOCKED — FK absent; migration 0023 is not applied; --apply fails closed';
  }
}

function fmtBytes(n: number | null): string {
  if (n === null)
    return '(unavailable — e.g. permission-limited role / PGlite)';
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${n} B (~${v.toFixed(1)} ${units.at(i) ?? 'TiB'})`;
}

export function formatEvidence(
  target: ReturnType<typeof describeMigrationTarget>,
  evidence: AudAConvergenceEvidence,
  mode: 'check' | 'apply',
): string {
  const ins = evidence.inspection;
  const L: string[] = [];
  L.push(
    `AUD·A Production convergence — evidence (${mode === 'apply' ? 'before --apply' : '--check, read-only'})`,
  );
  L.push('');
  L.push('Target:');
  L.push(`  URL source              : ${target.source}`);
  L.push(`  protocol               : ${target.protocol}`);
  L.push(`  hostname               : ${target.hostname}`);
  L.push(`  database               : ${target.database}`);
  L.push(`  endpoint               : ${target.pooled ? 'POOLED' : 'direct'}`);
  L.push('');
  L.push('Migration 0023 (additive expand):');
  L.push(
    `  applied (columns present): ${
      ins.expandMigrationApplied
        ? 'yes'
        : 'NO — run `pnpm db:migrate:prod` first'
    }`,
  );
  L.push('');
  L.push('audit_events:');
  L.push(
    `  exact row count         : ${evidence.auditEventsRowCount ?? '(unavailable)'}`,
  );
  L.push(
    `  table size              : ${fmtBytes(evidence.auditEventsTableBytes)}`,
  );
  L.push(
    `  total relation size     : ${fmtBytes(evidence.auditEventsTotalRelationBytes)}`,
  );
  L.push('');
  L.push(`${ins.index.name}:`);
  L.push(`  state                  : ${ins.index.state}`);
  L.push(
    `  current definition     : ${ins.index.currentDefinition ?? '(absent)'}`,
  );
  L.push(`  expected definition    : ${ins.index.expectedDefinition}`);
  L.push(
    `  planned action         : ${describeIndexPlan(ins.index.plannedAction)}`,
  );
  L.push('');
  L.push('Deferred foreign keys:');
  for (const fk of ins.foreignKeys) {
    L.push(`  ${fk.constraint} (${fk.table})`);
    L.push(`    present              : ${fk.present ? 'yes' : 'NO'}`);
    L.push(
      `    convalidated          : ${fk.convalidated === null ? '(absent)' : String(fk.convalidated)}`,
    );
    L.push(`    planned action        : ${describeFkPlan(fk.plannedAction)}`);
  }
  L.push('');
  L.push('Timeout policy (--apply, on its dedicated DIRECT single session):');
  L.push(
    `  lock_timeout                     : ${ins.timeoutPolicy.lockTimeoutMs} ms (3s)`,
  );
  L.push(
    `  statement_timeout (index build)  : ${ins.timeoutPolicy.indexBuildStatementTimeoutMs} (0 = disabled; a large CONCURRENTLY build is legitimately long)`,
  );
  L.push(
    `  statement_timeout (FK VALIDATE)  : ${ins.timeoutPolicy.fkValidateStatementTimeoutMs} ms (1h ceiling)`,
  );
  return L.join('\n');
}

export function formatRecoveryGuidance(): string {
  return [
    'Recovery guidance:',
    '  • Interrupted CREATE INDEX CONCURRENTLY / INVALID index:',
    '      the next `--apply --production-approved` run detects the INVALID index,',
    '      DROP INDEX CONCURRENTLY IF EXISTS it, and rebuilds it. Nothing manual',
    '      is required; an INVALID index is not used by the planner.',
    '  • lock_timeout abort (SQLSTATE 55P03, "canceling statement due to lock',
    '    timeout"): a long transaction held a conflicting lock on audit_events.',
    '      Find it via pg_stat_activity / pg_locks, let it finish or cancel it,',
    '      then re-run `--apply --production-approved` (idempotent).',
    '  • VALID same-name index with a WRONG definition:',
    '      the command HARD FAILS and NEVER drops a valid index. An operator must',
    '      review it, then `DROP INDEX CONCURRENTLY` it manually and re-run.',
    '      Expected definition:',
    `        ${AUDIT_EVENTS_ORGANIZATION_INDEX.expectedIndexdef}`,
    '  • FK VALIDATE failure (historical rows violate the constraint):',
    '      an audit_events / audit_log_settings row has organization_id pointing',
    '      at a missing organizations.id. Investigate/repair those rows; the FK',
    '      stays NOT VALID and keeps enforcing new/changed rows until re-run.',
  ].join('\n');
}

export async function run(
  argv = process.argv.slice(2),
  deps: ConvergeDeps = defaultDeps(),
): Promise<void> {
  // Strict, fail-closed parsing — rejects before any env read or connection.
  const { mode } = parseArgs(argv);

  const migrationUrl = resolveMigrationUrlWithSource(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
  );
  if (!migrationUrl) {
    throw new Error(
      `[${CTX}] DATABASE_URL_UNPOOLED or DATABASE_URL is required.`,
    );
  }

  const target = describeMigrationTarget(migrationUrl);
  console.log(JSON.stringify({ convergeTarget: target }, null, 2));

  // The whole convergence — SET → CREATE INDEX CONCURRENTLY → VALIDATE
  // CONSTRAINT — is only session-affine on a DIRECT connection. Fail closed on
  // a known pooler for BOTH modes: `--check`'s evidence would describe a path
  // `--apply` cannot use. (The target JSON above still shows what was seen.)
  assertDirectPostgresUrl(migrationUrl.url, CTX);

  const { runner, close } = deps.openRunner(migrationUrl.url);

  try {
    // Read-only: SELECTs only (no SET, no DDL, no journal write).
    const evidence = await deps.gatherEvidence(runner);
    console.log(formatEvidence(target, evidence, mode));
    console.log('');
    console.log(formatRecoveryGuidance());

    const missingEvidence = missingMandatoryEvidence(evidence);

    if (mode === 'check') {
      console.log('');
      if (missingEvidence.length > 0) {
        console.log(
          `[${CTX}] --apply is BLOCKED: mandatory Production dry-run evidence ` +
            `is unavailable: ${missingEvidence.join(', ')}. The AUD·A ` +
            'Production DDL safety plan requires size/cardinality evidence ' +
            'before any long-running schema operation, so ' +
            '`--apply --production-approved` will refuse to run until the ' +
            'database role can read count(audit_events) and pg_table_size.',
        );
      }
      console.log(
        `[${CTX}] --check complete. No schema, data, index, constraint or ` +
          'migration-journal changes were made.',
      );
      return;
    }

    // ── --apply --production-approved ──────────────────────────────────────
    // 1. Mandatory dry-run evidence must be available (fail closed BEFORE the
    //    expand-migration check, the journal gate, and any DDL).
    if (missingEvidence.length > 0) {
      throw new Error(
        `[${CTX}] mandatory Production dry-run evidence is unavailable: ` +
          `${missingEvidence.join(', ')}. The AUD·A Production DDL safety plan ` +
          'requires size/cardinality evidence before any long-running schema ' +
          'operation. Aborting before VALIDATE / DDL. Re-run `--check` once ' +
          'the database role can read count(audit_events) and pg_table_size.',
      );
    }

    // 2. Expand migration (0023) precondition.
    if (!evidence.inspection.expandMigrationApplied) {
      throw new Error(
        `[${CTX}] migration 0023 is not applied (audit_events.organization_id ` +
          'is absent). Run `pnpm db:migrate:prod` first, then re-run this step.',
      );
    }

    // 3. Exact migration-journal gate.
    const journalSummary = await deps.validateJournal({
      connectionString: migrationUrl.url,
    });
    console.log('');
    console.log(
      JSON.stringify(
        { migrationJournal: formatMigrationJournalSummary(journalSummary) },
        null,
        2,
      ),
    );
    deps.assertJournalComplete(journalSummary);

    // 4. The EXISTING shared convergence executor (no second implementation).
    console.log('');
    console.log(
      `[${CTX}] --apply ${APPROVAL_FLAG} — running the AUD·A convergence ` +
        'executor (enforce mode) on this dedicated direct session…',
    );
    const result = await deps.runConvergence(runner, 'concurrent', {
      enforcement: 'enforce',
    });
    console.log(
      JSON.stringify({ audAConverge: { applied: true, ...result } }, null, 2),
    );

    // 5. Post-convergence re-inspection + 6. exact final postcondition.
    //    `runConvergence` already throws AudAConvergenceError on a half-done
    //    state; this re-reads for the operator log and asserts independently.
    const after = await deps.gatherEvidence(runner);
    const converged =
      after.inspection.index.state === 'valid-exact' &&
      after.inspection.foreignKeys.length > 0 &&
      after.inspection.foreignKeys.every((f) => f.convalidated === true);
    if (!converged) {
      throw new Error(
        `[${CTX}] post-condition check failed after convergence: ${JSON.stringify(
          after.inspection,
        )}`,
      );
    }
    console.log('');
    console.log(
      `[${CTX}] AUD·A Production convergence COMPLETE — ` +
        'idx_audit_events_organization_occurred is VALID and matches the ' +
        'expected definition; both deferred FKs are validated.',
    );
  } finally {
    await close();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/db-aud-a-converge.ts');

if (isMain) {
  run().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[${CTX}] Fatal error:`, err.message);
    process.exit(1);
  });
}
