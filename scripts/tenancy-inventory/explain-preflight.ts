import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  allStatementFingerprints,
  QUERY_REGISTRY,
  registryFingerprint,
  REQUIRED_SELECT_TABLES,
  type ApplicationSchema,
  type QualifiedTable,
  type QueryStatement,
  type StatementFingerprintEntry,
  type StatementId,
} from './query-registry';
import {
  latestSchemaMigration,
  type LatestSchemaMigration,
} from './topology-queries';

/**
 * OZI-79 Phase B1: a **build-only, local-test-only** plain-`EXPLAIN`
 * preflight core. This module collects `EXPLAIN` plans and relation
 * statistics for the frozen Phase B0 `QUERY_REGISTRY` and assembles them
 * into a versioned, fingerprinted artifact for later human review -- it
 * does not decide anything, connect to anything remote, or execute
 * anything beyond `EXPLAIN` (never `EXPLAIN ANALYZE`).
 *
 * Explicit non-goals, enforced by what this file does NOT import or call:
 * - no `withReadOnlyRemoteDb`, `describeRemoteTarget`, or any other
 *   `readonly-db-remote.ts` symbol
 * - no `writeEvidence('staging' | 'production', ...)`
 * - no `cli.ts` wiring, no `scan --target=...` command, no remote
 *   credential, no remote connection anywhere in this module
 * - no automatic production-safe verdict or numeric risk threshold --
 *   `requiresManualReview` is always `true`; this tool produces facts for
 *   a human to read, not a decision
 *
 * `collectExplainPreflightFacts` accepts an already-open transaction/
 * handle -- exactly the same `Tx` shape `readonly-db.ts`'s
 * `withReadOnlyDb` and `readonly-db-remote.ts`'s `withReadOnlyRemoteDb`
 * both already produce, structurally, with no import from either. Phase
 * B1 does not decide which one a caller uses; a future Phase B2 would be
 * the (separately authorized) decision to actually call this against a
 * remote transaction.
 */

type Tx = PostgresJsDatabase<Record<string, never>>;

// ─── Relation statistics ────────────────────────────────────────────────

export interface RelationStat {
  readonly schema: ApplicationSchema;
  readonly table: string;
  readonly estimatedRowCount: number;
  readonly relationSizeBytes: number;
  readonly totalRelationSizeBytes: number;
}

/**
 * `pg_catalog` size/row-estimate metadata for exactly
 * `REQUIRED_SELECT_TABLES` -- not a caller-selected table list, not every
 * table in the schema. `reltuples` is a planner estimate (updated by
 * `ANALYZE`/autovacuum), not a live `count(*)` -- exactly what a plan-
 * review needs (the planner's own view of the data), and cheap to read
 * regardless of table size.
 */
async function collectRequiredRelationStats(
  tx: Tx,
): Promise<readonly RelationStat[]> {
  const tablePairs = sql.join(
    REQUIRED_SELECT_TABLES.map(
      ({ schema, table }) => sql`(${schema}, ${table})`,
    ),
    sql`, `,
  );
  const rows = await tx.execute<{
    schema: ApplicationSchema;
    table_name: string;
    estimated_row_count: string;
    relation_size_bytes: string;
    total_relation_size_bytes: string;
  }>(sql`
    select
      n.nspname as schema,
      c.relname as table_name,
      c.reltuples::bigint as estimated_row_count,
      pg_relation_size(c.oid) as relation_size_bytes,
      pg_total_relation_size(c.oid) as total_relation_size_bytes
    from pg_class c
    join pg_namespace n on c.relnamespace = n.oid
    where (n.nspname, c.relname) in (${tablePairs})
  `);
  return rows.map((row) => ({
    schema: row.schema,
    table: row.table_name,
    estimatedRowCount: Number(row.estimated_row_count),
    relationSizeBytes: Number(row.relation_size_bytes),
    totalRelationSizeBytes: Number(row.total_relation_size_bytes),
  }));
}

// ─── Plan parsing ───────────────────────────────────────────────────────

export interface PlanNodeFact {
  readonly nodeType: string;
  readonly relationName?: string;
  readonly schema?: string;
  readonly indexName?: string;
  readonly joinType?: string;
  readonly startupCost?: number;
  readonly totalCost?: number;
  readonly planRows?: number;
  readonly children: readonly PlanNodeFact[];
}

/**
 * Loosely typed on purpose: Postgres's `EXPLAIN (FORMAT JSON)` output has
 * dozens of node-type-specific fields (`Filter`, `Hash Cond`, `Sort Key`,
 * `Group Key`, ...) that this preflight core does not need to model --
 * the raw plan is stored verbatim in the artifact for a human to read in
 * full; `PlanNodeFact` only lifts out the handful of fields relevant to a
 * fast, structural, cross-statement review (node/join/index shape,
 * relation identity, planner cost/row estimates).
 */
export interface RawExplainPlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly Schema?: string;
  readonly 'Index Name'?: string;
  readonly 'Join Type'?: string;
  readonly 'Startup Cost'?: number;
  readonly 'Total Cost'?: number;
  readonly 'Plan Rows'?: number;
  readonly Plans?: readonly RawExplainPlanNode[];
}

interface RawExplainRoot {
  readonly Plan: RawExplainPlanNode;
  readonly 'Planning Time'?: number;
}

/**
 * Exported so plan-parsing recursion can be unit-tested directly against
 * a synthetic, multi-level plan fixture, without a database.
 */
export function parsePlanNode(node: RawExplainPlanNode): PlanNodeFact {
  return {
    nodeType: node['Node Type'],
    relationName: node['Relation Name'],
    schema: node.Schema,
    indexName: node['Index Name'],
    joinType: node['Join Type'],
    startupCost: node['Startup Cost'],
    totalCost: node['Total Cost'],
    planRows: node['Plan Rows'],
    children: (node.Plans ?? []).map(parsePlanNode),
  };
}

/**
 * Named explicitly by the OZI-79 review as needing especially close
 * manual scrutiny once real `EXPLAIN` plans are available:
 * `tenant_id_shape_audit_events` reads the largest, highest-churn table
 * this tool ever touches; `quota_exceeding_max_users` is the registry's
 * only three-table join. Neither gets special SQL or different EXPLAIN
 * treatment -- this only flags them in the artifact so a human reviewer's
 * attention goes there first, not last.
 */
export const PRIORITY_MANUAL_REVIEW_STATEMENT_IDS: readonly StatementId[] = [
  'tenant_id_shape_audit_events',
  'quota_exceeding_max_users',
];

export interface StatementPlanResult {
  readonly id: StatementId;
  readonly kind: 'data' | 'metadata';
  readonly isPriorityManualReview: boolean;
  readonly planningTimeMs?: number;
  /** The raw `EXPLAIN (FORMAT JSON)` plan node, unprocessed. */
  readonly rawPlan: unknown;
  readonly facts: PlanNodeFact;
}

/**
 * Plain `EXPLAIN` only -- `ANALYZE FALSE` is explicit and non-negotiable
 * here: `ANALYZE TRUE` would actually execute the statement, which is
 * exactly what this preflight tool exists to avoid needing before a plan
 * can be reviewed. `VERBOSE FALSE`/`SETTINGS FALSE` keep the plan focused
 * on shape/cost, not full expression trees or a server-config dump.
 */
async function explainStatement(
  tx: Tx,
  statement: QueryStatement,
): Promise<StatementPlanResult> {
  const rows = await tx.execute<{ 'QUERY PLAN': readonly RawExplainRoot[] }>(
    sql`explain (format json, analyze false, costs true, verbose false, settings false) ${sql.raw(statement.sql)}`,
  );
  const root = rows[0]?.['QUERY PLAN']?.[0];
  if (!root) {
    throw new Error(
      `[tenancy-inventory] EXPLAIN returned no plan for statement "${statement.id}".`,
    );
  }
  return {
    id: statement.id,
    kind: statement.kind,
    isPriorityManualReview: PRIORITY_MANUAL_REVIEW_STATEMENT_IDS.includes(
      statement.id,
    ),
    planningTimeMs: root['Planning Time'],
    rawPlan: root.Plan,
    facts: parsePlanNode(root.Plan),
  };
}

// ─── Collection ─────────────────────────────────────────────────────────

export interface ExplainPreflightFacts {
  readonly schemaMigration: LatestSchemaMigration | null;
  readonly requiredRelationStats: readonly RelationStat[];
  readonly statementPlans: readonly StatementPlanResult[];
}

/**
 * The DB-facing half of Phase B1: given an already-open transaction/
 * handle, sequentially (1) reads the existing schema-migration metadata
 * (reused unchanged from `topology-queries.ts`, not reimplemented), (2)
 * reads `pg_catalog` stats for exactly `REQUIRED_SELECT_TABLES`, and (3)
 * plain-`EXPLAIN`s all 16 `QUERY_REGISTRY` statements, in registry order,
 * one at a time.
 *
 * There is no parameter here for a caller-selected query subset or
 * arbitrary SQL -- the statement set is always exactly `QUERY_REGISTRY`,
 * by construction. Sequential, not `Promise.all`, for the same reason
 * `topology-queries.ts`'s `quotaEnforcementSignal` stayed sequential: a
 * preflight tool must not place more concurrent load on whatever it's
 * pointed at than the queries it is reviewing would.
 */
export async function collectExplainPreflightFacts(
  tx: Tx,
): Promise<ExplainPreflightFacts> {
  const schemaMigration = await latestSchemaMigration(tx);
  const requiredRelationStats = await collectRequiredRelationStats(tx);

  const statementPlans: StatementPlanResult[] = [];
  for (const statement of QUERY_REGISTRY) {
    statementPlans.push(await explainStatement(tx, statement));
  }

  return { schemaMigration, requiredRelationStats, statementPlans };
}

// ─── Artifact contract ──────────────────────────────────────────────────

/**
 * Caller-supplied, not collector-derived: this module has no concept of
 * "which environment" -- it only knows how to read a transaction handed
 * to it. Phase B1 has no caller that fills this in with anything but a
 * local descriptor (see the tests); a `staging`/`production` value here
 * is a Phase B2 concern, still unauthorized.
 */
export interface ExplainPreflightTargetMetadata {
  readonly environment: string;
  readonly descriptor: string;
}

/** Caller-supplied, mirroring `cli.ts`'s `resolveCommitSha`/`isWorkingTreeDirty` -- this module never shells out to git itself. */
export interface ExplainPreflightCommitMetadata {
  readonly commitSha: string;
  readonly workingTreeDirty: boolean;
}

export interface ExplainPreflightArtifactV1 {
  readonly version: 1;
  readonly target: ExplainPreflightTargetMetadata;
  readonly commit: ExplainPreflightCommitMetadata;
  readonly generatedAt: string;
  readonly schemaMigration: LatestSchemaMigration | null;
  readonly registryFingerprint: string;
  readonly statementFingerprints: readonly StatementFingerprintEntry[];
  readonly priorityManualReviewStatementIds: readonly StatementId[];
  /** Always `true` -- this tool never produces an automated verdict. */
  readonly requiresManualReview: true;
  readonly requiredRelationStats: readonly RelationStat[];
  readonly statementPlans: readonly StatementPlanResult[];
  readonly artifactFingerprint: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The fields the artifact fingerprint covers, and the fields it
 * deliberately does not.
 *
 * Covered: `target`, `commit`, `schemaMigration`, `registryFingerprint`,
 * `statementFingerprints`, `priorityManualReviewStatementIds`,
 * `requiresManualReview` -- together, exactly "what was reviewed, against
 * which schema, on which target, at which commit." This is what a later
 * compatibility check needs to bind an approval to.
 *
 * Deliberately excluded: `generatedAt` (a timestamp -- including it would
 * make the fingerprint different on every single run even with zero real
 * drift, which is not "deterministic" in any useful sense), `rawPlan`/
 * `facts`/`requiredRelationStats` (planner estimates and relation sizes
 * are expected to vary between two runs against the *same* schema and
 * query set as normal data/vacuum/analyze churn -- fingerprinting them
 * would make the fingerprint fail to reproduce for the identical review
 * scope, which is the opposite of what a binding artifact fingerprint is
 * for). Statement-level SQL/table-set content is already covered via
 * `registryFingerprint`/`statementFingerprints` -- there is no separate
 * need to re-hash the plans themselves to prove which queries were run.
 */
type ArtifactFingerprintPayload = Pick<
  ExplainPreflightArtifactV1,
  | 'version'
  | 'target'
  | 'commit'
  | 'schemaMigration'
  | 'registryFingerprint'
  | 'statementFingerprints'
  | 'priorityManualReviewStatementIds'
  | 'requiresManualReview'
>;

function canonicalArtifactRepresentation(
  payload: ArtifactFingerprintPayload,
): string {
  return JSON.stringify({
    version: payload.version,
    target: payload.target,
    commit: payload.commit,
    schemaMigration: payload.schemaMigration,
    registryFingerprint: payload.registryFingerprint,
    statementFingerprints: [...payload.statementFingerprints].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    priorityManualReviewStatementIds: [
      ...payload.priorityManualReviewStatementIds,
    ].sort(),
    requiresManualReview: payload.requiresManualReview,
  });
}

export function computeArtifactFingerprint(
  payload: ArtifactFingerprintPayload,
): string {
  return sha256(canonicalArtifactRepresentation(payload));
}

export interface ExplainPreflightCallerMetadata {
  readonly target: ExplainPreflightTargetMetadata;
  readonly commit: ExplainPreflightCommitMetadata;
  /** Overridable for deterministic tests; defaults to `new Date().toISOString()`. */
  readonly generatedAt?: string;
}

/**
 * The pure half of Phase B1: no DB I/O, no clock dependency beyond an
 * overridable `generatedAt`. Takes already-collected facts (see
 * `collectExplainPreflightFacts`) plus caller-supplied target/commit
 * metadata and assembles the versioned, fingerprinted artifact. Kept
 * separate from collection specifically so this assembly/fingerprinting
 * logic is unit-testable without a database.
 */
export function buildExplainPreflightArtifact(
  facts: ExplainPreflightFacts,
  caller: ExplainPreflightCallerMetadata,
): ExplainPreflightArtifactV1 {
  const payload: ArtifactFingerprintPayload = {
    version: 1,
    target: caller.target,
    commit: caller.commit,
    schemaMigration: facts.schemaMigration,
    registryFingerprint: registryFingerprint(),
    statementFingerprints: allStatementFingerprints(),
    priorityManualReviewStatementIds: PRIORITY_MANUAL_REVIEW_STATEMENT_IDS,
    requiresManualReview: true,
  };

  return {
    ...payload,
    generatedAt: caller.generatedAt ?? new Date().toISOString(),
    requiredRelationStats: facts.requiredRelationStats,
    statementPlans: facts.statementPlans,
    artifactFingerprint: computeArtifactFingerprint(payload),
  };
}

// ─── Compatibility checks (for later scan wiring -- unused today) ──────

export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reason: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Pure, synchronous, fail-closed: exported for a **future** scan to call
 * before trusting a stored artifact's approval -- nothing in this branch
 * wires it to any command. "Fail closed" means every branch that cannot
 * *positively* prove a match returns `compatible: false`; there is no
 * default-true path.
 *
 * Recomputes `registryFingerprint()` from the *current* in-process
 * `QUERY_REGISTRY` and compares it to what the artifact recorded. On
 * mismatch, also diffs the per-statement fingerprints so the caller can
 * report exactly which statement(s) drifted, not just "something did."
 */
export function checkRegistryCompatibility(
  artifact: Pick<
    ExplainPreflightArtifactV1,
    'registryFingerprint' | 'statementFingerprints'
  >,
): CompatibilityResult {
  if (
    !artifact ||
    typeof artifact.registryFingerprint !== 'string' ||
    !artifact.registryFingerprint ||
    !Array.isArray(artifact.statementFingerprints)
  ) {
    return {
      compatible: false,
      reason:
        'Artifact is missing registry fingerprint data; cannot prove compatibility.',
    };
  }

  const currentRegistryFingerprint = registryFingerprint();
  if (currentRegistryFingerprint !== artifact.registryFingerprint) {
    const current = new Map(
      allStatementFingerprints().map((entry) => [entry.id, entry.fingerprint]),
    );
    const approved = new Map(
      artifact.statementFingerprints.map((entry) => [
        entry.id,
        entry.fingerprint,
      ]),
    );
    const changed: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    for (const [id, fingerprint] of current) {
      if (!approved.has(id)) {
        added.push(id);
      } else if (approved.get(id) !== fingerprint) {
        changed.push(id);
      }
    }
    for (const id of approved.keys()) {
      if (!current.has(id)) {
        removed.push(id);
      }
    }
    return {
      compatible: false,
      reason:
        'Current QUERY_REGISTRY does not match the fingerprint recorded on the approved artifact.',
      details: { changed, added, removed },
    };
  }

  return {
    compatible: true,
    reason: 'Current QUERY_REGISTRY matches the approved artifact exactly.',
  };
}

/**
 * Pure, synchronous, fail-closed: `currentSchemaMigration` must be
 * resolved by the caller (a real DB read) and passed in -- this function
 * does no I/O itself. Neither a missing current migration nor a missing
 * approved migration is treated as compatible; only an exact `id` + `hash`
 * match is.
 */
export function checkSchemaCompatibility(
  currentSchemaMigration: LatestSchemaMigration | null,
  artifact: Pick<ExplainPreflightArtifactV1, 'schemaMigration'>,
): CompatibilityResult {
  if (!currentSchemaMigration) {
    return {
      compatible: false,
      reason:
        'Current target reports no applied schema migration; cannot prove compatibility.',
    };
  }
  if (!artifact.schemaMigration) {
    return {
      compatible: false,
      reason:
        'Approved artifact recorded no schema migration; cannot prove compatibility.',
    };
  }
  if (
    currentSchemaMigration.id !== artifact.schemaMigration.id ||
    currentSchemaMigration.hash !== artifact.schemaMigration.hash
  ) {
    return {
      compatible: false,
      reason:
        'Current schema migration does not match the migration recorded on the approved artifact.',
      details: {
        current: currentSchemaMigration,
        approved: artifact.schemaMigration,
      },
    };
  }
  return {
    compatible: true,
    reason: 'Current schema migration matches the approved artifact exactly.',
  };
}

export type { QualifiedTable };
