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
 * into a versioned, dual-fingerprinted artifact for later human review --
 * it does not decide anything, connect to anything remote, or execute
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
 *
 * ## Two fingerprints, two different jobs
 *
 * `scopeFingerprint` is the stable, cross-run "what was reviewed"
 * identity: target, commit, schema migration, and the exact registry
 * content (`registryFingerprint` + every statement fingerprint). Two
 * preflight runs against the identical schema and query set produce the
 * *same* `scopeFingerprint`, even though their `EXPLAIN` plans and
 * relation stats will normally differ run to run (ordinary data/vacuum/
 * analyze churn). This is what a human approval realistically references.
 *
 * `artifactFingerprint` is the exact-evidence identity: everything in the
 * scope, plus `generatedAt` and the full collected evidence
 * (`requiredRelationStats`, all 16 complete `statementPlans` -- raw plan,
 * parsed facts, planning metadata). It is **not** expected to reproduce
 * across two different runs, even against the identical schema -- that
 * would defeat its purpose. Its job is narrower: prove *this specific
 * artifact instance* has not been mutated since it was produced
 * (`checkArtifactIntegrity`).
 *
 * **`artifactFingerprint` is an integrity/identity value, not an
 * authentication mechanism.** Passing `checkArtifactIntegrity` only
 * proves an artifact is internally self-consistent -- it says nothing
 * about whether a human ever actually approved it. A future scan must
 * compare an artifact's fingerprint against a separately, externally
 * recorded *approved* fingerprint (e.g. from an approval record kept
 * outside the artifact itself) before trusting it -- never accept an
 * artifact merely because it is self-consistent.
 */

type Tx = PostgresJsDatabase<Record<string, never>>;

// ─── Relation statistics ────────────────────────────────────────────────

export interface RelationStat {
  readonly schema: ApplicationSchema;
  readonly table: string;
  readonly estimatedRowCount: number;
  readonly relPages: number;
  readonly relationSizeBytes: number;
  readonly totalRelationSizeBytes: number;
  readonly indexSizeBytes: number;
}

/**
 * `pg_catalog` size/row-estimate metadata for exactly
 * `REQUIRED_SELECT_TABLES` -- not a caller-selected table list, not every
 * table in the schema. `reltuples`/`relpages` are planner estimates
 * (updated by `ANALYZE`/autovacuum), not a live `count(*)` -- exactly
 * what a plan review needs (the planner's own view of the data), and
 * cheap to read regardless of table size. `pg_indexes_size` sums every
 * index on the relation separately from `pg_total_relation_size` (which
 * already includes indexes) so a reviewer can see index weight on its
 * own, not just folded into the total.
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
    rel_pages: string;
    relation_size_bytes: string;
    total_relation_size_bytes: string;
    index_size_bytes: string;
  }>(sql`
    select
      n.nspname as schema,
      c.relname as table_name,
      c.reltuples::bigint as estimated_row_count,
      c.relpages as rel_pages,
      pg_relation_size(c.oid) as relation_size_bytes,
      pg_total_relation_size(c.oid) as total_relation_size_bytes,
      pg_indexes_size(c.oid) as index_size_bytes
    from pg_class c
    join pg_namespace n on c.relnamespace = n.oid
    where (n.nspname, c.relname) in (${tablePairs})
  `);
  return rows.map((row) => ({
    schema: row.schema,
    table: row.table_name,
    estimatedRowCount: Number(row.estimated_row_count),
    relPages: Number(row.rel_pages),
    relationSizeBytes: Number(row.relation_size_bytes),
    totalRelationSizeBytes: Number(row.total_relation_size_bytes),
    indexSizeBytes: Number(row.index_size_bytes),
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
 * a synthetic, multi-level plan fixture, without a database. `children`
 * preserves `Plans`' original order -- it is the actual left-to-right
 * structure of the query plan tree, not a sortable collection.
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
 * Narrowed to the closed remote-environment domain -- deliberately not
 * importing `RemoteTarget` from `readonly-db-remote.ts` (or anything else
 * from it): this module stays structurally independent of that one, the
 * same way `LocalTarget` and `RemoteTarget` stay independent of each
 * other. Phase B2 will be the (separately authorized) work of deriving a
 * real value here from `describeRemoteTarget`; nothing here does that.
 */
export type ExplainPreflightEnvironment = 'staging' | 'production';

/**
 * Caller-supplied, not collector-derived: this module has no concept of
 * "which environment" -- it only knows how to read a transaction handed
 * to it. `descriptor` is expected to be the same safe `host:port/database`
 * shape `describeRemoteTarget`/`describeLocalTarget` already produce
 * elsewhere in this tool -- never a raw connection string or credential.
 */
export interface ExplainPreflightTargetMetadata {
  readonly environment: ExplainPreflightEnvironment;
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
  /** Stable, cross-run "what was reviewed" identity -- see the module doc comment. */
  readonly scopeFingerprint: string;
  /** Exact-evidence identity of this specific artifact instance -- see the module doc comment. */
  readonly artifactFingerprint: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Recursively sorts object keys at every level so two structurally
 * identical values always serialize identically regardless of property
 * insertion order. Deliberately does **not** reorder array elements --
 * only the two explicit top-level sorts in the callers below (statement
 * plans/fingerprints by `id`, relation stats by `schema`+`table`) change
 * array order; everything else, including a plan node's `children`/
 * `Plans`, is a semantically ordered sequence (the real left-to-right
 * shape of the query plan), not a sortable set, and is preserved as-is.
 */
function canonicalizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeDeep(entry));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    // A null-prototype object, not `{}`: on a plain object literal,
    // `Object.prototype.__proto__` is an accessor, so `result[key] = ...`
    // where `key` is literally the string `"__proto__"` (e.g. this
    // artifact's `rawPlan` -- untrusted stored/loaded input, not
    // something this module authored -- tampered with an own `__proto__`
    // property) would silently reassign `result`'s prototype instead of
    // creating an enumerable own property. `JSON.stringify` would then
    // never see that key at all, so two artifacts differing only by an
    // injected `__proto__` key would canonicalize identically and
    // collide onto the same fingerprint -- exactly the kind of collision
    // this whole canonicalization step exists to prevent. A
    // null-prototype object has no such accessor, so every key,
    // including `__proto__`, becomes a normal own property instead.
    const result: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const key of sortedKeys) {
      // `key` comes from `Object.keys` on this same object -- an own,
      // enumerable key, not an externally chosen lookup path -- and
      // `result` has no inherited setters to trigger (see above), so
      // this assignment cannot do anything but create a plain own
      // property (SEC-18-style closed iteration, not dynamic external
      // access).
      // eslint-disable-next-line security/detect-object-injection
      result[key] = canonicalizeDeep(record[key]);
    }
    return result;
  }
  return value;
}

type ScopeFingerprintPayload = Pick<
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

/**
 * The stable, cross-run "what was reviewed" identity -- see the module
 * doc comment's "Two fingerprints, two different jobs" section. Excludes
 * `generatedAt` and all collected evidence (raw plans, parsed facts,
 * relation stats): those are expected to vary between two runs against
 * the *same* schema and query set as normal data/vacuum/analyze churn,
 * and including them here would make this fingerprint fail to reproduce
 * for what should be treated as the identical review scope.
 */
export function computeScopeFingerprint(
  payload: ScopeFingerprintPayload,
): string {
  const canonical = canonicalizeDeep({
    version: payload.version,
    target: payload.target,
    commit: payload.commit,
    schemaMigration: payload.schemaMigration,
    statementFingerprints: [...payload.statementFingerprints].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    registryFingerprint: payload.registryFingerprint,
    priorityManualReviewStatementIds: [
      ...payload.priorityManualReviewStatementIds,
    ].sort(),
    requiresManualReview: payload.requiresManualReview,
  });
  return sha256(JSON.stringify(canonical));
}

type ArtifactFingerprintPayload = ScopeFingerprintPayload &
  Pick<
    ExplainPreflightArtifactV1,
    'generatedAt' | 'requiredRelationStats' | 'statementPlans'
  >;

function relationStatSortKey(stat: RelationStat): string {
  return `${stat.schema}.${stat.table}`;
}

/**
 * The exact-evidence identity of one specific artifact instance -- see
 * the module doc comment. Covers everything `computeScopeFingerprint`
 * does, plus `generatedAt` and the full collected evidence
 * (`requiredRelationStats`, every complete `statementPlans` entry
 * including its raw plan). This is deliberately **not** expected to
 * reproduce across two different collection runs, even against the
 * identical schema -- that reproducibility property belongs to
 * `computeScopeFingerprint`, not this function. This function's job is
 * narrower: let `checkArtifactIntegrity` prove a *specific* artifact
 * instance was not mutated after being produced.
 */
export function computeArtifactFingerprint(
  payload: ArtifactFingerprintPayload,
): string {
  const canonical = canonicalizeDeep({
    version: payload.version,
    target: payload.target,
    commit: payload.commit,
    schemaMigration: payload.schemaMigration,
    statementFingerprints: [...payload.statementFingerprints].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    registryFingerprint: payload.registryFingerprint,
    priorityManualReviewStatementIds: [
      ...payload.priorityManualReviewStatementIds,
    ].sort(),
    requiresManualReview: payload.requiresManualReview,
    generatedAt: payload.generatedAt,
    requiredRelationStats: [...payload.requiredRelationStats].sort((a, b) =>
      relationStatSortKey(a).localeCompare(relationStatSortKey(b)),
    ),
    statementPlans: [...payload.statementPlans].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  });
  return sha256(JSON.stringify(canonical));
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
 * metadata and assembles the versioned, dual-fingerprinted artifact. Kept
 * separate from collection specifically so this assembly/fingerprinting
 * logic is unit-testable without a database.
 */
export function buildExplainPreflightArtifact(
  facts: ExplainPreflightFacts,
  caller: ExplainPreflightCallerMetadata,
): ExplainPreflightArtifactV1 {
  const scopePayload: ScopeFingerprintPayload = {
    version: 1,
    target: caller.target,
    commit: caller.commit,
    schemaMigration: facts.schemaMigration,
    registryFingerprint: registryFingerprint(),
    statementFingerprints: allStatementFingerprints(),
    priorityManualReviewStatementIds: PRIORITY_MANUAL_REVIEW_STATEMENT_IDS,
    requiresManualReview: true,
  };
  const generatedAt = caller.generatedAt ?? new Date().toISOString();
  const artifactPayload: ArtifactFingerprintPayload = {
    ...scopePayload,
    generatedAt,
    requiredRelationStats: facts.requiredRelationStats,
    statementPlans: facts.statementPlans,
  };

  return {
    ...scopePayload,
    generatedAt,
    requiredRelationStats: facts.requiredRelationStats,
    statementPlans: facts.statementPlans,
    scopeFingerprint: computeScopeFingerprint(scopePayload),
    artifactFingerprint: computeArtifactFingerprint(artifactPayload),
  };
}

// ─── Compatibility / integrity checks (for later scan wiring -- unused today) ──

export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reason: string;
  readonly details?: Record<string, unknown>;
}

/**
 * A loaded artifact is untrusted stored input, not a value this module
 * itself constructed -- `TypeScript`'s static type on a compatibility
 * check's parameter is a compile-time promise, not a runtime guarantee.
 * Used to reject a malformed `statementFingerprints` entry cleanly before
 * any code dereferences `.id`/`.fingerprint` on it.
 */
function isPlausibleStatementFingerprintEntry(
  value: unknown,
): value is StatementFingerprintEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { id?: unknown; fingerprint?: unknown };
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.fingerprint === 'string' &&
    candidate.fingerprint.length > 0
  );
}

/**
 * Pure, synchronous, fail-closed: recomputes **both** `scopeFingerprint`
 * and `artifactFingerprint` from the artifact's own recorded contents and
 * compares each to its stored value. Proves the artifact has not been
 * mutated since it was produced.
 *
 * Checking only `artifactFingerprint` would miss a real tamper case:
 * `computeArtifactFingerprint` never reads the stored `scopeFingerprint`
 * field itself (it recomputes the scope's constituent fields directly),
 * so an artifact with its `scopeFingerprint` field silently rewritten to
 * an arbitrary value would still pass an `artifactFingerprint`-only
 * check. Since Phase B2 is documented to persist and separately approve
 * `scopeFingerprint`, this function must independently verify it too, or
 * an internally inconsistent approval identity could pass integrity.
 *
 * This does **not** prove the artifact was ever legitimately approved --
 * see the module doc comment. A future scan must additionally compare an
 * artifact's fingerprint against a separately, externally recorded
 * *approved* fingerprint before trusting it.
 */
export function checkArtifactIntegrity(
  artifact: ExplainPreflightArtifactV1,
): CompatibilityResult {
  if (
    !artifact ||
    typeof artifact.artifactFingerprint !== 'string' ||
    !artifact.artifactFingerprint ||
    typeof artifact.scopeFingerprint !== 'string' ||
    !artifact.scopeFingerprint
  ) {
    return {
      compatible: false,
      reason:
        'Artifact is missing its scope or artifact fingerprint; cannot prove integrity.',
    };
  }

  let recomputedScope: string;
  let recomputedArtifact: string;
  try {
    recomputedScope = computeScopeFingerprint(artifact);
    recomputedArtifact = computeArtifactFingerprint(artifact);
  } catch {
    return {
      compatible: false,
      reason:
        'Artifact contents could not be canonicalized; cannot prove integrity.',
    };
  }

  const scopeMismatch = recomputedScope !== artifact.scopeFingerprint;
  const artifactMismatch = recomputedArtifact !== artifact.artifactFingerprint;

  if (scopeMismatch || artifactMismatch) {
    return {
      compatible: false,
      reason:
        'Artifact contents do not match its recorded fingerprint(s) -- it may have been mutated since it was produced.',
      details: { scopeMismatch, artifactMismatch },
    };
  }

  return {
    compatible: true,
    reason:
      'Artifact contents match both its recorded scope and artifact fingerprints exactly.',
  };
}

/**
 * Pure, synchronous, fail-closed: exported for a **future** scan to call
 * before trusting a stored artifact's approval -- nothing in this branch
 * wires it to any command. "Fail closed" means every branch that cannot
 * *positively* prove a match returns `compatible: false`; there is no
 * default-true path.
 *
 * Independently of whether the top-level `registryFingerprint` string
 * already matches, always validates the artifact's own
 * `statementFingerprints` array structurally against the current
 * registry: exactly 16 entries, every id known and unique, no id
 * missing, no extra/unknown id, and every fingerprint value equal to the
 * current one for that id. This catches an artifact whose top-level
 * `registryFingerprint` string happens to be correct while its own
 * embedded per-statement list was independently tampered (missing,
 * duplicated, or swapped in an unrelated entry) -- a scenario the
 * top-level string alone cannot detect, since nothing re-derives it from
 * the array before trusting it.
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

  // Validate every entry's own shape before dereferencing `.id`/
  // `.fingerprint` below -- a loaded artifact is untrusted stored input,
  // and a malformed entry (e.g. `null`, or an object missing either
  // field) must be rejected cleanly, not thrown on. Fail-closed means
  // "reject", never "crash the caller".
  if (
    !artifact.statementFingerprints.every(isPlausibleStatementFingerprintEntry)
  ) {
    return {
      compatible: false,
      reason:
        'Artifact statementFingerprints contains a malformed entry; cannot prove compatibility.',
    };
  }

  const current = new Map(
    allStatementFingerprints().map((entry) => [entry.id, entry.fingerprint]),
  );

  const seenIds = new Set<string>();
  const duplicated: string[] = [];
  for (const entry of artifact.statementFingerprints) {
    if (seenIds.has(entry.id)) {
      duplicated.push(entry.id);
    }
    seenIds.add(entry.id);
  }

  const approved = new Map(
    artifact.statementFingerprints.map((entry) => [
      entry.id,
      entry.fingerprint,
    ]),
  );

  const changed: string[] = [];
  const missing: string[] = [];
  for (const [id, fingerprint] of current) {
    if (!approved.has(id)) {
      missing.push(id);
    } else if (approved.get(id) !== fingerprint) {
      changed.push(id);
    }
  }
  const extra: string[] = [];
  for (const id of approved.keys()) {
    if (!current.has(id)) {
      extra.push(id);
    }
  }

  const countMismatch = artifact.statementFingerprints.length !== current.size;
  const structurallyValid =
    duplicated.length === 0 &&
    missing.length === 0 &&
    extra.length === 0 &&
    changed.length === 0 &&
    !countMismatch;

  const currentRegistryFingerprint = registryFingerprint();
  const topLevelMismatch =
    currentRegistryFingerprint !== artifact.registryFingerprint;

  if (!structurallyValid || topLevelMismatch) {
    return {
      compatible: false,
      reason:
        !structurallyValid && !topLevelMismatch
          ? "The top-level registry fingerprint matches, but the artifact's per-statement fingerprint list does not structurally match the current registry."
          : 'Current QUERY_REGISTRY does not match the fingerprint(s) recorded on the approved artifact.',
      details: {
        changed,
        missing,
        extra,
        duplicated,
        expectedCount: current.size,
        actualCount: artifact.statementFingerprints.length,
        topLevelMismatch,
      },
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
  if (!artifact) {
    return {
      compatible: false,
      reason: 'Approved artifact is missing; cannot prove compatibility.',
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

/**
 * Pure, synchronous, fail-closed. `currentTarget` must be resolved by the
 * caller -- a future Phase B2 would derive it from the real
 * `RemoteTarget`/`describeRemoteTarget` wiring; this function does no I/O
 * and imports nothing from `readonly-db-remote.ts`. Both `environment`
 * and `descriptor` must match exactly: an artifact approved against
 * staging must never be treated as compatible with a production target
 * (or vice versa) merely because the registry and schema migration
 * happen to agree -- two environments can share both while holding
 * materially different data distributions.
 */
export function checkTargetCompatibility(
  currentTarget: ExplainPreflightTargetMetadata,
  artifact: Pick<ExplainPreflightArtifactV1, 'target'>,
): CompatibilityResult {
  if (
    !currentTarget ||
    !currentTarget.environment ||
    !currentTarget.descriptor
  ) {
    return {
      compatible: false,
      reason:
        'Current target is missing environment/descriptor; cannot prove compatibility.',
    };
  }
  if (
    !artifact ||
    !artifact.target ||
    !artifact.target.environment ||
    !artifact.target.descriptor
  ) {
    return {
      compatible: false,
      reason:
        'Approved artifact is missing target metadata; cannot prove compatibility.',
    };
  }
  if (
    currentTarget.environment !== artifact.target.environment ||
    currentTarget.descriptor !== artifact.target.descriptor
  ) {
    return {
      compatible: false,
      reason:
        'Current target does not match the target recorded on the approved artifact.',
      details: { current: currentTarget, approved: artifact.target },
    };
  }
  return {
    compatible: true,
    reason: 'Current target matches the approved artifact exactly.',
  };
}

export type { QualifiedTable };
