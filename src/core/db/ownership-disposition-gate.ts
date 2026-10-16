import type { SqlRunner } from './post-migrate-steps';

export type OwnershipDispositionGate = 'r4a' | 'r4b1';

export type OwnershipConstraintState =
  | 'missing'
  | 'wrong-definition'
  | 'exact-unvalidated'
  | 'exact-validated';

export type OwnershipDispositionAction =
  | 'blocked-missing-constraint'
  | 'blocked-wrong-constraint'
  | 'blocked-unsettled-rows'
  | 'validate-constraint'
  | 'no-op';

export interface OwnershipStateCounts {
  readonly total: number;
  readonly canonicalOrganization: number;
  readonly intentionalGlobal: number;
  readonly unresolvedLegacy: number;
  readonly quarantined: number;
  readonly organizationOwnedOrphaned: number;
}

export interface OwnershipConstraintInspection {
  readonly name: string;
  readonly exists: boolean;
  readonly validated: boolean;
  readonly currentExpression: string | null;
  readonly expectedExpression: string;
  readonly definitionMatches: boolean;
  readonly state: OwnershipConstraintState;
}

export interface OwnershipDispositionTableEvidence {
  readonly table: OwnershipDispositionTable;
  /**
   * Which later cleanup package this table gates.
   *
   * This is deliberately per-table:
   * - feature_flags / audit_log_settings -> R4a
   * - audit_events -> R4b-1
   */
  readonly gate: OwnershipDispositionGate;
  readonly counts: OwnershipStateCounts;
  readonly invalidCombinationCount: number;
  readonly constraint: OwnershipConstraintInspection;
  /**
   * Historical ownership disposition is settled independently of whether the
   * deferred CHECK has already been VALIDATEd.
   */
  readonly dispositionSettled: boolean;
  /**
   * True only after both data disposition AND the historical CHECK validation
   * are complete. This is the OZI-213 gate result for this table only.
   */
  readonly gateReady: boolean;
  readonly plannedAction: OwnershipDispositionAction;
}

export interface OwnershipDispositionEvidence {
  readonly featureFlags: OwnershipDispositionTableEvidence;
  readonly auditLogSettings: OwnershipDispositionTableEvidence;
  readonly auditEvents: OwnershipDispositionTableEvidence;
}

export type OwnershipDispositionTable =
  | 'feature_flags'
  | 'audit_log_settings'
  | 'audit_events';

interface OwnershipDispositionSpec {
  readonly table: OwnershipDispositionTable;
  readonly gate: OwnershipDispositionGate;
  readonly constraint: string;
  readonly expectedExpression: string;
  /**
   * Predicate selecting rows that violate the desired ownership-state /
   * organization-id relation.
   *
   * Compile-time constant only; never contains caller input.
   */
  readonly invalidPredicate: string;
}

/**
 * These expressions are the canonical pg_get_expr(...) representations of the
 * CHECKs installed by migrations 0021 / 0023.
 *
 * Constraint rollout state (`convalidated`) is deliberately NOT part of
 * identity. A same-name CHECK with another expression is schema drift and must
 * never be auto-validated.
 */
const FEATURE_OR_SETTINGS_EXPECTED_EXPRESSION =
  "ownership_state = 'canonical_organization'::text AND organization_id IS NOT NULL OR " +
  "(ownership_state = ANY (ARRAY['intentional_global'::text, 'unresolved_legacy'::text, " +
  "'quarantined'::text])) AND organization_id IS NULL";

const AUDIT_EVENTS_EXPECTED_EXPRESSION =
  "ownership_state = 'canonical_organization'::text OR " +
  "(ownership_state = ANY (ARRAY['organization_owned_orphaned'::text, " +
  "'intentional_global'::text, 'unresolved_legacy'::text, 'quarantined'::text])) " +
  'AND organization_id IS NULL';

const FEATURE_OR_SETTINGS_INVALID_PREDICATE = `ownership_state IS NULL OR NOT (
  (ownership_state = 'canonical_organization' AND organization_id IS NOT NULL)
  OR
  (
    ownership_state IN ('intentional_global', 'unresolved_legacy', 'quarantined')
    AND organization_id IS NULL
  )
)`;

const AUDIT_EVENTS_INVALID_PREDICATE = `ownership_state IS NULL OR NOT (
  ownership_state = 'canonical_organization'
  OR
  (
    ownership_state IN (
      'organization_owned_orphaned',
      'intentional_global',
      'unresolved_legacy',
      'quarantined'
    )
    AND organization_id IS NULL
  )
)`;

export const OWNERSHIP_DISPOSITION_SPECS: readonly OwnershipDispositionSpec[] =
  [
    {
      table: 'feature_flags',
      gate: 'r4a',
      constraint: 'ck_feature_flags_ownership_state_org',
      expectedExpression: FEATURE_OR_SETTINGS_EXPECTED_EXPRESSION,
      invalidPredicate: FEATURE_OR_SETTINGS_INVALID_PREDICATE,
    },
    {
      table: 'audit_log_settings',
      gate: 'r4a',
      constraint: 'ck_audit_log_settings_ownership_state_org',
      expectedExpression: FEATURE_OR_SETTINGS_EXPECTED_EXPRESSION,
      invalidPredicate: FEATURE_OR_SETTINGS_INVALID_PREDICATE,
    },
    {
      table: 'audit_events',
      gate: 'r4b1',
      constraint: 'ck_audit_events_ownership_state_org',
      expectedExpression: AUDIT_EVENTS_EXPECTED_EXPRESSION,
      invalidPredicate: AUDIT_EVENTS_INVALID_PREDICATE,
    },
  ] as const;

function toCount(value: unknown, label: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      `[ownership-disposition-gate] invalid ${label} count: ${String(value)}`,
    );
  }

  return parsed;
}

function toBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1;
}

function isExplicitFalse(value: unknown): boolean {
  return value === false || value === 'f' || value === 'false' || value === 0;
}

export function normalizeOwnershipCheckExpression(expression: string): string {
  // Preserve all semantic tokens exactly, including case-sensitive string
  // literals and quoted identifiers. pg_get_expr() is our canonical
  // PostgreSQL renderer; normalization removes formatting whitespace only.
  return expression.replace(/\s+/g, ' ').trim();
}

export function classifyOwnershipConstraint(
  name: string,
  expectedExpression: string,
  row:
    | {
        readonly convalidated: unknown;
        readonly connoinherit: unknown;
        readonly expression: string | null;
      }
    | undefined,
): OwnershipConstraintInspection {
  if (!row) {
    return {
      name,
      exists: false,
      validated: false,
      currentExpression: null,
      expectedExpression,
      definitionMatches: false,
      state: 'missing',
    };
  }

  const definitionMatches =
    typeof row.expression === 'string' &&
    isExplicitFalse(row.connoinherit) &&
    normalizeOwnershipCheckExpression(row.expression) ===
      normalizeOwnershipCheckExpression(expectedExpression);

  const validated = toBool(row.convalidated);

  return {
    name,
    exists: true,
    validated,
    currentExpression: row.expression,
    expectedExpression,
    definitionMatches,
    state: definitionMatches
      ? validated
        ? 'exact-validated'
        : 'exact-unvalidated'
      : 'wrong-definition',
  };
}

export function classifyOwnershipDispositionTable(input: {
  readonly table: OwnershipDispositionTable;
  readonly gate: OwnershipDispositionGate;
  readonly counts: OwnershipStateCounts;
  readonly invalidCombinationCount: number;
  readonly constraint: OwnershipConstraintInspection;
}): OwnershipDispositionTableEvidence {
  const unsettledRows =
    input.counts.unresolvedLegacy > 0 ||
    input.counts.quarantined > 0 ||
    input.invalidCombinationCount > 0;

  const exactConstraint =
    input.constraint.exists && input.constraint.definitionMatches;

  // Historical data disposition and schema convergence are separate facts.
  // Missing, drifted, or NOT VALID schema blocks the gate without changing
  // whether the historical ownership population itself is already settled.
  const dispositionSettled = !unsettledRows;

  let plannedAction: OwnershipDispositionAction;

  if (!input.constraint.exists) {
    plannedAction = 'blocked-missing-constraint';
  } else if (!input.constraint.definitionMatches) {
    plannedAction = 'blocked-wrong-constraint';
  } else if (unsettledRows) {
    plannedAction = 'blocked-unsettled-rows';
  } else if (!input.constraint.validated) {
    plannedAction = 'validate-constraint';
  } else {
    plannedAction = 'no-op';
  }

  return {
    ...input,
    dispositionSettled,
    gateReady:
      dispositionSettled &&
      exactConstraint &&
      input.constraint.validated &&
      plannedAction === 'no-op',
    plannedAction,
  };
}

interface CountRow {
  readonly total: unknown;
  readonly canonical_organization: unknown;
  readonly intentional_global: unknown;
  readonly unresolved_legacy: unknown;
  readonly quarantined: unknown;
  readonly organization_owned_orphaned: unknown;
  readonly invalid_combinations: unknown;
}

interface ConstraintRow {
  readonly convalidated: unknown;
  readonly connoinherit: unknown;
  readonly expression: string | null;
}

async function inspectTable(
  runner: SqlRunner,
  spec: OwnershipDispositionSpec,
): Promise<OwnershipDispositionTableEvidence> {
  const countRows = await runner.query<CountRow>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (
         WHERE ownership_state = 'canonical_organization'
       )::text AS canonical_organization,
       count(*) FILTER (
         WHERE ownership_state = 'intentional_global'
       )::text AS intentional_global,
       count(*) FILTER (
         WHERE ownership_state = 'unresolved_legacy'
       )::text AS unresolved_legacy,
       count(*) FILTER (
         WHERE ownership_state = 'quarantined'
       )::text AS quarantined,
       count(*) FILTER (
         WHERE ownership_state = 'organization_owned_orphaned'
       )::text AS organization_owned_orphaned,
       count(*) FILTER (
         WHERE ${spec.invalidPredicate}
       )::text AS invalid_combinations
     FROM public."${spec.table}"`,
  );

  const countRow = countRows[0];
  if (!countRow) {
    throw new Error(
      `[ownership-disposition-gate] ${spec.table} count inspection returned no row`,
    );
  }

  const constraintRows = await runner.query<ConstraintRow>(
    `SELECT
       c.convalidated,
       c.connoinherit,
       pg_get_expr(c.conbin, c.conrelid, true) AS expression
     FROM pg_constraint c
     JOIN pg_class rel
       ON rel.oid = c.conrelid
     JOIN pg_namespace ns
       ON ns.oid = rel.relnamespace
     WHERE ns.nspname = 'public'
       AND rel.relname = '${spec.table}'
       AND c.conname = '${spec.constraint}'
       AND c.contype = 'c'`,
  );

  if (constraintRows.length > 1) {
    throw new Error(
      `[ownership-disposition-gate] ambiguous CHECK inspection for ` +
        `${spec.table}.${spec.constraint}`,
    );
  }

  const counts: OwnershipStateCounts = {
    total: toCount(countRow.total, `${spec.table}.total`),
    canonicalOrganization: toCount(
      countRow.canonical_organization,
      `${spec.table}.canonical_organization`,
    ),
    intentionalGlobal: toCount(
      countRow.intentional_global,
      `${spec.table}.intentional_global`,
    ),
    unresolvedLegacy: toCount(
      countRow.unresolved_legacy,
      `${spec.table}.unresolved_legacy`,
    ),
    quarantined: toCount(countRow.quarantined, `${spec.table}.quarantined`),
    organizationOwnedOrphaned: toCount(
      countRow.organization_owned_orphaned,
      `${spec.table}.organization_owned_orphaned`,
    ),
  };

  const invalidCombinationCount = toCount(
    countRow.invalid_combinations,
    `${spec.table}.invalid ownership combination`,
  );

  const constraint = classifyOwnershipConstraint(
    spec.constraint,
    spec.expectedExpression,
    constraintRows[0],
  );

  return classifyOwnershipDispositionTable({
    table: spec.table,
    gate: spec.gate,
    counts,
    invalidCombinationCount,
    constraint,
  });
}

/**
 * OZI-213 — read-only, per-table ownership disposition inspection.
 *
 * Issues SELECTs only. There is deliberately no aggregate "all tables ready"
 * boolean because the approved OZI-71 sequence has independent gates:
 *
 * - feature_flags       -> R4a
 * - audit_log_settings  -> R4a
 * - audit_events        -> R4b-1
 *
 * In particular, unresolved/quarantined audit_events must never block the
 * Feature Flags / Audit Settings R4a path.
 */
export async function gatherOwnershipDispositionEvidence(
  runner: SqlRunner,
): Promise<OwnershipDispositionEvidence> {
  const byTable = new Map<
    OwnershipDispositionTable,
    OwnershipDispositionTableEvidence
  >();

  for (const spec of OWNERSHIP_DISPOSITION_SPECS) {
    byTable.set(spec.table, await inspectTable(runner, spec));
  }

  const featureFlags = byTable.get('feature_flags');
  const auditLogSettings = byTable.get('audit_log_settings');
  const auditEvents = byTable.get('audit_events');

  if (!featureFlags || !auditLogSettings || !auditEvents) {
    throw new Error(
      '[ownership-disposition-gate] incomplete per-table inspection',
    );
  }

  return {
    featureFlags,
    auditLogSettings,
    auditEvents,
  };
}
