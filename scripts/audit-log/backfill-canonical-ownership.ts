import { randomUUID } from 'node:crypto';

import { and, asc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';

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
  | 'quarantined';

export type AuditOwnershipBackfillReason =
  | LegacyOwnershipReason
  | 'canonical_collision_quarantined'
  | 'projected_collision_quarantined'
  | 'collision_scan_incomplete';

export interface AuditOwnershipBackfillDecisionEvidence {
  readonly nullSemantics: LegacyNullSemantics;
  readonly directInternalOrganization: ResolvedOrganization | null;
  readonly providerMappings: readonly ProviderMappingEvidence[];
  readonly isKnownTenantId: boolean;
}

export interface AuditOwnershipBackfillDecision {
  readonly runId: string;
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
}

export interface AuditOwnershipBackfillReport {
  readonly runId: string;
  readonly runMode: 'dry-run';
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

  const [canonicalWinner] = await db
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

  if (canonicalWinner) {
    return {
      outcome: 'quarantined',
      reason: 'canonical_collision_quarantined',
      proposedOrganizationId: organizationId,
      parentTenantId: base.parentTenantId,
    };
  }

  const siblings = await db
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
    }

    await options.onDecision?.({
      runId,
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
