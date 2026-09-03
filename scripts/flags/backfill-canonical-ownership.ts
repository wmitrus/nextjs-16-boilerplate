import '../load-env';

import { randomUUID } from 'node:crypto';
import { closeSync } from 'node:fs';

import { and, asc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm';

import { isCanonicalIdRepresentation } from '@/core/contracts/canonical-ids.provenance';
import {
  classifyLegacyOwnership,
  type LegacyNullSemantics,
  type LegacyOwnershipClassification,
  type LegacyOwnershipEvidence,
  type LegacyOwnershipReason,
  type ProviderMappingEvidence,
  type ResolvedOrganization,
} from '@/core/contracts/legacy-ownership-classification';
import { createDb } from '@/core/db/create-db';
import {
  authOrganizationIdentitiesReferenceTable,
  organizationsReferenceTable,
  tenantsReferenceTable,
} from '@/core/db/schema/references';
import type { DrizzleDb } from '@/core/db/types';

import {
  appendRecordDurably,
  openNewWalFileWithinBase,
  pathExistsWithinBase,
  physicalBaseDir,
  publishFileAtomicallyWithinBase,
  resolvePhysicalTargetWithinBase,
} from '../lib/fs-guards-shared';

import { resolveDriver, resolveProvider } from './utils';

import { featureFlagsTable } from '@/modules/feature-flags/infrastructure/drizzle/schema';

/**
 * OZI-71 FF·C — evidence-based, dry-run-first, resumable historical
 * classification / backfill of pre-FF·B `feature_flags` rows.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * ────────────────────────────────────────────────────────────────────────────
 * For every row still in the FF·A fail-closed initial state
 * (`ownership_state = 'unresolved_legacy' AND organization_id IS NULL`) it
 * gathers authoritative evidence for the legacy `tenant_id` value and applies
 * the NEUTRAL §14a.10 classifier (`@/core/contracts/legacy-ownership-classification`):
 *
 *   - a real `organizations.id`               -> canonical_organization
 *     (the canonical id + parent tenant are READ FROM the matched
 *     `organizations` row — `organizations.id` / `organizations.tenant_id` —
 *     never the raw legacy input, so an upper-case legacy UUID resolves to its
 *     canonical DB spelling and does not falsely disagree with a provider map)
 *   - `auth_organization_identities` mapping(s) — across ALL providers — that
 *     collapse to ONE re-verified internal organization -> canonical_organization
 *   - legacy `tenant_id IS NULL` (+ Feature Flags' PROVEN NULL == global
 *     semantics)                              -> intentional_global
 *   - a real `tenants.id` only / unknown UUID / arbitrary string /
 *     internal-vs-provider disagreement / providers disagreeing with each other /
 *     stale provider mapping                   -> stays unresolved_legacy (report only)
 *   - a resolved canonical `(key, org)` that a live FF·B dual-written row
 *     already owns                             -> quarantined (the FF·B row wins)
 *
 * The current runtime `AUTH_PROVIDER` is NOT provenance: historical rows do not
 * record which provider produced the external id, so EVERY
 * `auth_organization_identities` row for the legacy value is consulted.
 *
 * It NEVER: brands by UUID shape, picks internal-vs-provider or provider-vs-
 * provider by precedence, turns a `tenants.id` into an organization id, brands a
 * stale provider mapping's missing org, rewrites `tenant_id` / `key` /
 * `enabled` / `description` / `created_at` / `updated_at`, deletes a row, or
 * touches a `canonical_organization` / `intentional_global` / `quarantined` row.
 *
 * Reads stay on the LEGACY `tenant_id` contract — the runtime/admin canonical
 * cutover is FF·D and is NOT in this slice.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SAFETY MODEL
 * ────────────────────────────────────────────────────────────────────────────
 *   pnpm tsx scripts/flags/backfill-canonical-ownership.ts            # DRY RUN (default)
 *   pnpm tsx scripts/flags/backfill-canonical-ownership.ts --apply    # still dry-run; prints how to confirm
 *   pnpm tsx scripts/flags/backfill-canonical-ownership.ts \
 *     --apply --confirm --decisions=<new path> --report=<new path>    # MUTATES the configured DB
 *
 * `--apply --confirm` is a PRODUCTION-DATA-MUTATION-capable mode and REQUIRES
 * both `--decisions=<path>` (streamed NDJSON, complete per-row evidence) and
 * `--report=<path>` (summary JSON). Both paths MUST be new — an existing file
 * is a fail-closed error (a prior dry-run's audit evidence is never truncated)
 * — and `--decisions`, `--report` and `<report>.partial` must resolve to three
 * DISTINCT PHYSICAL targets: a lexical alias (`out/../report.json` vs
 * `report.json`), a symlinked parent directory that makes two paths address the
 * same inode, or a symlinked parent that escapes the real repo is rejected; a
 * missing parent directory is rejected too. Missing evidence paths, a path
 * alias, or an existing target all exit BEFORE any WAL / DB work.
 * Optional everywhere: --batch-size=<n> (default 500), --start-after=<uuid>.
 *
 * Before any Production run: 1. explicit dry-run; 2. review the decisions
 * artifact; 3. reconcile counts against the live table; 4. explicit operator
 * authorization; 5. backup / PITR posture; 6. statement/lock timeout;
 * 7. batch-size decision; 8. observability on; 9. verify post-run counts;
 * 10. do NOT progress to FF·D until the separate FF·D gate is satisfied.
 * This script connects ONLY to the DB the standard repo config resolves
 * (`DB_DRIVER` / `DATABASE_URL`); never auto-targets Production; never infers
 * apply from `NODE_ENV`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * COLLISION DISPOSITION (projected candidate set, not only persisted rows)
 * ────────────────────────────────────────────────────────────────────────────
 * A candidate that classifies to `(key, org, canonical_organization)` is
 * quarantined when EITHER an existing `canonical_organization` row already owns
 * `(key, org)` (always an FF·B dual-written row — historical rows never win) OR
 * any OTHER still-unresolved / already-quarantined sibling with the same `key`
 * ALSO resolves to `org`. Each competing historical row runs this check
 * independently and quarantines ITSELF — no winner is picked by id/UUID order.
 * Dry-run and apply run the identical disposition, so an unchanged database
 * produces the identical result. The same-key sibling set is bounded
 * (`SIBLING_LIMIT`), and its authoritative evidence is loaded SET-BASED — a
 * fixed, bounded number of `IN (...)` reads for the whole set, then the neutral
 * classifier in memory — NOT one evidence gather per sibling.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CONCURRENCY — ONE CONSISTENCY BOUNDARY PER APPLIED ROW
 * ────────────────────────────────────────────────────────────────────────────
 * Keyset pagination by `id` (never OFFSET). In `apply` mode each mutating row
 * runs inside its own transaction that:
 *   - `LOCK TABLE organizations, tenants, auth_organization_identities IN SHARE
 *     MODE` (consistent order across rows — no inter-row deadlock) so NO
 *     concurrent writer can change the authoritative lookup data while the row
 *     is evaluated and mutated;
 *   - `SELECT ... FOR UPDATE` the candidate `feature_flags` row and verify its
 *     key / tenant_id / state are still exactly what was classified;
 *   - RE-LOAD the FULL authoritative evidence set SET-BASED (direct
 *     `organizations` match, EVERY `auth_organization_identities` mapping,
 *     re-verified mapped org, tenant existence) THROUGH THE TRANSACTION HANDLE
 *     and RE-CLASSIFY. Canonical ids/parents come from the matched
 *     `organizations` row, never the raw legacy string;
 *   - if the classifier result is not STRUCTURALLY identical to the one in the
 *     durable `intent` record (state / organizationId / parentTenantId /
 *     reason all compared) -> FAIL CLOSED (`evidence_changed`), leave the row
 *     unresolved — a canonical organization is never persisted from stale
 *     evidence;
 *   - re-derive the collision disposition on the locked snapshot, `FOR SHARE`-
 *     locking every collision WITNESS before relying on it: the existing
 *     canonical winner row, AND the whole bounded same-key sibling set (locked
 *     as a set, then classified from ONE set-based evidence bundle). A witness
 *     deleted / reclassified after the unlocked plan is treated as GONE.
 *     `FOR SHARE` blocks UPDATE/DELETE of a witness for the rest of the txn but
 *     never blocks a NEW-row INSERT;
 *   - MONOTONIC RULE: planned `canonical` -> fresh `quarantined` is applied
 *     (more restrictive; backed by the CURRENT locked witness). planned
 *     `quarantined` is only persisted if the CURRENT transactional disposition
 *     is ALSO a quarantine from a locked witness. planned `quarantined` ->
 *     fresh NOT-quarantined means the collision that justified the reviewed
 *     quarantine is gone at the transactional boundary: DO NOT canonicalize
 *     (fail closed) and DO NOT persist the stale quarantine (that would
 *     permanently hide the historical override after FF·D) — leave the row
 *     `unresolved_legacy` / `organization_id NULL` and report `collision_changed`;
 *   - mutate — still with the full optimistic expected-state predicate — and
 *     commit. `uq_feature_flags_key_organization_canonical` remains the final
 *     arbiter for a concurrent FF·B canonical INSERT (which targets a NEW row,
 *     not the FOR-UPDATE-locked one): the canonical UPDATE runs inside a
 *     SAVEPOINT, so a `23505` there rolls back ONLY the savepoint and the
 *     still-healthy outer transaction quarantines the historical row and
 *     commits (`canonical_collision_quarantined`).
 *
 * Every run has a `runId` (in the summary and on every streamed record). A
 * resumed run passes `--start-after=<id>` and writes to NEW artifact paths, so
 * each run's evidence stands alone; `startAfterId` + `runId` correlate them.
 * Rows an interrupted prior run already mutated left the `unresolved_legacy`
 * candidate set — a resumed run does not re-touch or lose them; the prior
 * artifact's `intent` records document what was attempted.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WRITE-AHEAD AUDIT PROTOCOL (apply)
 * ────────────────────────────────────────────────────────────────────────────
 * `runFeatureFlagOwnershipBackfill({ mode: 'apply' })` REJECTS before any DB
 * access if no `onDecision` audit sink is supplied — no mutation without a
 * prior record. The API requires the callback; the Production DURABILITY
 * guarantee is the CLI `--decisions` sink's, not an arbitrary callback's. Per
 * mutating row, apply emits: (1) an `intent` NDJSON record — the CLI sink
 * writes it IN FULL (throwing rather than accepting a stalled partial write)
 * AND `fsync`'s it to storage BEFORE any DB write; (2) the transactional
 * mutation above; (3) a `result` NDJSON record — written in full AND `fsync`'d.
 * Non-mutating rows and ALL dry-run rows emit only a `result`. An `intent` with
 * no matching `result` (same `featureFlagId`) is an incomplete operation,
 * detectable on restart / operator review by scanning the decisions artifact.
 *
 * ARTIFACT RESERVATION happens ENTIRELY BEFORE `createDb()` / any DB work: the
 * three paths are resolved to their PHYSICAL targets (`realpath` of the parent
 * dir + basename; a symlinked parent that aliases another target or escapes the
 * real repo is rejected, a missing parent is a fail-closed error), none may
 * already exist, and BOTH the `--decisions` WAL and `<report>.partial` are
 * exclusive-created (`wx`) with a containing-directory `fsync`. So a
 * report-directory problem fails the run before it can mutate. The final
 * `--report` path is NEVER pre-created. After the run the completed summary is
 * written IN FULL + `fsync`'d to the ALREADY-RESERVED `<report>.partial` fd
 * (never a reopened path), then `link(2)`'d (NOT `rename`, which would silently
 * clobber) to `--report` with a genuine no-clobber guarantee, plus a directory
 * `fsync` before and after the temp is unlinked. An interrupted run leaves the
 * `--decisions` WAL and `<report>.partial` as evidence but no final `--report`,
 * so a `--report` path always names a completed run.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * BOUNDED MEMORY
 * ────────────────────────────────────────────────────────────────────────────
 * The runner keeps only summary counters, per-reason counts, the current batch,
 * and a small capped diagnostic SAMPLE — memory does not grow with the
 * candidate count. Complete row-level evidence flows through the optional
 * `onDecision` sink (the CLI streams it to the `--decisions` NDJSON artifact,
 * flushed per decision, so an interrupted run still leaves a valid partial
 * artifact). The summary JSON is emitted only on successful completion.
 */

const DEFAULT_BATCH_SIZE = 500;
/** Cap on row-level entries retained IN the summary report (a labelled sample). */
const SAMPLE_LIMIT = 25;
const SOURCE_TABLE = 'feature_flags' as const;
/**
 * Feature Flags have independently proven (legacy FF runtime, plan §14a.2) that
 * a historical `tenant_id IS NULL` meant the explicit platform-global value.
 */
const FF_NULL_SEMANTICS: LegacyNullSemantics = 'proven_intentional_global';

export type BackfillRunMode = 'dry-run' | 'apply';

export type BackfillDecisionOutcome =
  | 'canonical_organization'
  | 'intentional_global'
  | 'unresolved_legacy'
  | 'quarantined'
  | 'concurrently_changed';

export type BackfillDecisionReason =
  | LegacyOwnershipReason
  | 'canonical_collision_quarantined' // an existing FF·B canonical row owns (key, org)
  | 'projected_collision_quarantined' // ≥2 historical candidates project to the same (key, org)
  | 'too_many_key_siblings_quarantined' // pathological: a single key has too many sibling rows to reconcile
  | 'evidence_changed' // authoritative evidence changed between review and the mutation boundary
  | 'collision_changed' // the collision that justified a planned quarantine was gone at the transactional boundary
  | 'concurrently_changed';

/**
 * Write-ahead phase. `intent` records are written durably BEFORE any DB
 * mutation; `result` records after. An `intent` with no matching `result` is a
 * mutation attempt whose outcome must be reconciled on operator review.
 */
export type BackfillRecordPhase = 'intent' | 'result';

/** Cap on how many same-`key` sibling rows the projected-collision scan reads. */
const SIBLING_LIMIT = 500;

/** The authoritative evidence set consulted for one row (safe fields only). */
export interface BackfillDecisionEvidence {
  readonly sourceTable: typeof SOURCE_TABLE;
  readonly nullSemantics: LegacyNullSemantics;
  readonly directInternalOrganization: {
    readonly matched: boolean;
    readonly organizationId?: string;
    readonly parentTenantId?: string;
  };
  readonly tenantId: { readonly matched: boolean };
  readonly providerMappings: Array<{
    readonly provider: string;
    readonly mappedOrganizationId: string;
    readonly verified: boolean;
    readonly organizationId?: string;
    readonly parentTenantId?: string;
  }>;
}

/** One row-level record. Safe diagnostic fields only. */
export interface BackfillDecision {
  readonly runId: string;
  /** `intent` (pre-mutation, durable) or `result` (post-mutation / final). */
  readonly phase: BackfillRecordPhase;
  readonly featureFlagId: string;
  readonly key: string;
  readonly legacyTenantId: string | null;
  /** On `intent`: the planned outcome. On `result`: the actual outcome. */
  readonly outcome: BackfillDecisionOutcome;
  readonly reason: BackfillDecisionReason;
  /** Resolved canonical organization (canonical_organization / quarantined). */
  readonly organizationId?: string;
  readonly parentTenantId?: string;
  readonly evidence: BackfillDecisionEvidence;
}

export interface FeatureFlagBackfillOptions {
  readonly mode: BackfillRunMode;
  readonly batchSize?: number;
  readonly startAfterId?: string | null;
  /** Correlation id for this run; defaults to a fresh UUID. */
  readonly runId?: string;
  /**
   * Complete row-level evidence sink — the runner keeps only bounded summary
   * state and streams everything here. In `apply` mode a row that will attempt
   * a mutation emits an `intent` record and then a `result` record;
   * non-mutating rows and all dry-run rows emit only a `result`. The sink is
   * AWAITED, so a throw from it (e.g. a disk failure) aborts the run
   * before/after the mutation as recorded.
   *
   * `apply` mode REQUIRES this callback (it fails closed without one), but the
   * runner does NOT — and cannot — guarantee that an arbitrary callback is
   * durable. The Production write-ahead durability guarantee (record written in
   * full + `fsync`, on a WAL file whose own directory entry was `fsync`'d) is
   * provided ONLY by the CLI `--decisions` sink
   * ({@link openNewWalFileWithinBase} + {@link appendRecordDurably}). A test or
   * in-memory callback satisfies the API contract but not the durability one.
   */
  readonly onDecision?: (decision: BackfillDecision) => Promise<void> | void;
  /**
   * Test-only seam: invoked AFTER the durable `intent` record and BEFORE the
   * per-row transaction opens, so a test can simulate a concurrent writer
   * changing the row OR the authoritative evidence (organizations / tenants /
   * auth_organization_identities) BEFORE the SHARE locks are taken.
   */
  readonly onBeforeRowUpdate?: (row: {
    readonly id: string;
    readonly key: string;
  }) => Promise<void> | void;
  /**
   * Test-only seam: invoked INSIDE the per-row transaction, after the SHARE
   * locks + `FOR UPDATE` + evidence revalidation and BEFORE the mutation, so a
   * test can prove a concurrent writer to the authoritative lookup tables is
   * blocked for the duration.
   */
  readonly onLockedBeforeMutation?: (row: {
    readonly id: string;
    readonly key: string;
  }) => Promise<void> | void;
  /**
   * Test-only seam: invoked INSIDE the per-row transaction AFTER the fresh
   * collision disposition has been re-derived and BEFORE the canonical UPDATE,
   * so a test can insert a competing FF·B canonical row for the same
   * `(key, organization_id)` from ANOTHER connection and thereby exercise the
   * ACTUAL `23505` savepoint-recovery path (not the pre-checked quarantine).
   */
  readonly onAfterFreshCollisionCheck?: (row: {
    readonly id: string;
    readonly key: string;
  }) => Promise<void> | void;
}

export interface FeatureFlagBackfillReport {
  readonly runId: string;
  readonly runMode: BackfillRunMode;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly batchSize: number;
  readonly startAfterId: string | null;
  readonly candidateCount: number;
  readonly classifiedCanonicalOrganizationCount: number;
  readonly classifiedIntentionalGlobalCount: number;
  readonly unresolvedCount: number;
  readonly quarantinedCount: number;
  readonly skippedConcurrentChangeCount: number;
  readonly reasonCounts: Record<string, number>;
  /** FF·D-readiness snapshot of `ownership_state` counts AFTER the run. */
  readonly ownershipStateCounts: Record<string, number>;
  /** Cap applied to the two `*Sample` arrays below. */
  readonly sampleLimit: number;
  /** A BOUNDED sample of unresolved / concurrently-changed decisions — NOT the full set. */
  readonly unresolvedRowsSample: BackfillDecision[];
  readonly unresolvedRowsTruncated: boolean;
  /** A BOUNDED sample of quarantine decisions — NOT the full set. */
  readonly quarantinedRowsSample: BackfillDecision[];
  readonly quarantinedRowsTruncated: boolean;
}

interface CandidateRow {
  id: string;
  key: string;
  tenantId: string | null;
}

/**
 * A `23505` from the canonical UPDATE in this code path can only be the
 * canonical partial unique: that UPDATE leaves `id`, `key` and `tenant_id`
 * untouched, so no other unique constraint on `feature_flags` can newly fire.
 * Still prefer an explicit constraint/index-name match, and never treat a
 * `23505` that names a DIFFERENT constraint as a canonical collision.
 */
function isCanonicalPartialUniqueViolation(error: unknown): boolean {
  const CANONICAL = 'uq_feature_flags_key_organization_canonical';
  const layers: unknown[] = [
    error,
    error && typeof error === 'object'
      ? (error as { cause?: unknown }).cause
      : undefined,
  ];
  for (const e of layers) {
    if (!e || typeof e !== 'object') continue;
    const o = e as {
      code?: unknown;
      constraint?: unknown;
      // postgres-js exposes the constraint as `constraint_name`, node-postgres
      // / PGlite as `constraint`.
      constraint_name?: unknown;
      message?: unknown;
    };
    const constraint =
      typeof o.constraint === 'string'
        ? o.constraint
        : typeof o.constraint_name === 'string'
          ? o.constraint_name
          : undefined;
    const message = typeof o.message === 'string' ? o.message : '';
    if (constraint === CANONICAL || message.includes(CANONICAL)) return true;
    if (constraint && constraint !== CANONICAL) return false;
    if (
      o.code === '23505' &&
      !constraint &&
      !message.includes('constraint "')
    ) {
      return true;
    }
  }
  return false;
}

export interface EvidenceDeps {
  readonly db: DrizzleDb;
}

/** Evidence for a legacy `tenant_id IS NULL` — no lookups required. */
const NULL_LEGACY_EVIDENCE: LegacyOwnershipEvidence = {
  legacyValue: null,
  nullSemantics: FF_NULL_SEMANTICS,
  directInternalOrganization: null,
  providerMappings: [],
  isKnownTenantId: false,
};

/**
 * SET-BASED authoritative evidence loader for a BOUNDED set of legacy
 * `tenant_id` values (a candidate + its same-key siblings). Query count is
 * O(1) per call — 4 bounded `IN (...)` reads at most — NOT O(number of values):
 *
 *   1. direct `organizations` rows for the UUID-shaped values;
 *   2. EVERY `auth_organization_identities` row for the values (all providers);
 *   3. re-verify the mapped internal organization ids against `organizations`;
 *   4. `tenants` rows for the UUID-shaped values with no direct org match.
 *
 * Canonical provenance: `directInternalOrganization` / `verified` carry
 * `organizations.id` and `organizations.tenant_id` AS READ FROM THE ROW — never
 * the raw legacy input. `organizations.id` / `tenants.id` are `uuid` columns,
 * so a match is case-insensitive and the returned id is the DB's canonical
 * spelling; values are indexed case-insensitively to bridge an upper-case
 * legacy spelling to its canonical row. UUID SHAPE IS REPRESENTATION ONLY — it
 * never makes a value canonical; only a matched `organizations` row does.
 * `auth_organization_identities.external_org_id` is `text` — matched verbatim.
 *
 * The SAME neutral `classifyLegacyOwnership()` contract then runs in memory per
 * value; no second/approximate classifier in SQL.
 */
export async function loadLegacyOwnershipEvidence(
  legacyValues: readonly string[],
  deps: EvidenceDeps,
): Promise<Map<string, LegacyOwnershipEvidence>> {
  const unique = [...new Set(legacyValues)];
  const out = new Map<string, LegacyOwnershipEvidence>();
  if (unique.length === 0) return out;

  const uuidShaped = unique.filter((v) => isCanonicalIdRepresentation(v));

  // 1. direct organizations matches — one bounded query.
  const directRows = uuidShaped.length
    ? await deps.db
        .select({
          id: organizationsReferenceTable.id,
          tenantId: organizationsReferenceTable.tenantId,
        })
        .from(organizationsReferenceTable)
        .where(inArray(organizationsReferenceTable.id, uuidShaped))
    : [];
  const orgByLowerId = new Map<string, ResolvedOrganization>();
  for (const r of directRows) {
    orgByLowerId.set(r.id.toLowerCase(), {
      organizationId: r.id,
      parentTenantId: r.tenantId,
    });
  }

  // 2. ALL provider identity rows for these external values — one bounded query.
  const identityRows = await deps.db
    .select({
      externalOrgId: authOrganizationIdentitiesReferenceTable.externalOrgId,
      provider: authOrganizationIdentitiesReferenceTable.provider,
      organizationId: authOrganizationIdentitiesReferenceTable.organizationId,
    })
    .from(authOrganizationIdentitiesReferenceTable)
    .where(
      inArray(authOrganizationIdentitiesReferenceTable.externalOrgId, unique),
    );

  // 3. re-verify the mapped internal organization ids — one bounded query.
  const mappedOrgIds = [...new Set(identityRows.map((r) => r.organizationId))];
  const mappedRows = mappedOrgIds.length
    ? await deps.db
        .select({
          id: organizationsReferenceTable.id,
          tenantId: organizationsReferenceTable.tenantId,
        })
        .from(organizationsReferenceTable)
        .where(inArray(organizationsReferenceTable.id, mappedOrgIds))
    : [];
  const verifiedByLowerId = new Map<string, ResolvedOrganization>();
  for (const r of mappedRows) {
    verifiedByLowerId.set(r.id.toLowerCase(), {
      organizationId: r.id,
      parentTenantId: r.tenantId,
    });
  }

  // 4. known tenants — one bounded query, only for values with no direct org.
  const needTenantCheck = uuidShaped.filter(
    (v) => !orgByLowerId.has(v.toLowerCase()),
  );
  const tenantRows = needTenantCheck.length
    ? await deps.db
        .select({ id: tenantsReferenceTable.id })
        .from(tenantsReferenceTable)
        .where(inArray(tenantsReferenceTable.id, needTenantCheck))
    : [];
  const knownTenantLowerIds = new Set(
    tenantRows.map((r) => r.id.toLowerCase()),
  );

  const identityByExternal = new Map<string, typeof identityRows>();
  for (const r of identityRows) {
    const list = identityByExternal.get(r.externalOrgId) ?? [];
    list.push(r);
    identityByExternal.set(r.externalOrgId, list);
  }

  for (const legacyValue of unique) {
    const direct = orgByLowerId.get(legacyValue.toLowerCase()) ?? null;
    const providerMappings: ProviderMappingEvidence[] = (
      identityByExternal.get(legacyValue) ?? []
    ).map((m) => ({
      provider: m.provider,
      mappedOrganizationId: m.organizationId,
      verified: verifiedByLowerId.get(m.organizationId.toLowerCase()) ?? null,
    }));
    const isKnownTenantId =
      direct === null && knownTenantLowerIds.has(legacyValue.toLowerCase());
    out.set(legacyValue, {
      legacyValue,
      nullSemantics: FF_NULL_SEMANTICS,
      directInternalOrganization: direct,
      providerMappings,
      isKnownTenantId,
    });
  }
  return out;
}

/** Evidence for ONE row — delegates to the set-based loader (still bounded). */
async function gatherEvidence(
  row: CandidateRow,
  deps: EvidenceDeps,
): Promise<LegacyOwnershipEvidence> {
  if (row.tenantId === null) return NULL_LEGACY_EVIDENCE;
  const bundle = await loadLegacyOwnershipEvidence([row.tenantId], deps);
  return (
    bundle.get(row.tenantId) ?? {
      legacyValue: row.tenantId,
      nullSemantics: FF_NULL_SEMANTICS,
      directInternalOrganization: null,
      providerMappings: [],
      isKnownTenantId: false,
    }
  );
}

function toDecisionEvidence(
  evidence: LegacyOwnershipEvidence,
): BackfillDecisionEvidence {
  return {
    sourceTable: SOURCE_TABLE,
    nullSemantics: evidence.nullSemantics,
    directInternalOrganization: evidence.directInternalOrganization
      ? {
          matched: true,
          organizationId: evidence.directInternalOrganization.organizationId,
          parentTenantId: evidence.directInternalOrganization.parentTenantId,
        }
      : { matched: false },
    tenantId: { matched: evidence.isKnownTenantId },
    providerMappings: evidence.providerMappings.map((m) => ({
      provider: m.provider,
      mappedOrganizationId: m.mappedOrganizationId,
      verified: m.verified !== null,
      ...(m.verified
        ? {
            organizationId: m.verified.organizationId,
            parentTenantId: m.verified.parentTenantId,
          }
        : {}),
    })),
  };
}

/**
 * Id of an existing `canonical_organization` row that owns `(key,
 * organizationId)` (excluding the candidate), or `null`. Returns the row
 * IDENTITY, not just a boolean, so the transactional path can `FOR SHARE`-lock
 * and re-verify the exact witness before relying on the collision.
 */
async function findExistingCanonicalCollisionId(
  db: DrizzleDb,
  key: string,
  organizationId: string,
  excludeId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: featureFlagsTable.id })
    .from(featureFlagsTable)
    .where(
      and(
        eq(featureFlagsTable.key, key),
        eq(featureFlagsTable.organizationId, organizationId),
        eq(featureFlagsTable.ownershipState, 'canonical_organization'),
        ne(featureFlagsTable.id, excludeId),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

interface LockedFeatureFlagRow {
  readonly id: string;
  readonly key: string;
  readonly tenantId: string | null;
  readonly organizationId: string | null;
  readonly ownershipState: string;
}

/**
 * `SELECT ... FOR SHARE` one `feature_flags` row by id. `FOR SHARE` blocks a
 * concurrent `UPDATE` / `DELETE` / reclassification of THAT row for the rest of
 * the transaction, but does NOT block insertion of a NEW row — so a fresh FF·B
 * canonical INSERT still races only against the partial unique (the SAVEPOINT +
 * 23505 path). Returns `null` if the row is gone.
 */
async function lockFeatureFlagRowForShare(
  db: DrizzleDb,
  id: string,
): Promise<LockedFeatureFlagRow | null> {
  const raw = await db.execute(
    sql`SELECT id, key, tenant_id, organization_id, ownership_state
        FROM feature_flags WHERE id = ${id} LIMIT 1 FOR SHARE`,
  );
  const rows = (
    Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])
  ) as Array<{
    id: string;
    key: string;
    tenant_id: string | null;
    organization_id: string | null;
    ownership_state: string;
  }>;
  const r = rows[0];
  return r
    ? {
        id: r.id,
        key: r.key,
        tenantId: r.tenant_id,
        organizationId: r.organization_id,
        ownershipState: r.ownership_state,
      }
    : null;
}

/**
 * Structured equality of two classifier results (evidence -> proposal). ALL
 * authoritative fields are compared — including `parentTenantId`, so a
 * concurrent `organizations.tenant_id` change is NOT treated as "unchanged".
 */
function sameClassification(
  a: LegacyOwnershipClassification,
  b: LegacyOwnershipClassification,
): boolean {
  return (
    a.proposedOwnershipState === b.proposedOwnershipState &&
    a.organizationId === b.organizationId &&
    a.parentTenantId === b.parentTenantId &&
    a.reason === b.reason
  );
}

/**
 * The bounded same-`key` sibling set (`unresolved_legacy` / `quarantined`
 * rows, excluding the candidate) — ONE query. When `lock` is set the rows are
 * taken `FOR SHARE`, so every projected-collision WITNESS is stable (no
 * concurrent `UPDATE` / `DELETE` / reclassification) for the rest of the
 * transaction. `FOR SHARE` on this bounded set never blocks a NEW-row INSERT.
 */
async function loadSameKeySiblings(
  deps: EvidenceDeps,
  row: CandidateRow,
  lock: boolean,
): Promise<CandidateRow[]> {
  const q = deps.db
    .select({
      id: featureFlagsTable.id,
      key: featureFlagsTable.key,
      tenantId: featureFlagsTable.tenantId,
    })
    .from(featureFlagsTable)
    .where(
      and(
        eq(featureFlagsTable.key, row.key),
        ne(featureFlagsTable.id, row.id),
        inArray(featureFlagsTable.ownershipState, [
          'unresolved_legacy',
          'quarantined',
        ]),
      ),
    )
    .orderBy(asc(featureFlagsTable.id))
    .limit(SIBLING_LIMIT);
  return lock ? q.for('share') : q;
}

type CollisionDisposition =
  | { readonly disposition: 'proceed' }
  | {
      readonly disposition: 'quarantine';
      readonly reason:
        | 'canonical_collision_quarantined'
        | 'projected_collision_quarantined'
        | 'too_many_key_siblings_quarantined';
    };

/**
 * Disposition for a candidate that classifies to `(key, organizationId,
 * canonical_organization)`, using the PROJECTED candidate set — not only rows
 * already persisted as canonical:
 *
 * 1. an existing `canonical_organization` row owns `(key, organizationId)`
 *    (always an FF·B dual-written row — historical rows never win) -> quarantine.
 * 2. any OTHER still-unresolved / already-quarantined sibling with the same
 *    `key` whose legacy value ALSO resolves to `organizationId` -> quarantine
 *    BOTH (each row runs this check independently and quarantines itself; no
 *    arbitrary winner picked by id/UUID order).
 * 3. a pathological key with too many siblings to reconcile safely -> quarantine.
 * 4. otherwise -> proceed.
 *
 * Memory / round trips: the sibling set is bounded by rows sharing ONE key
 * (`SIBLING_LIMIT`), and their authoritative evidence is loaded SET-BASED
 * ({@link loadLegacyOwnershipEvidence}, O(1) queries) then classified in
 * memory — NOT one `gatherEvidence` per sibling.
 *
 * `lockWitness` (true only on the transactional re-derivation): every collision
 * WITNESS is `FOR SHARE`-locked BEFORE it is relied on — the existing canonical
 * winner row, and the whole bounded sibling set (locked as a set by
 * {@link loadSameKeySiblings}). A witness deleted / reclassified after the
 * unlocked plan is seen as GONE. `FOR SHARE` never blocks a NEW-row INSERT, so
 * the SAVEPOINT + 23505 path stays the arbiter for a fresh FF·B canonical INSERT.
 *
 * ponytail: backfill rows are processed strictly sequentially in a single
 * process, so a backfill tx holding `FOR UPDATE` on its candidate + `FOR SHARE`
 * on the sibling set cannot deadlock against another backfill tx. A non-backfill
 * writer that would conflict (UPDATE/DELETE of a witness) only ever waits.
 */
async function resolveCanonicalCollisionDisposition(
  row: CandidateRow,
  organizationId: string,
  deps: EvidenceDeps,
  opts: { readonly lockWitness: boolean } = { lockWitness: false },
): Promise<CollisionDisposition> {
  const winnerId = await findExistingCanonicalCollisionId(
    deps.db,
    row.key,
    organizationId,
    row.id,
  );
  if (winnerId !== null) {
    if (!opts.lockWitness) {
      return {
        disposition: 'quarantine',
        reason: 'canonical_collision_quarantined',
      };
    }
    const locked = await lockFeatureFlagRowForShare(deps.db, winnerId);
    if (
      locked !== null &&
      locked.id !== row.id &&
      locked.key === row.key &&
      locked.organizationId === organizationId &&
      locked.ownershipState === 'canonical_organization'
    ) {
      return {
        disposition: 'quarantine',
        reason: 'canonical_collision_quarantined',
      };
    }
    // The canonical winner vanished / changed under lock — fall through to the
    // projected-sibling scan (a different witness may still establish a
    // collision).
  }

  // Bounded same-key sibling set — ONE query; FOR SHARE-locked as a set when
  // re-deriving transactionally, so the projected-collision witnesses are stable
  // until the candidate mutation commits.
  const siblings = await loadSameKeySiblings(deps, row, opts.lockWitness);
  if (siblings.length >= SIBLING_LIMIT) {
    return {
      disposition: 'quarantine',
      reason: 'too_many_key_siblings_quarantined',
    };
  }
  if (siblings.length === 0) return { disposition: 'proceed' };

  // SET-BASED authoritative evidence for every DISTINCT non-null sibling legacy
  // value (one bundle), then the SAME neutral classifier in memory.
  const evidenceByValue = await loadLegacyOwnershipEvidence(
    siblings.map((s) => s.tenantId).filter((v): v is string => v !== null),
    deps,
  );

  for (const sibling of siblings) {
    const evidence =
      sibling.tenantId === null
        ? NULL_LEGACY_EVIDENCE
        : evidenceByValue.get(sibling.tenantId);
    if (!evidence) continue;
    const c = classifyLegacyOwnership(evidence);
    if (
      c.proposedOwnershipState === 'canonical_organization' &&
      c.organizationId === organizationId
    ) {
      return {
        disposition: 'quarantine',
        reason: 'projected_collision_quarantined',
      };
    }
  }

  return { disposition: 'proceed' };
}

function expectedState(row: CandidateRow) {
  return and(
    eq(featureFlagsTable.id, row.id),
    eq(featureFlagsTable.key, row.key),
    eq(featureFlagsTable.ownershipState, 'unresolved_legacy'),
    isNull(featureFlagsTable.organizationId),
    row.tenantId === null
      ? isNull(featureFlagsTable.tenantId)
      : eq(featureFlagsTable.tenantId, row.tenantId),
  );
}

async function readOwnershipStateCounts(
  db: DrizzleDb,
): Promise<Record<string, number>> {
  const res = await db
    .select({
      ownershipState: featureFlagsTable.ownershipState,
      count: sql<number>`count(*)::int`,
    })
    .from(featureFlagsTable)
    .groupBy(featureFlagsTable.ownershipState);
  return Object.fromEntries(
    res.map((r) => [r.ownershipState, Number(r.count)]),
  );
}

/**
 * Run the FF·C backfill. `mode: 'dry-run'` reads and classifies but performs
 * zero writes; `mode: 'apply'` additionally applies the expected-state
 * mutations. ONE classifier + ONE collision decision, TWO execution modes.
 */
export async function runFeatureFlagOwnershipBackfill(
  db: DrizzleDb,
  options: FeatureFlagBackfillOptions,
): Promise<FeatureFlagBackfillReport> {
  const apply = options.mode === 'apply';
  // WAL invariant: no mutation without a durable prior intent record. `apply`
  // without an audit sink cannot satisfy that — fail closed BEFORE any DB
  // access. (The CLI additionally requires --decisions and --report.)
  if (apply && !options.onDecision) {
    throw new Error(
      '[flags:backfill] apply mode requires an onDecision audit sink — ' +
        'refusing to mutate without a durable write-ahead intent record.',
    );
  }

  const runId = options.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const startAfterId = options.startAfterId ?? null;

  const deps: EvidenceDeps = { db };

  let cursor: string | null = startAfterId;
  let candidateCount = 0;
  let classifiedCanonicalOrganizationCount = 0;
  let classifiedIntentionalGlobalCount = 0;
  let unresolvedCount = 0;
  let quarantinedCount = 0;
  let skippedConcurrentChangeCount = 0;
  const reasonCounts = new Map<string, number>();
  const unresolvedRowsSample: BackfillDecision[] = [];
  const quarantinedRowsSample: BackfillDecision[] = [];
  let unresolvedRowsTruncated = false;
  let quarantinedRowsTruncated = false;

  const emitRecord = async (
    d: Omit<BackfillDecision, 'runId'>,
  ): Promise<void> => {
    const decision: BackfillDecision = { runId, ...d };
    if (decision.phase === 'result') {
      reasonCounts.set(
        decision.reason,
        (reasonCounts.get(decision.reason) ?? 0) + 1,
      );
      switch (decision.outcome) {
        case 'canonical_organization':
          classifiedCanonicalOrganizationCount += 1;
          break;
        case 'intentional_global':
          classifiedIntentionalGlobalCount += 1;
          break;
        case 'unresolved_legacy':
          unresolvedCount += 1;
          if (unresolvedRowsSample.length < SAMPLE_LIMIT) {
            unresolvedRowsSample.push(decision);
          } else {
            unresolvedRowsTruncated = true;
          }
          break;
        case 'quarantined':
          quarantinedCount += 1;
          if (quarantinedRowsSample.length < SAMPLE_LIMIT) {
            quarantinedRowsSample.push(decision);
          } else {
            quarantinedRowsTruncated = true;
          }
          break;
        case 'concurrently_changed':
          skippedConcurrentChangeCount += 1;
          if (unresolvedRowsSample.length < SAMPLE_LIMIT) {
            unresolvedRowsSample.push(decision);
          } else {
            unresolvedRowsTruncated = true;
          }
          break;
      }
    }
    await options.onDecision?.(decision);
  };

  type PlannedOutcome = {
    outcome: BackfillDecisionOutcome;
    reason: BackfillDecisionReason;
    organizationId?: string;
    parentTenantId?: string;
  };

  /**
   * Decide the outcome for one candidate from its evidence + the projected
   * collision disposition. Pure of DB writes. `pdeps` is the handle the
   * disposition scan reads through (the outer connection when planning, the
   * per-row transaction when re-deriving at the mutation boundary). `lockWitness`
   * is set only on the transactional re-derivation, so the collision witness
   * row(s) are `FOR SHARE`-locked and re-verified before a quarantine is relied on.
   */
  async function planOutcome(
    row: CandidateRow,
    classification: LegacyOwnershipClassification,
    pdeps: EvidenceDeps,
    opts: { readonly lockWitness: boolean } = { lockWitness: false },
  ): Promise<PlannedOutcome> {
    if (!classification.mutates) {
      return { outcome: 'unresolved_legacy', reason: classification.reason };
    }
    if (classification.proposedOwnershipState === 'intentional_global') {
      return { outcome: 'intentional_global', reason: classification.reason };
    }
    const organizationId = classification.organizationId as string;
    const parentTenantId = classification.parentTenantId ?? undefined;
    const disp = await resolveCanonicalCollisionDisposition(
      row,
      organizationId,
      pdeps,
      opts,
    );
    return disp.disposition === 'quarantine'
      ? {
          outcome: 'quarantined',
          reason: disp.reason,
          organizationId,
          parentTenantId,
        }
      : {
          outcome: 'canonical_organization',
          reason: classification.reason,
          organizationId,
          parentTenantId,
        };
  }

  /**
   * Apply ONE candidate row inside a per-row transaction: SHARE-lock the
   * authoritative lookup tables (organizations / tenants /
   * auth_organization_identities), `FOR UPDATE`-lock the candidate row,
   * re-load its authoritative evidence SET-BASED through the transaction handle
   * and re-classify, then re-derive the collision disposition — `FOR SHARE`-
   * locking every witness first (the existing canonical winner row, and the
   * whole bounded same-key sibling set, classified from ONE set-based evidence
   * bundle) — enforce the monotonic rule, and mutate, all in one commit:
   *   - planned canonical  -> fresh quarantined  : quarantine (witness locked);
   *   - planned quarantined -> fresh !quarantined : `collision_changed` (no
   *     write; the row stays unresolved_legacy / org NULL — a stale collision
   *     never persists a quarantine);
   *   - planned canonical  -> fresh canonical     : canonical UPDATE, with the
   *     SAVEPOINT + 23505 path as the final arbiter for a concurrent FF·B
   *     canonical INSERT of a NEW row (which `FOR SHARE` does not block).
   */
  async function applyRowInTransaction(
    row: CandidateRow,
    classification1: LegacyOwnershipClassification,
    planned: PlannedOutcome,
  ): Promise<
    | { kind: 'done'; result: PlannedOutcome }
    | { kind: 'concurrent' }
    | { kind: 'evidence_changed' }
    | { kind: 'collision_changed' }
  > {
    return db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as DrizzleDb;
      const txDeps: EvidenceDeps = { db: tx };

      // Consistent lock order across all rows -> no deadlock between rows.
      await tx.execute(
        sql`LOCK TABLE organizations, tenants, auth_organization_identities IN SHARE MODE`,
      );

      // Stabilize the candidate row for the life of the transaction.
      const lockedRaw = await tx.execute(
        sql`SELECT id, key, tenant_id, ownership_state, organization_id
            FROM feature_flags WHERE id = ${row.id} LIMIT 1 FOR UPDATE`,
      );
      const lockedRows = (
        Array.isArray(lockedRaw)
          ? lockedRaw
          : ((lockedRaw as { rows?: unknown[] }).rows ?? [])
      ) as Array<{
        key: string;
        tenant_id: string | null;
        ownership_state: string;
        organization_id: string | null;
      }>;
      const lr = lockedRows[0];
      if (
        !lr ||
        lr.ownership_state !== 'unresolved_legacy' ||
        lr.organization_id !== null ||
        lr.key !== row.key ||
        lr.tenant_id !== row.tenantId
      ) {
        return { kind: 'concurrent' as const };
      }

      // Re-gather + re-classify the FULL authoritative evidence set under lock.
      const classification2 = classifyLegacyOwnership(
        await gatherEvidence(row, txDeps),
      );
      if (!sameClassification(classification2, classification1)) {
        return { kind: 'evidence_changed' as const };
      }

      await options.onLockedBeforeMutation?.({ id: row.id, key: row.key });

      // Re-derive disposition on the LOCKED snapshot. When this yields a
      // quarantine, `planOutcome` has already `FOR SHARE`-locked and re-verified
      // the exact feature_flags row(s) that prove the collision, so a witness
      // that disappeared after planning is seen as gone.
      const fresh =
        classification2.proposedOwnershipState === 'canonical_organization'
          ? await planOutcome(row, classification2, txDeps, {
              lockWitness: true,
            })
          : planned;

      await options.onAfterFreshCollisionCheck?.({ id: row.id, key: row.key });

      // MONOTONIC SAFETY — every mutating outcome is backed by the CURRENT
      // transactional (locked-witness) disposition, never by a stale intent:
      //  - planned canonical  -> fresh quarantined  : apply the quarantine
      //    (more restrictive; its witness is FOR SHARE-locked + confirmed).
      //  - planned quarantined -> fresh quarantined : apply, but ONLY because
      //    `fresh` is itself a locked-witness quarantine (not just because the
      //    pre-transaction intent said quarantine).
      //  - planned quarantined -> fresh !quarantined : the collision that
      //    justified the reviewed quarantine is GONE at the transactional
      //    boundary. Do NOT canonicalize (fail closed) and do NOT persist the
      //    stale quarantine — that would permanently hide this historical
      //    override after FF·D. Leave the row unresolved_legacy / org NULL and
      //    report `collision_changed`.
      if (
        planned.outcome === 'quarantined' &&
        fresh.outcome !== 'quarantined'
      ) {
        return { kind: 'collision_changed' as const };
      }
      const final: PlannedOutcome = fresh;

      // Non-canonical mutations can NEVER trip the canonical partial unique
      // (they leave `organization_id` NULL / `ownership_state` != canonical),
      // so they run directly on the outer transaction.
      if (final.outcome === 'intentional_global') {
        const updated = await tx
          .update(featureFlagsTable)
          .set({ ownershipState: 'intentional_global' })
          .where(expectedState(row))
          .returning();
        return updated.length === 0
          ? { kind: 'concurrent' as const }
          : { kind: 'done' as const, result: final };
      }
      if (final.outcome === 'quarantined') {
        const updated = await tx
          .update(featureFlagsTable)
          .set({ ownershipState: 'quarantined' })
          .where(expectedState(row))
          .returning();
        return updated.length === 0
          ? { kind: 'concurrent' as const }
          : { kind: 'done' as const, result: final };
      }

      // canonical_organization — the ONLY branch that can lose the race to a
      // concurrent FF·B canonical INSERT on `uq_feature_flags_key_organization_
      // canonical`. Run it inside a SAVEPOINT (nested transaction): a `23505`
      // there rolls back ONLY the savepoint (`ROLLBACK TO SAVEPOINT`), leaving
      // the OUTER transaction — and its SHARE locks + `FOR UPDATE` — healthy
      // and usable. The DB partial unique stays the final arbiter; on a loss we
      // quarantine the historical row on the still-open outer transaction.
      try {
        const updated = await tx.transaction(async (spRaw) => {
          const sp = spRaw as unknown as DrizzleDb;
          return sp
            .update(featureFlagsTable)
            .set({
              organizationId: final.organizationId as string,
              ownershipState: 'canonical_organization',
            })
            .where(expectedState(row))
            .returning();
        });
        return updated.length === 0
          ? { kind: 'concurrent' as const }
          : { kind: 'done' as const, result: final };
      } catch (error) {
        if (!isCanonicalPartialUniqueViolation(error)) throw error;
        // Savepoint rolled back; the outer transaction is still healthy.
        const q = await tx
          .update(featureFlagsTable)
          .set({ ownershipState: 'quarantined' })
          .where(expectedState(row))
          .returning();
        return q.length === 0
          ? { kind: 'concurrent' as const }
          : {
              kind: 'done' as const,
              result: {
                outcome: 'quarantined',
                reason: 'canonical_collision_quarantined',
                organizationId: final.organizationId,
                parentTenantId: final.parentTenantId,
              },
            };
      }
    });
  }

  async function processRow(row: CandidateRow): Promise<void> {
    const evidence1 = await gatherEvidence(row, deps);
    const classification1 = classifyLegacyOwnership(evidence1);
    const base = {
      featureFlagId: row.id,
      key: row.key,
      legacyTenantId: row.tenantId,
      evidence: toDecisionEvidence(evidence1),
    };
    const withOrg = (
      d: Omit<BackfillDecision, 'runId' | 'phase'>,
      org?: string,
      parent?: string,
    ): Omit<BackfillDecision, 'runId' | 'phase'> => ({
      ...d,
      ...(org ? { organizationId: org } : {}),
      ...(parent ? { parentTenantId: parent } : {}),
    });

    const planned = await planOutcome(row, classification1, deps);

    // DRY RUN — result record only, zero writes.
    if (!apply) {
      await emitRecord({
        ...withOrg(
          { ...base, outcome: planned.outcome, reason: planned.reason },
          planned.organizationId,
          planned.parentTenantId,
        ),
        phase: 'result',
      });
      return;
    }

    // APPLY — a non-mutating classification writes nothing.
    if (planned.outcome === 'unresolved_legacy') {
      await emitRecord({
        ...base,
        phase: 'result',
        outcome: 'unresolved_legacy',
        reason: planned.reason,
      });
      return;
    }

    // ── WRITE-AHEAD: durable INTENT before any DB mutation ──
    await emitRecord({
      ...withOrg(
        { ...base, outcome: planned.outcome, reason: planned.reason },
        planned.organizationId,
        planned.parentTenantId,
      ),
      phase: 'intent',
    });

    await options.onBeforeRowUpdate?.({ id: row.id, key: row.key });

    // ── ONE consistency boundary: lock, revalidate, re-derive, mutate ──
    const outcome = await applyRowInTransaction(row, classification1, planned);

    if (outcome.kind === 'evidence_changed') {
      await emitRecord({
        ...base,
        phase: 'result',
        outcome: 'concurrently_changed',
        reason: 'evidence_changed',
      });
      return;
    }
    if (outcome.kind === 'collision_changed') {
      // A planned quarantine whose collision witness was gone at the
      // transactional boundary: the row stays unresolved_legacy / org NULL —
      // NOT canonicalized (fail closed) and NOT quarantined (a stale quarantine
      // would permanently hide this historical override after FF·D).
      await emitRecord({
        ...base,
        phase: 'result',
        outcome: 'concurrently_changed',
        reason: 'collision_changed',
      });
      return;
    }
    if (outcome.kind === 'concurrent') {
      await emitRecord({
        ...base,
        phase: 'result',
        outcome: 'concurrently_changed',
        reason: 'concurrently_changed',
      });
      return;
    }
    await emitRecord({
      ...withOrg(
        {
          ...base,
          outcome: outcome.result.outcome,
          reason: outcome.result.reason,
        },
        outcome.result.organizationId,
        outcome.result.parentTenantId,
      ),
      phase: 'result',
    });
  }

  for (;;) {
    const batch: CandidateRow[] = await db
      .select({
        id: featureFlagsTable.id,
        key: featureFlagsTable.key,
        tenantId: featureFlagsTable.tenantId,
      })
      .from(featureFlagsTable)
      .where(
        and(
          eq(featureFlagsTable.ownershipState, 'unresolved_legacy'),
          isNull(featureFlagsTable.organizationId),
          cursor === null ? undefined : gt(featureFlagsTable.id, cursor),
        ),
      )
      .orderBy(asc(featureFlagsTable.id))
      .limit(batchSize);

    if (batch.length === 0) break;

    for (const row of batch) {
      cursor = row.id;
      candidateCount += 1;
      await processRow(row);
    }
  }

  return {
    runId,
    runMode: options.mode,
    startedAt,
    completedAt: new Date().toISOString(),
    batchSize,
    startAfterId,
    candidateCount,
    classifiedCanonicalOrganizationCount,
    classifiedIntentionalGlobalCount,
    unresolvedCount,
    quarantinedCount,
    skippedConcurrentChangeCount,
    reasonCounts: Object.fromEntries(reasonCounts),
    ownershipStateCounts: await readOwnershipStateCounts(db),
    sampleLimit: SAMPLE_LIMIT,
    unresolvedRowsSample,
    unresolvedRowsTruncated,
    quarantinedRowsSample,
    quarantinedRowsTruncated,
  };
}

// ────────────────────────────── CLI ──────────────────────────────

export interface BackfillCliInvocation {
  readonly mode: BackfillRunMode;
  readonly applyWithoutConfirm: boolean;
  readonly batchSize: number;
  readonly startAfterId: string | null;
  readonly decisionsPath: string | null;
  readonly reportPath: string | null;
}

export type BackfillCliParse =
  | { readonly ok: true; readonly invocation: BackfillCliInvocation }
  | { readonly ok: false; readonly error: string };

/**
 * Pure arg parsing + the operator gate. `apply` mode (`--apply --confirm`) is
 * Production-data-mutation-capable and REQUIRES durable evidence artifact paths.
 */
export function parseBackfillCliArgs(
  argv: readonly string[],
): BackfillCliParse {
  const has = (flag: string) => argv.includes(flag);
  const arg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const applyRequested = has('--apply');
  const confirmed = has('--confirm');
  const mode: BackfillRunMode =
    applyRequested && confirmed ? 'apply' : 'dry-run';

  const batchSizeArg = arg('batch-size');
  const batchSize = batchSizeArg
    ? Math.max(1, Number.parseInt(batchSizeArg, 10) || DEFAULT_BATCH_SIZE)
    : DEFAULT_BATCH_SIZE;
  const decisionsPath = arg('decisions') ?? null;
  const reportPath = arg('report') ?? null;

  if (mode === 'apply' && (!decisionsPath || !reportPath)) {
    return {
      ok: false,
      error:
        '`--apply --confirm` requires BOTH --decisions=<new path> and ' +
        '--report=<new path> for durable operator evidence. Aborting before any DB access.',
    };
  }

  return {
    ok: true,
    invocation: {
      mode,
      applyWithoutConfirm: applyRequested && !confirmed,
      batchSize,
      startAfterId: arg('start-after') ?? null,
      decisionsPath,
      reportPath,
    },
  };
}

/**
 * Returns an error string if `path` already exists (a prior run's audit
 * evidence must never be truncated), else `null`. READ-ONLY — never writes.
 */
export function checkArtifactPathIsNew(
  artifactPath: string,
  label: string,
  baseDir: string = process.cwd(),
): string | null {
  return pathExistsWithinBase(artifactPath, baseDir, label)
    ? `${label} path already exists: ${artifactPath}. Refusing to overwrite prior audit evidence — choose a new path.`
    : null;
}

export interface ResolvedArtifactPaths {
  /** The operator-supplied (possibly relative) paths, unchanged — for messages. */
  readonly decisionsPath: string | null;
  readonly reportPath: string | null;
  readonly tmpReportPath: string | null;
  /** `realpath` of the repo base — the physical `baseDir` for every artifact open. */
  readonly realBase: string;
  /**
   * PHYSICAL (symlink-followed) target paths: `realpath(parent) + basename`,
   * each proven to be physically inside {@link realBase} and PAIRWISE DISTINCT.
   * These — never the raw operator strings — are used for the opens + publish.
   */
  readonly physicalDecisions: string | null;
  readonly physicalReport: string | null;
  readonly physicalTmpReport: string | null;
}

export type ArtifactPathResolution =
  | { readonly ok: true; readonly paths: ResolvedArtifactPaths }
  | { readonly ok: false; readonly error: string };

/**
 * Preflight: resolve every non-null artifact path (`--decisions`, `--report`,
 * and the report's `<report>.partial` temp sibling) to its PHYSICAL target
 * (`realpath` of the existing parent directory + basename) and verify:
 *   - each physical parent is physically inside `realpath(baseDir)` — a
 *     symlinked parent that escapes the real repo is rejected;
 *   - the three physical targets are PAIRWISE DISTINCT — two arguments that
 *     alias the same inode (a lexical `out/../report.json` vs `report.json`, OR
 *     one path through a symlinked directory and another through the real one)
 *     are rejected.
 *
 * A missing parent directory is a fail-closed error (`open()` cannot create it).
 * Reads the filesystem (`realpath`) but never writes; existence of the target
 * files themselves is a separate later check. Enforced BEFORE any WAL is
 * created and BEFORE `createDb()`.
 */
export function resolveArtifactPaths(
  decisionsPath: string | null,
  reportPath: string | null,
  baseDir: string,
): ArtifactPathResolution {
  const tmpReportPath = reportPath === null ? null : `${reportPath}.partial`;

  let realBase: string;
  const entries: Array<{ label: string; raw: string; physical: string }> = [];
  try {
    realBase = physicalBaseDir(baseDir);
    for (const [label, raw] of [
      ['--decisions', decisionsPath],
      ['--report', reportPath],
      ['--report (temp)', tmpReportPath],
    ] as Array<[string, string | null]>) {
      if (raw === null) continue;
      entries.push({
        label,
        raw,
        physical: resolvePhysicalTargetWithinBase(
          raw,
          baseDir,
          `flags:backfill ${label}`,
        ),
      });
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  for (const [i, a] of entries.entries()) {
    for (const b of entries.slice(i + 1)) {
      if (a.physical === b.physical) {
        return {
          ok: false,
          error:
            `${a.label} (${a.raw}) and ${b.label} (${b.raw}) resolve to the ` +
            `same physical path: ${a.physical}. Provide distinct artifact ` +
            'paths. Aborting before any WAL / DB access.',
        };
      }
    }
  }

  const physicalOf = (label: string) =>
    entries.find((e) => e.label === label)?.physical ?? null;
  return {
    ok: true,
    paths: {
      decisionsPath,
      reportPath,
      tmpReportPath,
      realBase,
      physicalDecisions:
        decisionsPath === null ? null : physicalOf('--decisions'),
      physicalReport: reportPath === null ? null : physicalOf('--report'),
      physicalTmpReport:
        tmpReportPath === null ? null : physicalOf('--report (temp)'),
    },
  };
}

export interface ReservedBackfillArtifacts {
  readonly realBase: string;
  readonly decisionsPath: string | null;
  readonly reportPath: string | null;
  readonly physicalReport: string | null;
  readonly physicalTmpReport: string | null;
  /** Open fd for the decisions WAL, or `null` when `--decisions` was omitted. */
  readonly decisionsFd: number | null;
  /**
   * Open fd for the EXCLUSIVELY-CREATED `<report>.partial`, reserved BEFORE any
   * DB work so a report-directory problem fails the run before it can mutate.
   * The completed report is written to THIS fd (never a reopened path).
   */
  readonly reportTmpFd: number | null;
}

/**
 * Full artifact preflight + RESERVATION, all BEFORE the caller opens a DB
 * connection:
 *   1. physical alias / confinement resolution ({@link resolveArtifactPaths});
 *   2. none of the three targets may already exist;
 *   3. exclusive-create the decisions WAL and `<report>.partial`, each with a
 *      containing-directory `fsync`.
 *
 * The final `--report` path is NEVER pre-created — its later appearance is the
 * signal of a completed publication. On ANY failure every fd already opened here
 * is closed and an `Error` is thrown (the CLI turns that into a non-zero exit
 * with no DB access).
 */
export function reserveBackfillArtifacts(
  decisionsPath: string | null,
  reportPath: string | null,
  baseDir: string,
): ReservedBackfillArtifacts {
  const resolution = resolveArtifactPaths(decisionsPath, reportPath, baseDir);
  if (!resolution.ok) throw new Error(resolution.error);
  const { realBase, physicalDecisions, physicalReport, physicalTmpReport } =
    resolution.paths;

  for (const [p, label] of [
    [physicalDecisions, 'flags:backfill --decisions'],
    [physicalReport, 'flags:backfill --report'],
    [physicalTmpReport, 'flags:backfill --report (temp)'],
  ] as Array<[string | null, string]>) {
    if (p === null) continue;
    const err = checkArtifactPathIsNew(p, label, realBase);
    if (err) throw new Error(err);
  }

  let decisionsFd: number | null = null;
  let reportTmpFd: number | null = null;
  try {
    decisionsFd =
      physicalDecisions === null
        ? null
        : openNewWalFileWithinBase(
            physicalDecisions,
            realBase,
            'flags:backfill --decisions',
          );
    reportTmpFd =
      physicalTmpReport === null
        ? null
        : openNewWalFileWithinBase(
            physicalTmpReport,
            realBase,
            'flags:backfill --report (temp)',
          );
  } catch (error) {
    if (decisionsFd !== null) closeSync(decisionsFd);
    if (reportTmpFd !== null) closeSync(reportTmpFd);
    throw error;
  }

  return {
    realBase,
    decisionsPath,
    reportPath,
    physicalReport,
    physicalTmpReport,
    decisionsFd,
    reportTmpFd,
  };
}

/**
 * Write the completed `reportJson` IN FULL to the ALREADY-RESERVED
 * `<report>.partial` fd (no reopen, no truncate of an arbitrary path), `fsync`
 * it, then `link(2)`-publish it to the final `--report` path (no-clobber) with
 * the directory `fsync` / temp-unlink from the existing durability protocol. The
 * caller still owns closing `reportTmpFd` (in its `finally`). A run that never
 * reaches here leaves only `<report>.partial` — the final path means "complete".
 */
export function finalizeBackfillReport(
  reserved: Pick<
    ReservedBackfillArtifacts,
    'realBase' | 'physicalReport' | 'physicalTmpReport' | 'reportTmpFd'
  >,
  reportJson: string,
): void {
  const { realBase, physicalReport, physicalTmpReport, reportTmpFd } = reserved;
  if (
    reportTmpFd === null ||
    physicalReport === null ||
    physicalTmpReport === null
  ) {
    return;
  }
  appendRecordDurably(
    reportTmpFd,
    reportJson.endsWith('\n') ? reportJson : `${reportJson}\n`,
  );
  publishFileAtomicallyWithinBase(
    physicalTmpReport,
    physicalReport,
    realBase,
    'flags:backfill --report',
  );
}

async function run(): Promise<void> {
  const parsed = parseBackfillCliArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`[flags:backfill] ${parsed.error}`);
    process.exit(1);
  }
  const {
    mode,
    applyWithoutConfirm,
    batchSize,
    startAfterId,
    decisionsPath,
    reportPath,
  } = parsed.invocation;

  if (applyWithoutConfirm) {
    console.error(
      '[flags:backfill] --apply seen without --confirm. Running as a DRY RUN. ' +
        'Re-run with `--apply --confirm --decisions=<new> --report=<new>` to mutate.',
    );
  }

  const provider = resolveProvider();
  const driver = resolveDriver();
  const url = process.env.DATABASE_URL?.trim();
  if (driver === 'postgres' && !url) {
    console.error(
      '[flags:backfill] DATABASE_URL is required for the postgres driver',
    );
    process.exit(1);
  }

  // ARTIFACT PREFLIGHT + RESERVATION — all BEFORE createDb() / any DB work:
  //  - physical alias / confinement resolution (symlinked parents included);
  //  - none of --decisions / --report / <report>.partial may already exist;
  //  - exclusive-create the decisions WAL and <report>.partial (each with a
  //    directory fsync). The final --report path is NEVER pre-created — a
  //    report-directory problem now fails the run BEFORE it can mutate, and the
  //    completed report is later written to the RESERVED <report>.partial fd
  //    (no reopen of an arbitrary path).
  let reserved: ReservedBackfillArtifacts;
  try {
    reserved = reserveBackfillArtifacts(
      decisionsPath,
      reportPath,
      process.cwd(),
    );
  } catch (error) {
    console.error(`[flags:backfill] ${(error as Error).message}`);
    process.exit(1);
  }
  const { decisionsFd, reportTmpFd } = reserved;

  const runId = randomUUID();
  // Every record is written IN FULL (looping over short writes) AND fsync'd to
  // storage before control returns to the runner: an `intent` line is durable
  // before the DB mutation, a `result` line before the run proceeds.
  const onDecision =
    decisionsFd === null
      ? undefined
      : (decision: BackfillDecision) => {
          appendRecordDurably(decisionsFd, `${JSON.stringify(decision)}\n`);
        };

  // From here the reserved fds MUST be closed on every exit path — even if
  // createDb() itself throws — so everything is inside the try/finally.
  let dbRuntime: ReturnType<typeof createDb> | undefined;
  try {
    dbRuntime = createDb({ provider, driver, url });

    console.error(
      `[flags:backfill] runId=${runId} mode=${mode} driver=${driver} ` +
        `batchSize=${batchSize}` +
        (startAfterId ? ` startAfter=${startAfterId}` : '') +
        ` AUTH_PROVIDER=${process.env.AUTH_PROVIDER ?? '(unset)'} (non-authoritative diagnostic)`,
    );

    const report = await runFeatureFlagOwnershipBackfill(dbRuntime.db, {
      mode,
      batchSize,
      startAfterId,
      runId,
      onDecision,
    });

    // Publish the summary only now that every candidate has a durable `result`:
    // write it IN FULL + fsync to the ALREADY-RESERVED <report>.partial fd
    // (never a reopened path), then link(2) it to the requested path
    // (no-clobber; NOT rename) + fsync the directory. An interrupted run never
    // reaches here, so a final report path always names a completed run.
    const json = JSON.stringify(report, null, 2);
    process.stdout.write(`${json}\n`);
    finalizeBackfillReport(reserved, `${json}\n`);

    console.error(
      `[flags:backfill] ${mode === 'apply' ? 'APPLIED' : 'DRY RUN'} — ` +
        `candidates=${report.candidateCount} ` +
        `canonical=${report.classifiedCanonicalOrganizationCount} ` +
        `global=${report.classifiedIntentionalGlobalCount} ` +
        `unresolved=${report.unresolvedCount} ` +
        `quarantined=${report.quarantinedCount} ` +
        `skippedConcurrent=${report.skippedConcurrentChangeCount}`,
    );
    if (decisionsPath) {
      console.error(
        `[flags:backfill] Decisions streamed to ${decisionsPath} (NDJSON)`,
      );
    }
    if (reportPath) {
      console.error(`[flags:backfill] Summary written to ${reportPath}`);
    }
    console.error(
      `[flags:backfill] FF·D readiness snapshot (ownership_state counts): ` +
        JSON.stringify(report.ownershipStateCounts) +
        ' — FF·D is NOT implemented by this slice.',
    );
  } finally {
    // Close both reserved fds on EVERY path. On success the report fd's inode
    // is already fsync'd + published (link(2)); on an interrupted/failed run the
    // decisions WAL and <report>.partial remain on disk as incomplete-run
    // evidence and the final --report path is absent.
    if (decisionsFd !== null) closeSync(decisionsFd);
    if (reportTmpFd !== null) closeSync(reportTmpFd);
    await dbRuntime?.close?.();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('/backfill-canonical-ownership.ts') ||
    process.argv[1].endsWith('/backfill-canonical-ownership.js') ||
    process.argv[1].endsWith('/backfill-canonical-ownership'));

if (isMain) {
  run().catch((err: unknown) => {
    console.error('[flags:backfill] Fatal error:', err);
    process.exit(1);
  });
}
