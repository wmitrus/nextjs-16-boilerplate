/** @vitest-environment node */
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  runAuditOwnershipBackfill,
  runAuditOwnershipBackfillDryRun,
  type AuditOwnershipBackfillDecision,
} from './backfill-canonical-ownership';

import {
  auditEventsTable,
  auditLogSettingsTable,
} from '@/modules/audit-log/infrastructure/drizzle/schema';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const UNKNOWN_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

async function insertMapping(
  provider: string,
  externalOrgId: string,
  organizationId: string,
): Promise<void> {
  await testDb.db.execute(
    sql`INSERT INTO auth_organization_identities
          (provider, external_org_id, organization_id)
        VALUES (${provider}, ${externalOrgId}, ${organizationId})`,
  );
}

async function insertLegacySetting(
  tenantId: string | null,
  category: 'security_event' | 'membership' | 'billing' = 'security_event',
): Promise<string> {
  const [row] = await testDb.db
    .insert(auditLogSettingsTable)
    .values({
      category,
      tenantId,
      organizationId: null,
      ownershipState: 'unresolved_legacy',
      enabled: true,
      retentionDays: 90,
      sampleRate: null,
      captureInputOnSuccess: false,
      updatedByUserId: null,
    })
    .returning();

  if (!row) throw new Error('Expected audit_log_settings fixture row');
  return row.id;
}

async function insertCanonicalSetting(
  tenantId: string,
  organizationId: string,
  category: 'security_event' | 'membership' | 'billing' = 'security_event',
): Promise<string> {
  const [row] = await testDb.db
    .insert(auditLogSettingsTable)
    .values({
      category,
      tenantId,
      organizationId,
      ownershipState: 'canonical_organization',
      enabled: false,
      retentionDays: 180,
      sampleRate: null,
      captureInputOnSuccess: false,
      updatedByUserId: null,
    })
    .returning();

  if (!row) throw new Error('Expected canonical audit_log_settings fixture');
  return row.id;
}

async function insertLegacyEvent(
  tenantId: string | null,
  category: 'security_event' | 'organization' | 'membership' = 'security_event',
): Promise<number> {
  const [row] = await testDb.db
    .insert(auditEventsTable)
    .values({
      category,
      action: `fixture.${tenantId ?? 'global'}`,
      outcome: 'success',
      tenantId,
      organizationId: null,
      ownershipState: 'unresolved_legacy',
      actorUserId: null,
    })
    .returning();

  if (!row) throw new Error('Expected audit_events fixture row');
  return row.id;
}

async function decisionsForDryRun(): Promise<{
  decisions: AuditOwnershipBackfillDecision[];
  report: Awaited<ReturnType<typeof runAuditOwnershipBackfillDryRun>>;
}> {
  const decisions: AuditOwnershipBackfillDecision[] = [];
  const report = await runAuditOwnershipBackfillDryRun(testDb.db, {
    batchSize: 3,
    runId: 'aud-c-test-run',
    onDecision: (decision) => {
      decisions.push(decision);
    },
  });
  return { decisions, report };
}

async function decisionsForApply(
  overrides: Partial<Parameters<typeof runAuditOwnershipBackfill>[1]> = {},
): Promise<{
  decisions: AuditOwnershipBackfillDecision[];
  report: Awaited<ReturnType<typeof runAuditOwnershipBackfill>>;
}> {
  const decisions: AuditOwnershipBackfillDecision[] = [];
  const report = await runAuditOwnershipBackfill(testDb.db, {
    mode: 'apply',
    batchSize: 3,
    runId: 'aud-c-apply-test-run',
    onDecision: (decision) => {
      decisions.push(decision);
    },
    ...overrides,
  });
  return { decisions, report };
}

beforeAll(async () => {
  testDb = await resolveTestDb();

  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES
        (${TENANT_A}, 'AUD-C Tenant A'),
        (${TENANT_B}, 'AUD-C Tenant B')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_A1}, ${TENANT_A}, 'AUD-C Org A1'),
        (${ORG_A2}, ${TENANT_A}, 'AUD-C Org A2'),
        (${ORG_B1}, ${TENANT_B}, 'AUD-C Org B1')`,
  );
});

afterEach(async () => {
  await testDb.db.delete(auditEventsTable);
  await testDb.db.delete(auditLogSettingsTable);
  await testDb.db.execute(
    sql`DELETE FROM auth_organization_identities
        WHERE organization_id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM auth_organization_identities
        WHERE organization_id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM organizations
        WHERE id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
  await testDb.cleanup();
});

describe('AUD�C dry-run — evidence classification for both audit tables', () => {
  it('classifies Cases A-G without mutating either source table', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);
    await insertMapping('clerk', ORG_A1, ORG_A2);

    await insertMapping('clerk', 'ext-multi-same', ORG_A1);
    await insertMapping('authjs', 'ext-multi-same', ORG_A1);

    await insertMapping('clerk', 'ext-multi-diff', ORG_A1);
    await insertMapping('authjs', 'ext-multi-diff', ORG_A2);

    const legacyValues: Array<string | null> = [
      ORG_B1,
      'ext-a1',
      null,
      TENANT_A,
      UNKNOWN_UUID,
      'legacy-acme',
      ORG_A1,
      'ext-multi-same',
      'ext-multi-diff',
    ];

    for (const value of legacyValues) {
      await insertLegacySetting(
        value,
        value === 'ext-multi-same' ? 'membership' : 'security_event',
      );
      await insertLegacyEvent(value);
    }

    const { decisions, report } = await decisionsForDryRun();

    expect(report.byTable.audit_log_settings).toEqual({
      candidateCount: 9,
      canonicalOrganizationCount: 3,
      intentionalGlobalCount: 1,
      unresolvedCount: 5,
      quarantinedCount: 0,
    });
    expect(report.byTable.audit_events).toEqual({
      candidateCount: 9,
      canonicalOrganizationCount: 3,
      intentionalGlobalCount: 1,
      unresolvedCount: 5,
      quarantinedCount: 0,
    });

    expect(report.reasonCounts).toMatchObject({
      resolved_internal_organization: 2,
      resolved_provider_organization: 2,
      intentional_global_legacy_null: 2,
      unresolved_tenant_id_only: 2,
      unresolved_unknown_uuid: 2,
      unresolved_arbitrary_string: 2,
      ambiguous_internal_vs_provider: 2,
      resolved_multi_provider_organization: 2,
      ambiguous_provider_evidence: 2,
    });

    const bySourceAndLegacy = (
      sourceTable: 'audit_log_settings' | 'audit_events',
      legacyTenantId: string | null,
    ) =>
      decisions.find(
        (decision) =>
          decision.sourceTable === sourceTable &&
          decision.legacyTenantId === legacyTenantId,
      );

    for (const sourceTable of ['audit_log_settings', 'audit_events'] as const) {
      expect(bySourceAndLegacy(sourceTable, ORG_B1)).toMatchObject({
        outcome: 'canonical_organization',
        proposedOrganizationId: ORG_B1,
      });
      expect(bySourceAndLegacy(sourceTable, 'ext-a1')).toMatchObject({
        outcome: 'canonical_organization',
        proposedOrganizationId: ORG_A1,
      });
      expect(bySourceAndLegacy(sourceTable, null)).toMatchObject({
        outcome: 'intentional_global',
        proposedOrganizationId: null,
      });
      expect(bySourceAndLegacy(sourceTable, TENANT_A)).toMatchObject({
        outcome: 'unresolved_legacy',
        reason: 'unresolved_tenant_id_only',
        proposedOrganizationId: null,
      });
      expect(bySourceAndLegacy(sourceTable, ORG_A1)).toMatchObject({
        outcome: 'unresolved_legacy',
        reason: 'ambiguous_internal_vs_provider',
        proposedOrganizationId: null,
      });
      expect(bySourceAndLegacy(sourceTable, 'ext-multi-same')).toMatchObject({
        outcome: 'canonical_organization',
        reason: 'resolved_multi_provider_organization',
        proposedOrganizationId: ORG_A1,
      });
      expect(bySourceAndLegacy(sourceTable, 'ext-multi-diff')).toMatchObject({
        outcome: 'unresolved_legacy',
        reason: 'ambiguous_provider_evidence',
        proposedOrganizationId: null,
      });
    }

    const storedSettings = await testDb.db
      .select({
        organizationId: auditLogSettingsTable.organizationId,
        ownershipState: auditLogSettingsTable.ownershipState,
      })
      .from(auditLogSettingsTable);
    expect(storedSettings).toHaveLength(9);
    expect(
      storedSettings.every(
        (row) =>
          row.organizationId === null &&
          row.ownershipState === 'unresolved_legacy',
      ),
    ).toBe(true);

    const storedEvents = await testDb.db
      .select({
        organizationId: auditEventsTable.organizationId,
        ownershipState: auditEventsTable.ownershipState,
      })
      .from(auditEventsTable);
    expect(storedEvents).toHaveLength(9);
    expect(
      storedEvents.every(
        (row) =>
          row.organizationId === null &&
          row.ownershipState === 'unresolved_legacy',
      ),
    ).toBe(true);
  });

  it('does not infer an organization from a tenant that currently has one organization', async () => {
    await insertLegacySetting(TENANT_B, 'billing');
    await insertLegacyEvent(TENANT_B, 'organization');

    const { decisions } = await decisionsForDryRun();

    for (const decision of decisions) {
      expect(decision).toMatchObject({
        legacyTenantId: TENANT_B,
        outcome: 'unresolved_legacy',
        reason: 'unresolved_tenant_id_only',
        proposedOrganizationId: null,
      });
    }
  });
});

describe('AUD·C dry-run — audit_log_settings collision disposition', () => {
  it('quarantines the historical projection when an AUD·B canonical winner already exists', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);

    const historicalId = await insertLegacySetting('ext-a1', 'security_event');
    const canonicalId = await insertCanonicalSetting(
      ORG_A1,
      ORG_A1,
      'security_event',
    );

    const { decisions, report } = await decisionsForDryRun();

    expect(report.byTable.audit_log_settings).toMatchObject({
      candidateCount: 1,
      quarantinedCount: 1,
    });

    expect(
      decisions.find((decision) => decision.rowId === historicalId),
    ).toMatchObject({
      sourceTable: 'audit_log_settings',
      outcome: 'quarantined',
      reason: 'canonical_collision_quarantined',
      proposedOrganizationId: ORG_A1,
    });

    const rows = await testDb.db
      .select({
        id: auditLogSettingsTable.id,
        organizationId: auditLogSettingsTable.organizationId,
        ownershipState: auditLogSettingsTable.ownershipState,
      })
      .from(auditLogSettingsTable);

    expect(rows.find((row) => row.id === historicalId)).toMatchObject({
      organizationId: null,
      ownershipState: 'unresolved_legacy',
    });
    expect(rows.find((row) => row.id === canonicalId)).toMatchObject({
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
    });
  });

  it('quarantines every historical sibling projected to the same (category, organization)', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);

    const directId = await insertLegacySetting(ORG_A1, 'membership');
    const providerId = await insertLegacySetting('ext-a1', 'membership');

    const { decisions, report } = await decisionsForDryRun();

    expect(report.byTable.audit_log_settings).toMatchObject({
      candidateCount: 2,
      quarantinedCount: 2,
      canonicalOrganizationCount: 0,
    });

    for (const rowId of [directId, providerId]) {
      expect(
        decisions.find((decision) => decision.rowId === rowId),
      ).toMatchObject({
        outcome: 'quarantined',
        reason: 'projected_collision_quarantined',
        proposedOrganizationId: ORG_A1,
      });
    }
  });
});

describe('AUD·C dry-run — audit_events legacy retention identity', () => {
  it('keeps equal-category unresolved events with different legacy tenant ids distinct', async () => {
    const firstId = await insertLegacyEvent('legacy-a', 'security_event');
    const secondId = await insertLegacyEvent('legacy-b', 'security_event');

    const { decisions, report } = await decisionsForDryRun();

    expect(report.byTable.audit_events).toMatchObject({
      candidateCount: 2,
      unresolvedCount: 2,
    });

    expect(
      decisions.find(
        (decision) =>
          decision.sourceTable === 'audit_events' &&
          decision.rowId === String(firstId),
      ),
    ).toMatchObject({
      legacyTenantId: 'legacy-a',
      outcome: 'unresolved_legacy',
    });

    expect(
      decisions.find(
        (decision) =>
          decision.sourceTable === 'audit_events' &&
          decision.rowId === String(secondId),
      ),
    ).toMatchObject({
      legacyTenantId: 'legacy-b',
      outcome: 'unresolved_legacy',
    });
  });
});


describe('AUD·C apply — transactional ownership mutation', () => {
  it('applies canonical and intentional-global outcomes while preserving tenant_id', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);

    const canonicalSettingId = await insertLegacySetting(
      'ext-a1',
      'security_event',
    );
    const globalSettingId = await insertLegacySetting(null, 'membership');
    const unresolvedSettingId = await insertLegacySetting(TENANT_B, 'billing');

    const canonicalEventId = await insertLegacyEvent(
      'ext-a1',
      'security_event',
    );
    const globalEventId = await insertLegacyEvent(null, 'membership');
    const unresolvedEventId = await insertLegacyEvent(
      TENANT_B,
      'organization',
    );

    const { report } = await decisionsForApply();

    expect(report.runMode).toBe('apply');
    expect(report.byTable.audit_log_settings).toMatchObject({
      candidateCount: 3,
      canonicalOrganizationCount: 1,
      intentionalGlobalCount: 1,
      unresolvedCount: 1,
      quarantinedCount: 0,
      concurrentlyChangedCount: 0,
    });
    expect(report.byTable.audit_events).toMatchObject({
      candidateCount: 3,
      canonicalOrganizationCount: 1,
      intentionalGlobalCount: 1,
      unresolvedCount: 1,
      quarantinedCount: 0,
      concurrentlyChangedCount: 0,
    });

    const settings = await testDb.db.select().from(auditLogSettingsTable);
    expect(settings.find((row) => row.id === canonicalSettingId)).toMatchObject({
      tenantId: 'ext-a1',
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
    });
    expect(settings.find((row) => row.id === globalSettingId)).toMatchObject({
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
    });
    expect(settings.find((row) => row.id === unresolvedSettingId)).toMatchObject({
      tenantId: TENANT_B,
      organizationId: null,
      ownershipState: 'unresolved_legacy',
    });

    const events = await testDb.db.select().from(auditEventsTable);
    expect(events.find((row) => row.id === canonicalEventId)).toMatchObject({
      tenantId: 'ext-a1',
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
    });
    expect(events.find((row) => row.id === globalEventId)).toMatchObject({
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
    });
    expect(events.find((row) => row.id === unresolvedEventId)).toMatchObject({
      tenantId: TENANT_B,
      organizationId: null,
      ownershipState: 'unresolved_legacy',
    });
  });

  it('is idempotent after resolved rows leave the candidate set', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);
    await insertLegacySetting('ext-a1', 'security_event');
    await insertLegacyEvent('ext-a1', 'security_event');

    const first = await decisionsForApply();
    expect(first.report.byTable.audit_log_settings.candidateCount).toBe(1);
    expect(first.report.byTable.audit_events.candidateCount).toBe(1);

    const second = await decisionsForApply();
    expect(second.report.byTable.audit_log_settings.candidateCount).toBe(0);
    expect(second.report.byTable.audit_events.candidateCount).toBe(0);
  });

  it('persists settings quarantine when an AUD·B canonical winner exists', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);

    const historicalId = await insertLegacySetting(
      'ext-a1',
      'security_event',
    );
    const canonicalId = await insertCanonicalSetting(
      ORG_A1,
      ORG_A1,
      'security_event',
    );

    const { report } = await decisionsForApply();

    expect(report.byTable.audit_log_settings).toMatchObject({
      candidateCount: 1,
      quarantinedCount: 1,
      concurrentlyChangedCount: 0,
    });

    const rows = await testDb.db.select().from(auditLogSettingsTable);
    expect(rows.find((row) => row.id === historicalId)).toMatchObject({
      tenantId: 'ext-a1',
      organizationId: null,
      ownershipState: 'quarantined',
    });
    expect(rows.find((row) => row.id === canonicalId)).toMatchObject({
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
    });
  });

  it('refuses the write when the candidate changes after intent', async () => {
    await insertMapping('clerk', 'ext-a1', ORG_A1);
    const eventId = await insertLegacyEvent('ext-a1', 'security_event');

    let changed = false;
    const { decisions, report } = await decisionsForApply({
      onBeforeRowUpdate: async (decision) => {
        if (
          changed ||
          decision.sourceTable !== 'audit_events' ||
          decision.rowId !== String(eventId)
        ) {
          return;
        }
        changed = true;
        await testDb.db
          .update(auditEventsTable)
          .set({ ownershipState: 'quarantined' })
          .where(eq(auditEventsTable.id, eventId));
      },
    });

    expect(report.byTable.audit_events.concurrentlyChangedCount).toBe(1);
    expect(
      decisions.find(
        (decision) =>
          decision.phase === 'result' &&
          decision.sourceTable === 'audit_events' &&
          decision.rowId === String(eventId),
      ),
    ).toMatchObject({
      outcome: 'concurrently_changed',
      reason: 'candidate_changed',
    });

    const [row] = await testDb.db
      .select()
      .from(auditEventsTable)
      .where(eq(auditEventsTable.id, eventId));
    expect(row).toMatchObject({
      organizationId: null,
      ownershipState: 'quarantined',
    });
  });

  it('requires a decision sink before apply performs any DB work', async () => {
    await insertLegacyEvent(ORG_A1, 'security_event');

    await expect(
      runAuditOwnershipBackfill(testDb.db, {
        mode: 'apply',
      }),
    ).rejects.toThrow('apply mode requires an onDecision sink');

    const [row] = await testDb.db.select().from(auditEventsTable);
    expect(row).toMatchObject({
      organizationId: null,
      ownershipState: 'unresolved_legacy',
    });
  });
});
