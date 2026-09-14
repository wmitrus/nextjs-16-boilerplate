/**
 * OZI-71 AUD·A — read-only convergence inspection + evidence (dedicated
 * Production operator CLI).
 *
 * Extracted from `post-migrate-steps.ts` (a small, cohesive, already
 * self-contained section — nothing else in that file calls into this one) to
 * keep the enforce-mode executor file focused and within the repository's
 * complexity/length budget. The dependency is ONE-DIRECTIONAL: this module
 * imports the catalog-read primitives (`introspectIndex`,
 * `requiredColumnsPresent`, `introspectForeignKey`) and pure spec/identity
 * helpers from `./post-migrate-steps`; nothing in `post-migrate-steps.ts`
 * imports from here, so there is no import cycle.
 *
 * OZI-71 AUD·A Production DDL safety plan (plan §16 AUD·A): every potentially
 * long-running Production schema operation must carry dry-run size/cardinality
 * evidence, an explicit operator gate, abort criteria and recovery guidance.
 * The `CREATE INDEX CONCURRENTLY` build and the two `VALIDATE CONSTRAINT`
 * scans are exactly that class of operation, so they are NOT run automatically
 * by `pnpm db:migrate:prod`; the dedicated `pnpm db:aud-a:converge` CLI runs
 * them behind an explicit `--apply --production-approved` gate.
 *
 * `inspectAudAConvergence` / `gatherAudAConvergenceEvidence` are the read-only
 * side of that CLI: they classify the current state and predict what `--apply`
 * would do, reusing the SAME primitives the `enforce` executor uses. They
 * issue only SELECTs — no `SET`, no DDL, no `VALIDATE`, no journal write.
 * Unlike the executors, a same-name VALID index with a wrong definition — and
 * a same-name FK on the expected table with a wrong full definition — are
 * REPORTED here, not thrown.
 */

import {
  AUD_A_DEFERRED_FK_VALIDATIONS,
  formatExpectedForeignKeyDef,
  type DeferredForeignKeyValidation,
} from './aud-a-foreign-key';
import {
  AUD_A_TIMEOUTS,
  AUDIT_EVENTS_ORGANIZATION_INDEX,
  indexDefinitionMatchesSpec,
  introspectForeignKey,
  introspectIndex,
  requiredColumnsPresent,
  type DeferredIndexSpec,
  type ExistingIndexState,
  type SqlRunner,
} from './post-migrate-steps';

export type AudAIndexInspectedState =
  | 'absent'
  | 'invalid'
  | 'invalid-wrong-definition'
  | 'valid-exact'
  | 'valid-wrong-definition';

export type AudAIndexPlan =
  | 'no-op'
  | 'create-concurrently'
  | 'rebuild-invalid'
  | 'abort-wrong-definition'
  | 'blocked-expand-not-applied';

/**
 * Pure index classification for the read-only inspector. The SAME structural
 * identity test (`indexDefinitionMatchesSpec`) as the executor is applied to
 * VALID and INVALID indexes alike (Codex P2): an INVALID index whose
 * definition does NOT match the spec is `invalid-wrong-definition` /
 * `abort-wrong-definition` — NOT `rebuild-invalid`, and never labelled
 * `valid-*`.
 */
export function classifyIndexInspection(
  spec: DeferredIndexSpec,
  existing: ExistingIndexState,
  columnsPresent: boolean,
): { state: AudAIndexInspectedState; plannedAction: AudAIndexPlan } {
  if (!existing.exists) {
    return {
      state: 'absent',
      plannedAction: columnsPresent
        ? 'create-concurrently'
        : 'blocked-expand-not-applied',
    };
  }
  const exact = indexDefinitionMatchesSpec(spec, existing);
  if (exact && existing.valid) {
    return { state: 'valid-exact', plannedAction: 'no-op' };
  }
  if (exact) {
    return { state: 'invalid', plannedAction: 'rebuild-invalid' };
  }
  if (existing.valid) {
    return {
      state: 'valid-wrong-definition',
      plannedAction: 'abort-wrong-definition',
    };
  }
  return {
    state: 'invalid-wrong-definition',
    plannedAction: 'abort-wrong-definition',
  };
}

/** Mirrors the deferred-index state model, for FKs (Codex P2). */
export type AudAForeignKeyInspectedState =
  | 'absent'
  | 'present-exact-unvalidated'
  | 'present-exact-validated'
  | 'present-wrong-definition';

export type AudAForeignKeyPlan =
  | 'no-op'
  | 'validate'
  | 'blocked-missing'
  | 'abort-wrong-definition';

export interface AudAIndexInspection {
  readonly name: string;
  readonly table: string;
  readonly state: AudAIndexInspectedState;
  readonly currentDefinition: string | null;
  readonly expectedDefinition: string;
  readonly plannedAction: AudAIndexPlan;
}

export interface AudAForeignKeyInspection {
  readonly constraint: string;
  /** Expected source schema (`public` for AUD·A). */
  readonly schema: string;
  /** Expected source table. */
  readonly table: string;
  readonly state: AudAForeignKeyInspectedState;
  /** A constraint with this name exists ON THE EXPECTED `schema.table`. */
  readonly present: boolean;
  /** Rollout state only — `null` when absent. NOT part of FK identity. */
  readonly convalidated: boolean | null;
  /** Canonical expected FK definition (from the spec). */
  readonly expectedDefinition: string;
  /** `pg_get_constraintdef(oid, true)` of the actual constraint, or `null`. */
  readonly currentDefinition: string | null;
  /** Field-level current-vs-expected differences (only when wrong-definition). */
  readonly definitionMismatches: readonly string[];
  readonly plannedAction: AudAForeignKeyPlan;
}

export interface AudAConvergenceInspection {
  /** Proxy for "migration 0023 applied" — its additive columns exist. */
  readonly expandMigrationApplied: boolean;
  readonly index: AudAIndexInspection;
  readonly foreignKeys: AudAForeignKeyInspection[];
  readonly timeoutPolicy: {
    readonly lockTimeoutMs: number;
    readonly indexBuildStatementTimeoutMs: number;
    readonly fkValidateStatementTimeoutMs: number;
  };
}

export interface AudAConvergenceEvidence {
  readonly inspection: AudAConvergenceInspection;
  readonly auditEventsRowCount: number | null;
  readonly auditEventsTableBytes: number | null;
  readonly auditEventsTotalRelationBytes: number | null;
}

/**
 * Classify the current AUD·A convergence state and what an `--apply` run would
 * do. Read-only (SELECT statements only); never throws on a wrong-definition
 * index — it reports it.
 */
export async function inspectAudAConvergence(
  runner: SqlRunner,
  spec: DeferredIndexSpec = AUDIT_EVENTS_ORGANIZATION_INDEX,
  fks: readonly DeferredForeignKeyValidation[] = AUD_A_DEFERRED_FK_VALIDATIONS,
): Promise<AudAConvergenceInspection> {
  const columnsPresent = await requiredColumnsPresent(runner, spec);
  const existing = await introspectIndex(runner, spec.name);
  const { state, plannedAction } = classifyIndexInspection(
    spec,
    existing,
    columnsPresent,
  );

  const foreignKeys: AudAForeignKeyInspection[] = [];
  for (const fkSpec of fks) {
    const fk = await introspectForeignKey(runner, fkSpec);

    let fkState: AudAForeignKeyInspectedState;
    let fkPlan: AudAForeignKeyPlan;
    if (!fk.exists) {
      fkState = 'absent';
      fkPlan = 'blocked-missing';
    } else if (!fk.matchesSpec) {
      fkState = 'present-wrong-definition';
      fkPlan = 'abort-wrong-definition';
    } else if (fk.convalidated) {
      fkState = 'present-exact-validated';
      fkPlan = 'no-op';
    } else {
      fkState = 'present-exact-unvalidated';
      fkPlan = 'validate';
    }

    foreignKeys.push({
      constraint: fkSpec.constraint,
      schema: fkSpec.schema,
      table: fkSpec.table,
      state: fkState,
      present: fk.exists,
      convalidated: fk.exists ? fk.convalidated : null,
      expectedDefinition: formatExpectedForeignKeyDef(fkSpec),
      currentDefinition: fk.definition,
      definitionMismatches:
        fkState === 'present-wrong-definition' ? fk.mismatches : [],
      plannedAction: fkPlan,
    });
  }

  return {
    expandMigrationApplied: columnsPresent,
    index: {
      name: spec.name,
      table: spec.table,
      state,
      currentDefinition: existing.indexdef,
      expectedDefinition: spec.expectedIndexdef,
      plannedAction,
    },
    foreignKeys,
    timeoutPolicy: {
      lockTimeoutMs: AUD_A_TIMEOUTS.LOCK_TIMEOUT_MS,
      indexBuildStatementTimeoutMs: AUD_A_TIMEOUTS.STATEMENT_TIMEOUT_INDEX_MS,
      fkValidateStatementTimeoutMs:
        AUD_A_TIMEOUTS.STATEMENT_TIMEOUT_VALIDATE_MS,
    },
  };
}

/**
 * {@link inspectAudAConvergence} plus `audit_events` cardinality / size
 * evidence for the operator gate. Size lookups are best-effort — a
 * permission-limited role still gets the inspection and row count. Read-only.
 */
export async function gatherAudAConvergenceEvidence(
  runner: SqlRunner,
): Promise<AudAConvergenceEvidence> {
  const inspection = await inspectAudAConvergence(runner);

  // Schema-qualified to `public.audit_events`, exactly like every other
  // AUD·A catalog read (`introspectIndex`/`requiredColumnsPresent`/
  // `introspectForeignKey` all anchor to `public` explicitly) — never
  // resolved through `search_path`. An operator role with a hostile/
  // decoy-earlier `search_path` must still get evidence for the canonical
  // relation, not whatever `audit_events` search_path happens to resolve
  // first, or the mandatory Production evidence gate could pass on the
  // wrong table's row count / size.
  let auditEventsRowCount: number | null = null;
  try {
    const rows = await runner.query<{ n: string }>(
      'select count(*)::text as n from "public"."audit_events"',
    );
    if (rows[0]) auditEventsRowCount = Number(rows[0].n);
  } catch {
    // leave null — evidence is best-effort
  }

  let auditEventsTableBytes: number | null = null;
  let auditEventsTotalRelationBytes: number | null = null;
  try {
    const rows = await runner.query<{ t: string; tot: string }>(
      'select pg_table_size(\'"public"."audit_events"\')::text as t, ' +
        'pg_total_relation_size(\'"public"."audit_events"\')::text as tot',
    );
    if (rows[0]) {
      auditEventsTableBytes = Number(rows[0].t);
      auditEventsTotalRelationBytes = Number(rows[0].tot);
    }
  } catch {
    // pg_table_size / pg_total_relation_size unavailable (e.g. PGlite) — null
  }

  return {
    inspection,
    auditEventsRowCount,
    auditEventsTableBytes,
    auditEventsTotalRelationBytes,
  };
}
