import {
  gatherOwnershipDispositionEvidence,
  OWNERSHIP_DISPOSITION_SPECS,
  type OwnershipDispositionEvidence,
  type OwnershipDispositionTable,
  type OwnershipDispositionTableEvidence,
} from './ownership-disposition-gate';
import { AUD_A_TIMEOUTS, type SqlRunner } from './post-migrate-steps';

export const OWNERSHIP_DISPOSITION_ADVISORY_LOCK_KEY = {
  namespace: 0x4f5a4944, // 'OZID'
  id: 213,
} as const;

export type OwnershipDispositionConvergenceAction =
  | 'validated'
  | 'no-op'
  | 'blocked-missing-constraint'
  | 'blocked-wrong-constraint'
  | 'blocked-unsettled-rows';

export interface OwnershipDispositionConvergenceOutcome {
  readonly table: OwnershipDispositionTable;
  readonly action: OwnershipDispositionConvergenceAction;
}

export interface OwnershipDispositionConvergenceResult {
  readonly before: OwnershipDispositionEvidence;
  readonly outcomes: readonly OwnershipDispositionConvergenceOutcome[];
  readonly after: OwnershipDispositionEvidence;
}

export interface OwnershipDispositionConvergenceDeps {
  readonly gatherEvidence: typeof gatherOwnershipDispositionEvidence;
}

export class OwnershipDispositionConvergenceAlreadyRunningError extends Error {
  constructor() {
    super(
      '[ownership-disposition-convergence] another mutating OZI-213 convergence run already owns the advisory lock',
    );
    this.name = 'OwnershipDispositionConvergenceAlreadyRunningError';
  }
}

export class OwnershipDispositionConvergenceError extends Error {
  constructor(message: string) {
    super(`[ownership-disposition-convergence] ${message}`);
    this.name = 'OwnershipDispositionConvergenceError';
  }
}

function toBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1;
}

function tableEvidence(
  evidence: OwnershipDispositionEvidence,
  table: OwnershipDispositionTable,
): OwnershipDispositionTableEvidence {
  switch (table) {
    case 'feature_flags':
      return evidence.featureFlags;
    case 'audit_log_settings':
      return evidence.auditLogSettings;
    case 'audit_events':
      return evidence.auditEvents;
  }
}

function blockedAction(
  evidence: OwnershipDispositionTableEvidence,
): OwnershipDispositionConvergenceAction {
  switch (evidence.plannedAction) {
    case 'blocked-missing-constraint':
    case 'blocked-wrong-constraint':
    case 'blocked-unsettled-rows':
      return evidence.plannedAction;
    case 'validate-constraint':
      return 'validated';
    case 'no-op':
      return 'no-op';
  }
}

async function acquireLock(runner: SqlRunner): Promise<void> {
  const rows = await runner.query<{ acquired: unknown }>(
    `SELECT pg_try_advisory_lock(
       ${OWNERSHIP_DISPOSITION_ADVISORY_LOCK_KEY.namespace},
       ${OWNERSHIP_DISPOSITION_ADVISORY_LOCK_KEY.id}
     ) AS acquired`,
  );

  if (!rows[0] || !toBool(rows[0].acquired)) {
    throw new OwnershipDispositionConvergenceAlreadyRunningError();
  }
}

async function releaseLock(runner: SqlRunner): Promise<void> {
  await runner.query(
    `SELECT pg_advisory_unlock(
       ${OWNERSHIP_DISPOSITION_ADVISORY_LOCK_KEY.namespace},
       ${OWNERSHIP_DISPOSITION_ADVISORY_LOCK_KEY.id}
     )`,
  );
}

async function validateOne(
  runner: SqlRunner,
  table: OwnershipDispositionTable,
  constraint: string,
): Promise<void> {
  await runner.query(
    `ALTER TABLE "public"."${table}" VALIDATE CONSTRAINT "${constraint}"`,
  );
}

/**
 * OZI-213 mutating convergence executor.
 *
 * It deliberately works per table rather than imposing one aggregate gate:
 * feature_flags and audit_log_settings gate R4a, while audit_events gates
 * R4b-1 independently.
 *
 * A table is mutated only when the read-only inspector reports
 * `validate-constraint`. Missing/wrong constraints and unsettled ownership
 * populations are reported and left untouched.
 *
 * The caller must provide a dedicated single-session runner. Production CLI
 * wiring will additionally require DATABASE_URL_UNPOOLED and explicit
 * operator approval.
 */
export async function runOwnershipDispositionConvergence(
  runner: SqlRunner,
  deps: OwnershipDispositionConvergenceDeps = {
    gatherEvidence: gatherOwnershipDispositionEvidence,
  },
): Promise<OwnershipDispositionConvergenceResult> {
  await acquireLock(runner);

  try {
    const before = await deps.gatherEvidence(runner);
    const outcomes: OwnershipDispositionConvergenceOutcome[] = [];
    let timeoutsSet = false;

    for (const spec of OWNERSHIP_DISPOSITION_SPECS) {
      const current = tableEvidence(before, spec.table);

      if (current.plannedAction !== 'validate-constraint') {
        outcomes.push({
          table: spec.table,
          action: blockedAction(current),
        });
        continue;
      }

      if (!timeoutsSet) {
        await runner.query(
          `SET lock_timeout = '${AUD_A_TIMEOUTS.LOCK_TIMEOUT_MS}ms'`,
        );
        await runner.query(
          `SET statement_timeout = '${AUD_A_TIMEOUTS.STATEMENT_TIMEOUT_VALIDATE_MS}ms'`,
        );
        timeoutsSet = true;
      }

      await validateOne(runner, spec.table, spec.constraint);

      const postValidation = await deps.gatherEvidence(runner);
      const verified = tableEvidence(postValidation, spec.table);

      if (
        verified.constraint.state !== 'exact-validated' ||
        !verified.constraint.definitionMatches ||
        !verified.constraint.validated ||
        !verified.gateReady
      ) {
        throw new OwnershipDispositionConvergenceError(
          `VALIDATE CONSTRAINT for ${spec.table}.${spec.constraint} did not ` +
            `leave the table gate-ready; state=${verified.constraint.state}, ` +
            `dispositionSettled=${String(verified.dispositionSettled)}, ` +
            `gateReady=${String(verified.gateReady)}, ` +
            `plannedAction=${verified.plannedAction}`,
        );
      }

      outcomes.push({
        table: spec.table,
        action: 'validated',
      });
    }

    const after = await deps.gatherEvidence(runner);

    return {
      before,
      outcomes,
      after,
    };
  } finally {
    await releaseLock(runner);
  }
}
