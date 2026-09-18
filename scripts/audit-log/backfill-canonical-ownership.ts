import { randomUUID } from 'node:crypto';

import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';

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
import {
  authOrganizationIdentitiesReferenceTable,
  organizationsReferenceTable,
  tenantsReferenceTable,
} from '@/core/db/schema/references';
import type { DrizzleDb } from '@/core/db/types';

import type { AuditCategory } from '@/modules/audit-log/domain/category';
import {
  auditEventsTable,
  auditLogSettingsTable,
} from '@/modules/audit-log/infrastructure/drizzle/schema';

const DEFAULT_BATCH_SIZE = 500;
const SETTINGS_SIBLING_LIMIT = 1000;

export type AuditOwnershipBackfillSource =
  | 'audit_log_settings'
  | 'audit_events';

export type AuditOwnershipBackfillOutcome =
  | 'canonical_organization'
  | 'intentional_global'
  | 'unresolved_legacy'
  | 'quarantined'
  | 'concurrently_changed';

export type AuditOwnershipBackfillReason =
  | LegacyOwnershipReason
  | 'canonical_collision_quarantined'
  | 'projected_collision_quarantined'
  | 'collision_scan_incomplete'
  | 'candidate_changed'
  | 'evidence_changed'
  | 'collision_changed';

export interface AuditOwnershipBackfillDecisionEvidence {
  readonly nullSemantics: LegacyNullSemantics;
  readonly directInternalOrganization: ResolvedOrganization | null;
  readonly providerMappings: readonly ProviderMappingEvidence[];
  readonly isKnownTenantId: boolean;
}

export interface AuditOwnershipBackfillDecision {
  readonly runId: string;
  readonly phase: 'intent' | 'result';
  readonly sourceTable: AuditOwnershipBackfillSource;
  readonly rowId: string;
  readonly category: AuditCategory;
  readonly legacyTenantId: string | null;
  readonly outcome: AuditOwnershipBackfillOutcome;
  readonly reason: AuditOwnershipBackfillReason;
  readonly proposedOrganizationId: string | null;
  readonly parentTenantId: string | null;
  readonly evidence: AuditOwnershipBackfillDecisionEvidence;
}

export interface AuditOwnershipBackfillTableReport {
  readonly candidateCount: number;
  readonly canonicalOrganizationCount: number;
  readonly intentionalGlobalCount: number;
  readonly unresolvedCount: number;
  readonly quarantinedCount: number;
  readonly concurrentlyChangedCount: number;
}

export interface AuditOwnershipBackfillReport {
  readonly runId: string;
  readonly runMode: 'dry-run' | 'apply';
  readonly startedAt: string;
  readonly completedAt: string;
  readonly batchSize: number;
  readonly reasonCounts: Record<string, number>;
  readonly byTable: Record<
    AuditOwnershipBackfillSource,
    AuditOwnershipBackfillTableReport
  >;
}

export interface AuditOwnershipBackfillDryRunOptions {
  readonly batchSize?: number;
  readonly runId?: string;
  readonly settingsStartAfterId?: string | null;
  readonly eventsStartAfterId?: number | null;
  readonly onDecision?: (
    decision: AuditOwnershipBackfillDecision,
  ) => Promise<void> | void;
}

export interface AuditOwnershipBackfillOptions
  extends AuditOwnershipBackfillDryRunOptions {
  readonly mode: 'dry-run' | 'apply';
  /**
   * Test seam invoked after a durable intent record and before the mutation
   * transaction starts. Production durability is supplied by the later CLI
   * artifact sink; C2 requires a sink but does not expose a Production CLI.
   */
  readonly onBeforeRowUpdate?: (
    decision: AuditOwnershipBackfillDecision,
  ) => Promise<void> | void;
  /**
   * Test seam inside the locked transaction, after current evidence has been
   * revalidated and before the final settings collision check / mutation.
   */
  readonly onLockedBeforeMutation?: (
    decision: AuditOwnershipBackfillDecision,
  ) => Promise<void> | void;
  /**
   * Test seam after the fresh settings collision disposition is derived.
   * Useful for exercising the canonical partial-unique race on real Postgres.
   */
  readonly onAfterFreshCollisionCheck?: (
    decision: AuditOwnershipBackfillDecision,
  ) => Promise<void> | void;
}

interface SettingsCandidate {
  readonly id: string;
  readonly category: AuditCategory;
  readonly tenantId: string | null;
}

interface EventCandidate {
  readonly id: number;
  readonly category: AuditCategory;
  readonly tenantId: string | null;
}

interface PlannedOutcome {
  readonly outcome: AuditOwnershipBackfillOutcome;
  readonly reason: AuditOwnershipBackfillReason;
  readonly proposedOrganizationId: string | null;
  readonly parentTenantId: string | null;
}

const AUDIT_NULL_SEMANTICS: LegacyNullSemantics = 'proven_intentional_global';

const NULL_EVIDENCE: LegacyOwnershipEvidence = {
  legacyValue: null,
  nullSemantics: AUDIT_NULL_SEMANTICS,
  directInternalOrganization: null,
  providerMappings: [],
  isKnownTenantId: false,
};

function createEmptyTableReport(): {
  candidateCount: number;
  canonicalOrganizationCount: number;
  intentionalGlobalCount: number;
  unresolvedCount: number;
  quarantinedCount: number;
} {
  return {
    candidateCount: 0,
    canonicalOrganizationCount: 0,
    intentionalGlobalCount: 0,
    unresolvedCount: 0,
    quarantinedCount: 0,
    concurrentlyChangedCount: 0,
  };
}

async function loadAuditLegacyOwnershipEvidence(
  legacyValues: readonly string[],
  db: DrizzleDb,
): Promise<Map<string, LegacyOwnershipEvidence>> {
  const unique = [...new Set(legacyValues)];
  const out = new Map<string, LegacyOwnershipEvidence>();
  if (unique.length === 0) return out;

  const uuidShaped = unique.filter((value) =>
    isCanonicalIdRepresentation(value),
  );

  const directRows = uuidShaped.length
    ? await db
        .select({
          id: organizationsReferenceTable.id,
          tenantId: organizationsReferenceTable.tenantId,
        })
        .from(organizationsReferenceTable)
        .where(inArray(organizationsReferenceTable.id, uuidShaped))
    : [];

  const directByLowerId = new Map<string, ResolvedOrganization>();
  for (const row of directRows) {
    directByLowerId.set(row.id.toLowerCase(), {
      organizationId: row.id,
      parentTenantId: row.tenantId,
    });
  }

  const identityRows = await db
    .select({
      externalOrgId: authOrganizationIdentitiesReferenceTable.externalOrgId,
      provider: authOrganizationIdentitiesReferenceTable.provider,
      organizationId: authOrganizationIdentitiesReferenceTable.organizationId,
    })
    .from(authOrganizationIdentitiesReferenceTable)
    .where(
      inArray(authOrganizationIdentitiesReferenceTable.externalOrgId, unique),
    );

  const mappedOrgIds = [
    ...new Set(identityRows.map((row) => row.organizationId)),
  ];

  const verifiedRows = mappedOrgIds.length
    ? await db
        .select({
          id: organizationsReferenceTable.id,
          tenantId: organizationsReferenceTable.tenantId,
        })
        .from(organizationsReferenceTable)
        .where(inArray(organizationsReferenceTable.id, mappedOrgIds))
    : [];

  const verifiedByLowerId = new Map<string, ResolvedOrganization>();
  for (const row of verifiedRows) {
    verifiedByLowerId.set(row.id.toLowerCase(), {
      organizationId: row.id,
      parentTenantId: row.tenantId,
    });
  }

  const tenantCandidates = uuidShaped.filter(
    (value) => !directByLowerId.has(value.toLowerCase()),
  );

  const tenantRows = tenantCandidates.length
    ? await db
        .select({ id: tenantsReferenceTable.id })
        .from(tenantsReferenceTable)
        .where(inArray(tenantsReferenceTable.id, tenantCandidates))
    : [];

  const knownTenantIds = new Set(tenantRows.map((row) => row.id.toLowerCase()));

  for (const legacyValue of unique) {
    const directInternalOrganization =
      directByLowerId.get(legacyValue.toLowerCase()) ?? null;

    const providerMappings: ProviderMappingEvidence[] = identityRows
      .filter((row) => row.externalOrgId === legacyValue)
      .map((row) => ({
        provider: row.provider,
        mappedOrganizationId: row.organizationId,
        verified:
          verifiedByLowerId.get(row.organizationId.toLowerCase()) ?? null,
      }));

    out.set(legacyValue, {
      legacyValue,
      nullSemantics: AUDIT_NULL_SEMANTICS,
      directInternalOrganization,
      providerMappings,
      isKnownTenantId: knownTenantIds.has(legacyValue.toLowerCase()),
    });
  }

  return out;
}

function evidenceFor(
  tenantId: string | null,
  evidenceByValue: Map<string, LegacyOwnershipEvidence>,
): LegacyOwnershipEvidence {
  if (tenantId === null) return NULL_EVIDENCE;

  return (
    evidenceByValue.get(tenantId) ?? {
      legacyValue: tenantId,
      nullSemantics: AUDIT_NULL_SEMANTICS,
      directInternalOrganization: null,
      providerMappings: [],
      isKnownTenantId: false,
    }
  );
}

function baseOutcome(
  classification: LegacyOwnershipClassification,
): PlannedOutcome {
  if (!classification.mutates) {
    return {
      outcome: 'unresolved_legacy',
      reason: classification.reason,
      proposedOrganizationId: null,
      parentTenantId: null,
    };
  }

  if (classification.proposedOwnershipState === 'intentional_global') {
    return {
      outcome: 'intentional_global',
      reason: classification.reason,
      proposedOrganizationId: null,
      parentTenantId: null,
    };
  }

  return {
    outcome: 'canonical_organization',
    reason: classification.reason,
    proposedOrganizationId: classification.organizationId,
    parentTenantId: classification.parentTenantId,
  };
}

async function planSettingsOutcome(
  db: DrizzleDb,
  row: SettingsCandidate,
  classification: LegacyOwnershipClassification,
  options: { readonly lockWitness?: boolean } = {},
): Promise<PlannedOutcome> {
  const base = baseOutcome(classification);
  if (base.outcome !== 'canonical_organization') return base;

  const organizationId = base.proposedOrganizationId;
  if (organizationId === null) {
    return {
      outcome: 'unresolved_legacy',
      reason: 'unresolved_arbitrary_string',
      proposedOrganizationId: null,
      parentTenantId: null,
    };
  }

  const canonicalWinnerQuery = db
    .select({ id: auditLogSettingsTable.id })
    .from(auditLogSettingsTable)
    .where(
      and(
        eq(auditLogSettingsTable.category, row.category),
        eq(auditLogSettingsTable.organizationId, organizationId),
        eq(auditLogSettingsTable.ownershipState, 'canonical_organization'),
        ne(auditLogSettingsTable.id, row.id),
      ),
    )
    .limit(1);
  const canonicalWinners = options.lockWitness
    ? await canonicalWinnerQuery.for('share')
    : await canonicalWinnerQuery;
  const canonicalWinner = canonicalWinners[0];

  if (canonicalWinner) {
    return {
      outcome: 'quarantined',
      reason: 'canonical_collision_quarantined',
      proposedOrganizationId: organizationId,
      parentTenantId: base.parentTenantId,
    };
  }

  const siblingsQuery = db
    .select({
      id: auditLogSettingsTable.id,
      tenantId: auditLogSettingsTable.tenantId,
    })
    .from(auditLogSettingsTable)
    .where(
      and(
        eq(auditLogSettingsTable.category, row.category),
        ne(auditLogSettingsTable.id, row.id),
        or(
          eq(auditLogSettingsTable.ownershipState, 'unresolved_legacy'),
          eq(auditLogSettingsTable.ownershipState, 'quarantined'),
        ),
      ),
    )
    .orderBy(asc(auditLogSettingsTable.id))
    .limit(SETTINGS_SIBLING_LIMIT + 1);
  const siblings = options.lockWitness
    ? await siblingsQuery.for('share')
    : await siblingsQuery;

  const scanComplete = siblings.length <= SETTINGS_SIBLING_LIMIT;
  const boundedSiblings = siblings.slice(0, SETTINGS_SIBLING_LIMIT);
  const siblingValues = boundedSiblings
    .map((sibling) => sibling.tenantId)
    .filter((value): value is string => value !== null);
  const siblingEvidence = await loadAuditLegacyOwnershipEvidence(
    siblingValues,
    db,
  );

  for (const sibling of boundedSiblings) {
    const siblingClassification = classifyLegacyOwnership(
      evidenceFor(sibling.tenantId, siblingEvidence),
    );
    if (
      siblingClassification.proposedOwnershipState ===
        'canonical_organization' &&
      siblingClassification.organizationId === organizationId
    ) {
      return {
        outcome: 'quarantined',
        reason: 'projected_collision_quarantined',
        proposedOrganizationId: organizationId,
        parentTenantId: base.parentTenantId,
      };
    }
  }

  if (!scanComplete) {
    return {
      outcome: 'unresolved_legacy',
      reason: 'collision_scan_incomplete',
      proposedOrganizationId: null,
      parentTenantId: null,
    };
  }

  return base;
}

function toDecisionEvidence(
  evidence: LegacyOwnershipEvidence,
): AuditOwnershipBackfillDecisionEvidence {
  return {
    nullSemantics: evidence.nullSemantics,
    directInternalOrganization: evidence.directInternalOrganization,
    providerMappings: evidence.providerMappings,
    isKnownTenantId: evidence.isKnownTenantId,
  };
}

export async function runAuditOwnershipBackfillDryRun(
  db: DrizzleDb,
  options: AuditOwnershipBackfillDryRunOptions = {},
): Promise<AuditOwnershipBackfillReport> {
  const runId = options.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);

  const settingsReport = createEmptyTableReport();
  const eventsReport = createEmptyTableReport();
  const reasonCounts = new Map<string, number>();

  const emit = async (
    sourceTable: AuditOwnershipBackfillSource,
    row: SettingsCandidate | EventCandidate,
    evidence: LegacyOwnershipEvidence,
    planned: PlannedOutcome,
  ): Promise<void> => {
    const report =
      sourceTable === 'audit_log_settings' ? settingsReport : eventsReport;

    report.candidateCount += 1;
    reasonCounts.set(
      planned.reason,
      (reasonCounts.get(planned.reason) ?? 0) + 1,
    );

    switch (planned.outcome) {
      case 'canonical_organization':
        report.canonicalOrganizationCount += 1;
        break;
      case 'intentional_global':
        report.intentionalGlobalCount += 1;
        break;
      case 'unresolved_legacy':
        report.unresolvedCount += 1;
        break;
      case 'quarantined':
        report.quarantinedCount += 1;
        break;
      case 'concurrently_changed':
        report.concurrentlyChangedCount += 1;
        break;
    }

    await options.onDecision?.({
      runId,
      phase: 'result',
      sourceTable,
      rowId: String(row.id),
      category: row.category,
      legacyTenantId: row.tenantId,
      outcome: planned.outcome,
      reason: planned.reason,
      proposedOrganizationId: planned.proposedOrganizationId,
      parentTenantId: planned.parentTenantId,
      evidence: toDecisionEvidence(evidence),
    });
  };

  let settingsCursor = options.settingsStartAfterId ?? null;
  for (;;) {
    const rows = await db
      .select({
        id: auditLogSettingsTable.id,
        category: auditLogSettingsTable.category,
        tenantId: auditLogSettingsTable.tenantId,
      })
      .from(auditLogSettingsTable)
      .where(
        and(
          eq(auditLogSettingsTable.ownershipState, 'unresolved_legacy'),
          isNull(auditLogSettingsTable.organizationId),
          settingsCursor === null
            ? undefined
            : gt(auditLogSettingsTable.id, settingsCursor),
        ),
      )
      .orderBy(asc(auditLogSettingsTable.id))
      .limit(batchSize);

    if (rows.length === 0) break;

    const evidence = await loadAuditLegacyOwnershipEvidence(
      rows
        .map((row) => row.tenantId)
        .filter((value): value is string => value !== null),
      db,
    );

    for (const row of rows) {
      const rowEvidence = evidenceFor(row.tenantId, evidence);
      const classification = classifyLegacyOwnership(rowEvidence);
      const planned = await planSettingsOutcome(
        db,
        {
          id: row.id,
          category: row.category,
          tenantId: row.tenantId,
        },
        classification,
      );
      await emit(
        'audit_log_settings',
        {
          id: row.id,
          category: row.category,
          tenantId: row.tenantId,
        },
        rowEvidence,
        planned,
      );
    }

    settingsCursor = rows[rows.length - 1]?.id ?? settingsCursor;
    if (rows.length < batchSize) break;
  }

  let eventsCursor = options.eventsStartAfterId ?? null;
  for (;;) {
    const rows = await db
      .select({
        id: auditEventsTable.id,
        category: auditEventsTable.category,
        tenantId: auditEventsTable.tenantId,
      })
      .from(auditEventsTable)
      .where(
        and(
          eq(auditEventsTable.ownershipState, 'unresolved_legacy'),
          isNull(auditEventsTable.organizationId),
          eventsCursor === null
            ? undefined
            : gt(auditEventsTable.id, eventsCursor),
        ),
      )
      .orderBy(asc(auditEventsTable.id))
      .limit(batchSize);

    if (rows.length === 0) break;

    const evidence = await loadAuditLegacyOwnershipEvidence(
      rows
        .map((row) => row.tenantId)
        .filter((value): value is string => value !== null),
      db,
    );

    for (const row of rows) {
      const rowEvidence = evidenceFor(row.tenantId, evidence);
      const classification = classifyLegacyOwnership(rowEvidence);
      await emit(
        'audit_events',
        {
          id: row.id,
          category: row.category,
          tenantId: row.tenantId,
        },
        rowEvidence,
        baseOutcome(classification),
      );
    }

    eventsCursor = rows[rows.length - 1]?.id ?? eventsCursor;
    if (rows.length < batchSize) break;
  }

  return {
    runId,
    runMode: 'dry-run',
    startedAt,
    completedAt: new Date().toISOString(),
    batchSize,
    reasonCounts: Object.fromEntries(reasonCounts),
    byTable: {
      audit_log_settings: settingsReport,
      audit_events: eventsReport,
    },
  };
}


function normalizeAuditEvidence(evidence: LegacyOwnershipEvidence): string {
  const normalizeOrg = (org: ResolvedOrganization | null) =>
    org === null
      ? null
      : {
          organizationId: org.organizationId,
          parentTenantId: org.parentTenantId,
        };

  const providerMappings = evidence.providerMappings
    .map((mapping) => ({
      provider: mapping.provider,
      mappedOrganizationId: mapping.mappedOrganizationId,
      verified: normalizeOrg(mapping.verified),
    }))
    .sort((a, b) => {
      const left = JSON.stringify([
        a.provider,
        a.mappedOrganizationId,
        a.verified?.organizationId ?? null,
        a.verified?.parentTenantId ?? null,
      ]);
      const right = JSON.stringify([
        b.provider,
        b.mappedOrganizationId,
        b.verified?.organizationId ?? null,
        b.verified?.parentTenantId ?? null,
      ]);
      return left < right ? -1 : left > right ? 1 : 0;
    });

  return JSON.stringify({
    legacyValue: evidence.legacyValue,
    nullSemantics: evidence.nullSemantics,
    directInternalOrganization: normalizeOrg(
      evidence.directInternalOrganization,
    ),
    providerMappings,
    isKnownTenantId: evidence.isKnownTenantId,
  });
}

function evidenceFromDecision(
  decision: AuditOwnershipBackfillDecision,
): LegacyOwnershipEvidence {
  return {
    legacyValue: decision.legacyTenantId,
    nullSemantics: decision.evidence.nullSemantics,
    directInternalOrganization:
      decision.evidence.directInternalOrganization,
    providerMappings: [...decision.evidence.providerMappings],
    isKnownTenantId: decision.evidence.isKnownTenantId,
  };
}

function sameAuditClassification(
  left: LegacyOwnershipClassification,
  right: LegacyOwnershipClassification,
): boolean {
  return (
    left.proposedOwnershipState === right.proposedOwnershipState &&
    left.organizationId === right.organizationId &&
    left.parentTenantId === right.parentTenantId &&
    left.reason === right.reason &&
    left.mutates === right.mutates
  );
}

export async function acquireAuditOwnershipEvidenceLocks(
  db: DrizzleDb,
): Promise<void> {
  await db.execute(
    sql`LOCK TABLE tenants, organizations, auth_organization_identities IN SHARE MODE`,
  );
}

function rawRows<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  return ((raw as { rows?: unknown[] }).rows ?? []) as T[];
}

async function lockSettingsCandidateForUpdate(
  db: DrizzleDb,
  decision: AuditOwnershipBackfillDecision,
): Promise<boolean> {
  const raw = await db.execute(
    sql`SELECT id, category::text AS category, tenant_id, organization_id, ownership_state
        FROM audit_log_settings
        WHERE id = ${decision.rowId}
        LIMIT 1
        FOR UPDATE`,
  );
  const row = rawRows<{
    id: string;
    category: string;
    tenant_id: string | null;
    organization_id: string | null;
    ownership_state: string;
  }>(raw)[0];

  return Boolean(
    row &&
      row.id === decision.rowId &&
      row.category === decision.category &&
      row.tenant_id === decision.legacyTenantId &&
      row.organization_id === null &&
      row.ownership_state === 'unresolved_legacy',
  );
}

async function lockEventCandidateForUpdate(
  db: DrizzleDb,
  decision: AuditOwnershipBackfillDecision,
): Promise<boolean> {
  const eventId = Number(decision.rowId);
  const raw = await db.execute(
    sql`SELECT id, category::text AS category, tenant_id, organization_id, ownership_state
        FROM audit_events
        WHERE id = ${eventId}
        LIMIT 1
        FOR UPDATE`,
  );
  const row = rawRows<{
    id: number | string;
    category: string;
    tenant_id: string | null;
    organization_id: string | null;
    ownership_state: string;
  }>(raw)[0];

  return Boolean(
    row &&
      String(row.id) === decision.rowId &&
      row.category === decision.category &&
      row.tenant_id === decision.legacyTenantId &&
      row.organization_id === null &&
      row.ownership_state === 'unresolved_legacy',
  );
}

function settingsExpectedState(decision: AuditOwnershipBackfillDecision) {
  return and(
    eq(auditLogSettingsTable.id, decision.rowId),
    eq(auditLogSettingsTable.category, decision.category),
    eq(auditLogSettingsTable.ownershipState, 'unresolved_legacy'),
    isNull(auditLogSettingsTable.organizationId),
    decision.legacyTenantId === null
      ? isNull(auditLogSettingsTable.tenantId)
      : eq(auditLogSettingsTable.tenantId, decision.legacyTenantId),
  );
}

function eventExpectedState(decision: AuditOwnershipBackfillDecision) {
  return and(
    eq(auditEventsTable.id, Number(decision.rowId)),
    eq(auditEventsTable.category, decision.category),
    eq(auditEventsTable.ownershipState, 'unresolved_legacy'),
    isNull(auditEventsTable.organizationId),
    decision.legacyTenantId === null
      ? isNull(auditEventsTable.tenantId)
      : eq(auditEventsTable.tenantId, decision.legacyTenantId),
  );
}

function isSettingsCanonicalPartialUniqueViolation(error: unknown): boolean {
  const constraint = 'uq_audit_log_settings_category_organization_canonical';
  const layers: unknown[] = [
    error,
    error && typeof error === 'object'
      ? (error as { cause?: unknown }).cause
      : undefined,
  ];

  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    const candidate = layer as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
      message?: unknown;
    };
    const named =
      typeof candidate.constraint === 'string'
        ? candidate.constraint
        : typeof candidate.constraint_name === 'string'
          ? candidate.constraint_name
          : undefined;
    const message =
      typeof candidate.message === 'string' ? candidate.message : '';

    if (named === constraint || message.includes(constraint)) return true;
    if (named && named !== constraint) return false;
    if (
      candidate.code === '23505' &&
      !named &&
      !message.includes('constraint "')
    ) {
      return true;
    }
  }

  return false;
}

async function lockCanonicalSettingsWinnerForShare(
  db: DrizzleDb,
  category: AuditCategory,
  organizationId: string,
  excludeId: string,
): Promise<boolean> {
  const raw = await db.execute(
    sql`SELECT id
        FROM audit_log_settings
        WHERE category = ${category}
          AND organization_id = ${organizationId}
          AND ownership_state = 'canonical_organization'
          AND id <> ${excludeId}
        LIMIT 1
        FOR SHARE`,
  );
  return rawRows<{ id: string }>(raw).length > 0;
}

interface ApplyResult {
  readonly outcome: AuditOwnershipBackfillOutcome;
  readonly reason: AuditOwnershipBackfillReason;
  readonly proposedOrganizationId: string | null;
  readonly parentTenantId: string | null;
  readonly evidence: LegacyOwnershipEvidence;
}

async function loadFreshEvidence(
  db: DrizzleDb,
  decision: AuditOwnershipBackfillDecision,
): Promise<LegacyOwnershipEvidence> {
  if (decision.legacyTenantId === null) return NULL_EVIDENCE;
  const evidence = await loadAuditLegacyOwnershipEvidence(
    [decision.legacyTenantId],
    db,
  );
  return evidenceFor(decision.legacyTenantId, evidence);
}

function concurrentResult(
  decision: AuditOwnershipBackfillDecision,
  reason: 'candidate_changed' | 'evidence_changed' | 'collision_changed',
  evidence = evidenceFromDecision(decision),
): ApplyResult {
  return {
    outcome: 'concurrently_changed',
    reason,
    proposedOrganizationId: null,
    parentTenantId: null,
    evidence,
  };
}

async function applyEventDecision(
  db: DrizzleDb,
  decision: AuditOwnershipBackfillDecision,
  options: AuditOwnershipBackfillOptions,
): Promise<ApplyResult> {
  const plannedEvidence = evidenceFromDecision(decision);
  const plannedClassification = classifyLegacyOwnership(plannedEvidence);

  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DrizzleDb;
    await acquireAuditOwnershipEvidenceLocks(tx);

    if (!(await lockEventCandidateForUpdate(tx, decision))) {
      return concurrentResult(decision, 'candidate_changed');
    }

    const freshEvidence = await loadFreshEvidence(tx, decision);
    const freshClassification = classifyLegacyOwnership(freshEvidence);
    if (
      normalizeAuditEvidence(freshEvidence) !==
        normalizeAuditEvidence(plannedEvidence) ||
      !sameAuditClassification(freshClassification, plannedClassification)
    ) {
      return concurrentResult(
        decision,
        'evidence_changed',
        freshEvidence,
      );
    }

    await options.onLockedBeforeMutation?.(decision);

    const fresh = baseOutcome(freshClassification);
    if (fresh.outcome === 'unresolved_legacy') {
      return concurrentResult(decision, 'evidence_changed', freshEvidence);
    }

    const values =
      fresh.outcome === 'canonical_organization'
        ? {
            organizationId: fresh.proposedOrganizationId,
            ownershipState: 'canonical_organization' as const,
          }
        : {
            organizationId: null,
            ownershipState: 'intentional_global' as const,
          };

    const updated = await tx
      .update(auditEventsTable)
      .set(values)
      .where(eventExpectedState(decision))
      .returning();

    if (updated.length === 0) {
      return concurrentResult(decision, 'candidate_changed', freshEvidence);
    }

    return { ...fresh, evidence: freshEvidence };
  });
}

async function applySettingsDecision(
  db: DrizzleDb,
  decision: AuditOwnershipBackfillDecision,
  options: AuditOwnershipBackfillOptions,
): Promise<ApplyResult> {
  const plannedEvidence = evidenceFromDecision(decision);
  const plannedClassification = classifyLegacyOwnership(plannedEvidence);

  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as DrizzleDb;
    await acquireAuditOwnershipEvidenceLocks(tx);

    if (!(await lockSettingsCandidateForUpdate(tx, decision))) {
      return concurrentResult(decision, 'candidate_changed');
    }

    const freshEvidence = await loadFreshEvidence(tx, decision);
    const freshClassification = classifyLegacyOwnership(freshEvidence);
    if (
      normalizeAuditEvidence(freshEvidence) !==
        normalizeAuditEvidence(plannedEvidence) ||
      !sameAuditClassification(freshClassification, plannedClassification)
    ) {
      return concurrentResult(
        decision,
        'evidence_changed',
        freshEvidence,
      );
    }

    await options.onLockedBeforeMutation?.(decision);

    const candidate: SettingsCandidate = {
      id: decision.rowId,
      category: decision.category,
      tenantId: decision.legacyTenantId,
    };
    const fresh =
      freshClassification.proposedOwnershipState === 'canonical_organization'
        ? await planSettingsOutcome(tx, candidate, freshClassification, {
            lockWitness: true,
          })
        : baseOutcome(freshClassification);

    await options.onAfterFreshCollisionCheck?.(decision);

    if (
      decision.outcome === 'quarantined' &&
      fresh.outcome !== 'quarantined'
    ) {
      return concurrentResult(decision, 'collision_changed', freshEvidence);
    }
    if (fresh.outcome === 'unresolved_legacy') {
      return concurrentResult(decision, 'collision_changed', freshEvidence);
    }

    if (fresh.outcome === 'intentional_global') {
      const updated = await tx
        .update(auditLogSettingsTable)
        .set({
          organizationId: null,
          ownershipState: 'intentional_global',
        })
        .where(settingsExpectedState(decision))
        .returning();
      return updated.length === 0
        ? concurrentResult(decision, 'candidate_changed', freshEvidence)
        : { ...fresh, evidence: freshEvidence };
    }

    if (fresh.outcome === 'quarantined') {
      const updated = await tx
        .update(auditLogSettingsTable)
        .set({
          organizationId: null,
          ownershipState: 'quarantined',
        })
        .where(settingsExpectedState(decision))
        .returning();
      return updated.length === 0
        ? concurrentResult(decision, 'candidate_changed', freshEvidence)
        : { ...fresh, evidence: freshEvidence };
    }

    try {
      const updated = await tx.transaction(async (savepointRaw) => {
        const savepoint = savepointRaw as unknown as DrizzleDb;
        return savepoint
          .update(auditLogSettingsTable)
          .set({
            organizationId: fresh.proposedOrganizationId,
            ownershipState: 'canonical_organization',
          })
          .where(settingsExpectedState(decision))
          .returning();
      });

      return updated.length === 0
        ? concurrentResult(decision, 'candidate_changed', freshEvidence)
        : { ...fresh, evidence: freshEvidence };
    } catch (error) {
      if (!isSettingsCanonicalPartialUniqueViolation(error)) throw error;

      const organizationId = fresh.proposedOrganizationId;
      if (
        organizationId === null ||
        !(await lockCanonicalSettingsWinnerForShare(
          tx,
          decision.category,
          organizationId,
          decision.rowId,
        ))
      ) {
        return concurrentResult(decision, 'collision_changed', freshEvidence);
      }

      const quarantined = await tx
        .update(auditLogSettingsTable)
        .set({
          organizationId: null,
          ownershipState: 'quarantined',
        })
        .where(settingsExpectedState(decision))
        .returning();

      return quarantined.length === 0
        ? concurrentResult(decision, 'candidate_changed', freshEvidence)
        : {
            outcome: 'quarantined',
            reason: 'canonical_collision_quarantined',
            proposedOrganizationId: organizationId,
            parentTenantId: fresh.parentTenantId,
            evidence: freshEvidence,
          };
    }
  });
}

function incrementApplyReport(
  report: ReturnType<typeof createEmptyTableReport>,
  outcome: AuditOwnershipBackfillOutcome,
): void {
  report.candidateCount += 1;
  switch (outcome) {
    case 'canonical_organization':
      report.canonicalOrganizationCount += 1;
      break;
    case 'intentional_global':
      report.intentionalGlobalCount += 1;
      break;
    case 'unresolved_legacy':
      report.unresolvedCount += 1;
      break;
    case 'quarantined':
      report.quarantinedCount += 1;
      break;
    case 'concurrently_changed':
      report.concurrentlyChangedCount += 1;
      break;
  }
}

/**
 * AUD·C runner. Dry-run delegates to the C1 planner unchanged. Apply mode
 * streams those same planned decisions through a per-row transactional
 * revalidation boundary before mutating only organization_id/ownership_state.
 */
export async function runAuditOwnershipBackfill(
  db: DrizzleDb,
  options: AuditOwnershipBackfillOptions,
): Promise<AuditOwnershipBackfillReport> {
  if (options.mode === 'dry-run') {
    return runAuditOwnershipBackfillDryRun(db, options);
  }

  if (!options.onDecision) {
    throw new Error(
      '[audit-log:backfill] apply mode requires an onDecision sink — ' +
        'refusing to mutate without a write-ahead intent record.',
    );
  }

  const runId = options.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const settingsReport = createEmptyTableReport();
  const eventsReport = createEmptyTableReport();
  const reasonCounts = new Map<string, number>();

  const emitExternal = async (
    decision: AuditOwnershipBackfillDecision,
  ): Promise<void> => {
    await options.onDecision?.(decision);
  };

  const dryRunOptions: AuditOwnershipBackfillDryRunOptions = {
    batchSize,
    runId,
    settingsStartAfterId: options.settingsStartAfterId,
    eventsStartAfterId: options.eventsStartAfterId,
    onDecision: async (planned) => {
      const report =
        planned.sourceTable === 'audit_log_settings'
          ? settingsReport
          : eventsReport;

      if (planned.outcome === 'unresolved_legacy') {
        incrementApplyReport(report, planned.outcome);
        reasonCounts.set(
          planned.reason,
          (reasonCounts.get(planned.reason) ?? 0) + 1,
        );
        await emitExternal(planned);
        return;
      }

      const intent: AuditOwnershipBackfillDecision = {
        ...planned,
        phase: 'intent',
      };
      await emitExternal(intent);
      await options.onBeforeRowUpdate?.(intent);

      const actual =
        planned.sourceTable === 'audit_log_settings'
          ? await applySettingsDecision(db, planned, options)
          : await applyEventDecision(db, planned, options);

      const result: AuditOwnershipBackfillDecision = {
        ...planned,
        phase: 'result',
        outcome: actual.outcome,
        reason: actual.reason,
        proposedOrganizationId: actual.proposedOrganizationId,
        parentTenantId: actual.parentTenantId,
        evidence: toDecisionEvidence(actual.evidence),
      };

      incrementApplyReport(report, result.outcome);
      reasonCounts.set(
        result.reason,
        (reasonCounts.get(result.reason) ?? 0) + 1,
      );
      await emitExternal(result);
    },
  };

  await runAuditOwnershipBackfillDryRun(db, dryRunOptions);

  return {
    runId,
    runMode: 'apply',
    startedAt,
    completedAt: new Date().toISOString(),
    batchSize,
    reasonCounts: Object.fromEntries(reasonCounts),
    byTable: {
      audit_log_settings: settingsReport,
      audit_events: eventsReport,
    },
  };
}
