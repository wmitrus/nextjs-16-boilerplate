import '../load-env';

import { randomUUID } from 'node:crypto';
import { closeSync, writeSync } from 'node:fs';

import { and, asc, eq, gt, isNull, ne, sql } from 'drizzle-orm';

import { isCanonicalIdRepresentation } from '@/core/contracts/canonical-ids.provenance';
import {
  classifyLegacyOwnership,
  type LegacyNullSemantics,
  type LegacyOwnershipEvidence,
  type LegacyOwnershipReason,
  type ProviderMappingEvidence,
  type ResolvedOrganization,
} from '@/core/contracts/legacy-ownership-classification';
import { createDb } from '@/core/db/create-db';
import { authOrganizationIdentitiesReferenceTable } from '@/core/db/schema/references';
import type { DrizzleDb } from '@/core/db/types';

import {
  openSyncWithinBase,
  pathExistsWithinBase,
} from '../lib/fs-guards-shared';

import { resolveDriver, resolveProvider } from './utils';

import { DrizzleOrganizationScopeAuthority } from '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority';
import { DrizzleTenantExistenceReader } from '@/modules/authorization/infrastructure/drizzle/DrizzleTenantExistenceReader';
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
 * is a fail-closed error (a prior dry-run's audit evidence is never truncated).
 * Missing evidence paths, or an existing target, exit BEFORE any DB work.
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
 * CONCURRENCY / RESUMABILITY
 * ────────────────────────────────────────────────────────────────────────────
 * Keyset pagination by `id` (never OFFSET). A NON-mutating canonical-collision
 * probe runs in BOTH modes so dry-run and apply agree on the quarantine
 * decision for an already-present collision. The database partial unique
 * `uq_feature_flags_key_organization_canonical` remains the FINAL arbiter for a
 * race after the probe.
 *
 * Every mutation carries the full optimistic expected-state predicate — `id`,
 * `key`, `ownership_state = 'unresolved_legacy'`, `organization_id IS NULL`, AND
 * `tenant_id` still EXACTLY the classified value. A zero-row result is reported
 * `concurrently_changed` and NEVER force-written — a stale classification can
 * never be persisted.
 *
 * Every run has a `runId` (in the summary and on every streamed decision). A
 * resumed run passes `--start-after=<id>` and writes to NEW artifact paths, so
 * each run's evidence stands alone; `startAfterId` + `runId` correlate them.
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
  | 'canonical_collision_quarantined'
  | 'concurrently_changed';

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

/** One row-level classification/mutation decision. Safe diagnostic fields only. */
export interface BackfillDecision {
  readonly runId: string;
  readonly featureFlagId: string;
  readonly key: string;
  readonly legacyTenantId: string | null;
  readonly outcome: BackfillDecisionOutcome;
  readonly reason: BackfillDecisionReason;
  /** Final resolved canonical organization (canonical_organization / quarantined). */
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
   * Complete row-level evidence sink — invoked once per candidate row with its
   * final decision. The runner itself retains only bounded summary state.
   */
  readonly onDecision?: (decision: BackfillDecision) => Promise<void> | void;
  /**
   * Test-only seam: invoked immediately before a mutating row's expected-state
   * UPDATE, so a test can simulate a concurrent writer changing the row
   * underneath the classifier.
   */
  readonly onBeforeRowUpdate?: (row: {
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
    const o = e as { code?: unknown; constraint?: unknown; message?: unknown };
    const constraint =
      typeof o.constraint === 'string' ? o.constraint : undefined;
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

async function readOrganization(
  authority: DrizzleOrganizationScopeAuthority,
  organizationId: string,
): Promise<ResolvedOrganization | null> {
  if (!isCanonicalIdRepresentation(organizationId)) return null;
  const parentTenantId = await authority.readParentTenantId(organizationId);
  return parentTenantId === null ? null : { organizationId, parentTenantId };
}

interface EvidenceDeps {
  readonly db: DrizzleDb;
  readonly authority: DrizzleOrganizationScopeAuthority;
  readonly tenants: DrizzleTenantExistenceReader;
}

async function gatherEvidence(
  row: CandidateRow,
  deps: EvidenceDeps,
): Promise<LegacyOwnershipEvidence> {
  const legacyValue = row.tenantId;
  if (legacyValue === null) {
    return {
      legacyValue: null,
      nullSemantics: FF_NULL_SEMANTICS,
      directInternalOrganization: null,
      providerMappings: [],
      isKnownTenantId: false,
    };
  }

  const directInternalOrganization = await readOrganization(
    deps.authority,
    legacyValue,
  );

  // EVERY auth_organization_identities row for this external value — all providers.
  const mappingRows = await deps.db
    .select({
      provider: authOrganizationIdentitiesReferenceTable.provider,
      organizationId: authOrganizationIdentitiesReferenceTable.organizationId,
    })
    .from(authOrganizationIdentitiesReferenceTable)
    .where(
      eq(authOrganizationIdentitiesReferenceTable.externalOrgId, legacyValue),
    );

  const providerMappings: ProviderMappingEvidence[] = await Promise.all(
    mappingRows.map(async (m) => ({
      provider: m.provider,
      mappedOrganizationId: m.organizationId,
      verified: await readOrganization(deps.authority, m.organizationId),
    })),
  );

  const isKnownTenantId =
    directInternalOrganization === null &&
    (await deps.tenants.exists(legacyValue));

  return {
    legacyValue,
    nullSemantics: FF_NULL_SEMANTICS,
    directInternalOrganization,
    providerMappings,
    isKnownTenantId,
  };
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

async function hasExistingCanonicalCollision(
  db: DrizzleDb,
  key: string,
  organizationId: string,
  excludeId: string,
): Promise<boolean> {
  const rows = await db
    .select({ one: sql`1` })
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
  return rows.length > 0;
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
  const runId = options.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const startAfterId = options.startAfterId ?? null;
  const apply = options.mode === 'apply';

  const deps: EvidenceDeps = {
    db,
    authority: new DrizzleOrganizationScopeAuthority(db),
    tenants: new DrizzleTenantExistenceReader(db),
  };

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

  const emit = async (d: Omit<BackfillDecision, 'runId'>): Promise<void> => {
    const decision: BackfillDecision = { runId, ...d };
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
    await options.onDecision?.(decision);
  };

  async function processRow(row: CandidateRow): Promise<void> {
    const evidence = await gatherEvidence(row, deps);
    const classification = classifyLegacyOwnership(evidence);
    const decisionEvidence = toDecisionEvidence(evidence);
    const base = {
      featureFlagId: row.id,
      key: row.key,
      legacyTenantId: row.tenantId,
      evidence: decisionEvidence,
    };
    const concurrent = {
      ...base,
      outcome: 'concurrently_changed' as const,
      reason: 'concurrently_changed' as const,
    };

    if (!classification.mutates) {
      await emit({
        ...base,
        outcome: 'unresolved_legacy',
        reason: classification.reason,
      });
      return;
    }

    if (classification.proposedOwnershipState === 'intentional_global') {
      if (!apply) {
        await emit({
          ...base,
          outcome: 'intentional_global',
          reason: classification.reason,
        });
        return;
      }
      await options.onBeforeRowUpdate?.({ id: row.id, key: row.key });
      const updated = await db
        .update(featureFlagsTable)
        .set({ ownershipState: 'intentional_global' })
        .where(expectedState(row))
        .returning();
      await emit(
        updated.length === 0
          ? concurrent
          : {
              ...base,
              outcome: 'intentional_global',
              reason: classification.reason,
            },
      );
      return;
    }

    // proposedOwnershipState === 'canonical_organization'
    const organizationId = classification.organizationId as string;
    const parentTenantId = classification.parentTenantId ?? undefined;
    const resolvedBase = {
      ...base,
      organizationId,
      ...(parentTenantId ? { parentTenantId } : {}),
    };

    if (
      await hasExistingCanonicalCollision(db, row.key, organizationId, row.id)
    ) {
      if (!apply) {
        await emit({
          ...resolvedBase,
          outcome: 'quarantined',
          reason: 'canonical_collision_quarantined',
        });
        return;
      }
      await options.onBeforeRowUpdate?.({ id: row.id, key: row.key });
      const q = await db
        .update(featureFlagsTable)
        .set({ ownershipState: 'quarantined' })
        .where(expectedState(row))
        .returning();
      await emit(
        q.length === 0
          ? concurrent
          : {
              ...resolvedBase,
              outcome: 'quarantined',
              reason: 'canonical_collision_quarantined',
            },
      );
      return;
    }

    if (!apply) {
      await emit({
        ...resolvedBase,
        outcome: 'canonical_organization',
        reason: classification.reason,
      });
      return;
    }

    await options.onBeforeRowUpdate?.({ id: row.id, key: row.key });
    try {
      const updated = await db
        .update(featureFlagsTable)
        .set({ organizationId, ownershipState: 'canonical_organization' })
        .where(expectedState(row))
        .returning();
      await emit(
        updated.length === 0
          ? concurrent
          : {
              ...resolvedBase,
              outcome: 'canonical_organization',
              reason: classification.reason,
            },
      );
    } catch (error) {
      if (!isCanonicalPartialUniqueViolation(error)) throw error;
      const q = await db
        .update(featureFlagsTable)
        .set({ ownershipState: 'quarantined' })
        .where(expectedState(row))
        .returning();
      await emit(
        q.length === 0
          ? concurrent
          : {
              ...resolvedBase,
              outcome: 'quarantined',
              reason: 'canonical_collision_quarantined',
            },
      );
    }
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
 * Returns an error string if `relPath` already exists (a prior run's audit
 * evidence must never be truncated), else `null`. READ-ONLY — never writes.
 */
export function checkArtifactPathIsNew(
  relPath: string,
  label: string,
): string | null {
  return pathExistsWithinBase(relPath, process.cwd(), label)
    ? `${label} path already exists: ${relPath}. Refusing to overwrite prior audit evidence — choose a new path.`
    : null;
}

/** Exclusive-create a repo-confined artifact file. `wx` also fails on race. */
function openNewArtifact(relPath: string, label: string): number {
  const err = checkArtifactPathIsNew(relPath, label);
  if (err) {
    console.error(`[flags:backfill] ${err}`);
    process.exit(1);
  }
  return openSyncWithinBase(relPath, process.cwd(), 'wx', label);
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

  // Open artifacts (exclusive) BEFORE touching the DB, so a bad path aborts early.
  const decisionsFd = decisionsPath
    ? openNewArtifact(decisionsPath, 'flags:backfill --decisions')
    : null;
  const reportFd = reportPath
    ? openNewArtifact(reportPath, 'flags:backfill --report')
    : null;

  const runId = randomUUID();
  const onDecision = decisionsFd
    ? (decision: BackfillDecision) => {
        writeSync(decisionsFd, `${JSON.stringify(decision)}\n`);
      }
    : undefined;

  const dbRuntime = createDb({ provider, driver, url });

  console.error(
    `[flags:backfill] runId=${runId} mode=${mode} driver=${driver} ` +
      `batchSize=${batchSize}` +
      (startAfterId ? ` startAfter=${startAfterId}` : '') +
      ` AUTH_PROVIDER=${process.env.AUTH_PROVIDER ?? '(unset)'} (non-authoritative diagnostic)`,
  );

  try {
    const report = await runFeatureFlagOwnershipBackfill(dbRuntime.db, {
      mode,
      batchSize,
      startAfterId,
      runId,
      onDecision,
    });

    const json = JSON.stringify(report, null, 2);
    process.stdout.write(`${json}\n`);
    if (reportFd !== null) writeSync(reportFd, `${json}\n`);

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
    if (decisionsFd !== null) closeSync(decisionsFd);
    if (reportFd !== null) closeSync(reportFd);
    await dbRuntime.close?.();
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
