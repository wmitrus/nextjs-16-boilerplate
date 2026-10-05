/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AuditWriteScope } from '@/core/contracts/audit-log';
import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';

import type { AuditCategory } from '../../domain/category';

import { DrizzleAuditLogSettingsAdminService } from './DrizzleAuditLogSettingsAdminService';
import {
  listPresentAuditRetentionKeys,
  purgeExpiredAuditEvents,
  purgeExpiredAuditRetentionKeys,
} from './purge-expired-events';
import {
  auditEventsTable,
  auditLogSettingsTable,
  type AuditEventsOwnershipState,
  type AuditLogSettingsOwnershipState,
} from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let settingsSvc: DrizzleAuditLogSettingsAdminService;

const DAY_MS = 24 * 60 * 60 * 1000;

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_B = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';

const GLOBAL_SCOPE: AuditWriteScope = {
  kind: 'platform-global',
};

const organizationScope = (
  organizationId: string,
  tenantId: string,
): AuditWriteScope => ({
  kind: 'organization',
  organizationId: internalOrganizationIdFromOrgRow(organizationId),
  tenantId: parentTenantIdFromOrgRow(tenantId),
});

const ORG_A_SCOPE = organizationScope(ORG_A, TENANT_A);

beforeAll(async () => {
  testDb = await resolveTestDb();
  settingsSvc = new DrizzleAuditLogSettingsAdminService(testDb.db);

  await testDb.db.execute(sql`
    INSERT INTO tenants (id, name)
    VALUES
      (${TENANT_A}, 'Audit Purge Tenant A'),
      (${TENANT_B}, 'Audit Purge Tenant B')
  `);

  await testDb.db.execute(sql`
    INSERT INTO organizations (id, tenant_id, name)
    VALUES
      (${ORG_A}, ${TENANT_A}, 'Audit Purge Org A'),
      (${ORG_B}, ${TENANT_B}, 'Audit Purge Org B')
  `);
});

afterEach(async () => {
  await testDb.db.delete(auditEventsTable);
  await testDb.db.delete(auditLogSettingsTable);
});

afterAll(async () => {
  await testDb.db.execute(sql`
    DELETE FROM organizations
    WHERE id IN (${ORG_A}, ${ORG_B})
  `);

  await testDb.db.execute(sql`
    DELETE FROM tenants
    WHERE id IN (${TENANT_A}, ${TENANT_B})
  `);

  await testDb.cleanup();
});

async function insertEvent(overrides: {
  category?: AuditCategory;
  tenantId?: string | null;
  organizationId?: string | null;
  ownershipState: AuditEventsOwnershipState;
  occurredAt: Date;
}): Promise<void> {
  await testDb.db.insert(auditEventsTable).values({
    category: overrides.category ?? 'auth',
    action: 'audit.test',
    outcome: 'success',
    tenantId: overrides.tenantId ?? null,
    organizationId: overrides.organizationId ?? null,
    ownershipState: overrides.ownershipState,
    occurredAt: overrides.occurredAt,
  });
}

async function insertLegacySetting(input: {
  category: AuditCategory;
  tenantId: string | null;
  ownershipState: Extract<
    AuditLogSettingsOwnershipState,
    'unresolved_legacy' | 'quarantined'
  >;
  retentionDays: number;
}): Promise<void> {
  await testDb.db.insert(auditLogSettingsTable).values({
    category: input.category,
    tenantId: input.tenantId,
    organizationId: null,
    ownershipState: input.ownershipState,
    enabled: true,
    retentionDays: input.retentionDays,
    sampleRate: null,
    captureInputOnSuccess: false,
    updatedByUserId: null,
  });
}

describe('listPresentAuditRetentionKeys', () => {
  it('does not collapse different ownership states or legacy keys', async () => {
    const occurredAt = new Date('2026-06-01T00:00:00Z');

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      organizationId: ORG_A,
      ownershipState: 'canonical_organization',
      occurredAt,
    });

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      organizationId: null,
      ownershipState: 'canonical_organization',
      occurredAt,
    });

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      ownershipState: 'organization_owned_orphaned',
      occurredAt,
    });

    await insertEvent({
      category: 'auth',
      ownershipState: 'intentional_global',
      occurredAt,
    });

    await insertEvent({
      category: 'auth',
      tenantId: 'legacy-a',
      ownershipState: 'unresolved_legacy',
      occurredAt,
    });

    await insertEvent({
      category: 'auth',
      tenantId: 'legacy-b',
      ownershipState: 'unresolved_legacy',
      occurredAt,
    });

    await insertEvent({
      category: 'auth',
      tenantId: 'legacy-a',
      ownershipState: 'quarantined',
      occurredAt,
    });

    const keys = await listPresentAuditRetentionKeys(testDb.db);

    expect(keys).toHaveLength(7);

    expect(keys).toEqual(
      expect.arrayContaining([
        {
          kind: 'canonical-organization',
          category: 'auth',
          organizationId: ORG_A,
          ownershipState: 'canonical_organization',
        },
        {
          kind: 'null-owned',
          category: 'auth',
          ownershipState: 'canonical_organization',
        },
        {
          kind: 'null-owned',
          category: 'auth',
          ownershipState: 'organization_owned_orphaned',
        },
        {
          kind: 'null-owned',
          category: 'auth',
          ownershipState: 'intentional_global',
        },
        {
          kind: 'legacy',
          category: 'auth',
          legacyTenantId: 'legacy-a',
          ownershipState: 'unresolved_legacy',
        },
        {
          kind: 'legacy',
          category: 'auth',
          legacyTenantId: 'legacy-b',
          ownershipState: 'unresolved_legacy',
        },
        {
          kind: 'legacy',
          category: 'auth',
          legacyTenantId: 'legacy-a',
          ownershipState: 'quarantined',
        },
      ]),
    );
  });

  it('deduplicates irrelevant shadow tenant ids for canonical NULL-owned rows', async () => {
    const occurredAt = new Date('2026-06-01T00:00:00Z');

    await insertEvent({
      category: 'billing',
      tenantId: 'shadow-a',
      ownershipState: 'canonical_organization',
      occurredAt,
    });

    await insertEvent({
      category: 'billing',
      tenantId: 'shadow-b',
      ownershipState: 'canonical_organization',
      occurredAt,
    });

    await expect(listPresentAuditRetentionKeys(testDb.db)).resolves.toEqual([
      {
        kind: 'null-owned',
        category: 'billing',
        ownershipState: 'canonical_organization',
      },
    ]);
  });

  it('returns no keys for an empty table', async () => {
    await expect(listPresentAuditRetentionKeys(testDb.db)).resolves.toEqual([]);
  });
});

describe('purgeExpiredAuditEvents', () => {
  it('uses canonical organization retention and isolates organizations', async () => {
    await settingsSvc.upsertCanonical(
      {
        category: 'auth',
        enabled: true,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      GLOBAL_SCOPE,
    );

    await settingsSvc.upsertCanonical(
      {
        category: 'auth',
        enabled: true,
        retentionDays: 7,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      ORG_A_SCOPE,
    );

    const now = new Date('2026-06-01T00:00:00Z');

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      organizationId: ORG_A,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    await insertEvent({
      category: 'auth',
      tenantId: ORG_B,
      organizationId: ORG_B,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        {
          key: {
            kind: 'canonical-organization',
            category: 'auth',
            organizationId: ORG_A,
            ownershipState: 'canonical_organization',
          },
          retentionDays: 7,
          deleted: 1,
        },
        {
          key: {
            kind: 'canonical-organization',
            category: 'auth',
            organizationId: ORG_B,
            ownershipState: 'canonical_organization',
          },
          retentionDays: 30,
          deleted: 0,
        },
      ]),
    );

    const remaining = await testDb.db.select().from(auditEventsTable);

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.organizationId).toBe(ORG_B);
  });

  it('skips a stale canonical organization key after concurrent organization deletion', async () => {
    const now = new Date('2026-06-01T00:00:00Z');

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      organizationId: ORG_A,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 31 * DAY_MS),
    });

    const keys = await listPresentAuditRetentionKeys(testDb.db);

    const staleKey = keys.find(
      (key) =>
        key.kind === 'canonical-organization' &&
        key.category === 'auth' &&
        key.organizationId === ORG_A,
    );

    expect(staleKey).toBeDefined();

    await testDb.db.execute(sql`
      DELETE FROM organizations
      WHERE id = ${ORG_A}
    `);

    const [reconciled] = await testDb.db
      .select({
        organizationId: auditEventsTable.organizationId,
        ownershipState: auditEventsTable.ownershipState,
      })
      .from(auditEventsTable);

    expect(reconciled?.organizationId).toBeNull();

    const results = await purgeExpiredAuditRetentionKeys(
      testDb.db,
      [staleKey!],
      {
        dryRun: false,
        now,
      },
    );

    expect(results).toEqual([]);

    const remaining = await testDb.db.select().from(auditEventsTable);

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.organizationId).toBeNull();

    await testDb.db.execute(sql`
      INSERT INTO organizations (id, tenant_id, name)
      VALUES (${ORG_A}, ${TENANT_A}, 'Audit Purge Org A')
    `);
  });

  it('uses global retention for NULL canonical, orphaned, and intentional-global groups', async () => {
    await settingsSvc.upsertCanonical(
      {
        category: 'billing',
        enabled: true,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      GLOBAL_SCOPE,
    );

    await settingsSvc.upsertCanonical(
      {
        category: 'billing',
        enabled: true,
        retentionDays: 7,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      ORG_A_SCOPE,
    );

    const now = new Date('2026-06-01T00:00:00Z');

    await insertEvent({
      category: 'billing',
      tenantId: ORG_A,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    await insertEvent({
      category: 'billing',
      tenantId: ORG_A,
      ownershipState: 'organization_owned_orphaned',
      occurredAt: new Date(now.getTime() - 31 * DAY_MS),
    });

    await insertEvent({
      category: 'billing',
      ownershipState: 'intentional_global',
      occurredAt: new Date(now.getTime() - 31 * DAY_MS),
    });

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        {
          key: {
            kind: 'null-owned',
            category: 'billing',
            ownershipState: 'canonical_organization',
          },
          retentionDays: 30,
          deleted: 0,
        },
        {
          key: {
            kind: 'null-owned',
            category: 'billing',
            ownershipState: 'organization_owned_orphaned',
          },
          retentionDays: 30,
          deleted: 1,
        },
        {
          key: {
            kind: 'null-owned',
            category: 'billing',
            ownershipState: 'intentional_global',
          },
          retentionDays: 30,
          deleted: 1,
        },
      ]),
    );

    const remaining = await testDb.db.select().from(auditEventsTable);

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.ownershipState).toBe('canonical_organization');
  });

  it('keeps legacy tenant keys and ownership states isolated', async () => {
    await insertLegacySetting({
      category: 'security_event',
      tenantId: 'legacy-a',
      ownershipState: 'quarantined',
      retentionDays: 7,
    });

    await insertLegacySetting({
      category: 'security_event',
      tenantId: 'legacy-b',
      ownershipState: 'unresolved_legacy',
      retentionDays: 30,
    });

    const now = new Date('2026-06-01T00:00:00Z');

    await insertEvent({
      category: 'security_event',
      tenantId: 'legacy-a',
      ownershipState: 'unresolved_legacy',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    await insertEvent({
      category: 'security_event',
      tenantId: 'legacy-b',
      ownershipState: 'unresolved_legacy',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    await insertEvent({
      category: 'security_event',
      tenantId: 'legacy-a',
      ownershipState: 'quarantined',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    expect(results).toEqual(
      expect.arrayContaining([
        {
          key: {
            kind: 'legacy',
            category: 'security_event',
            legacyTenantId: 'legacy-a',
            ownershipState: 'unresolved_legacy',
          },
          retentionDays: 7,
          deleted: 1,
        },
        {
          key: {
            kind: 'legacy',
            category: 'security_event',
            legacyTenantId: 'legacy-b',
            ownershipState: 'unresolved_legacy',
          },
          retentionDays: 30,
          deleted: 0,
        },
        {
          key: {
            kind: 'legacy',
            category: 'security_event',
            legacyTenantId: 'legacy-a',
            ownershipState: 'quarantined',
          },
          retentionDays: 7,
          deleted: 1,
        },
      ]),
    );

    const remaining = await testDb.db.select().from(auditEventsTable);

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.tenantId).toBe('legacy-b');
    expect(remaining[0]?.ownershipState).toBe('unresolved_legacy');
  });

  it('handles NULL legacy tenant keys with IS NOT DISTINCT FROM semantics', async () => {
    await settingsSvc.upsertCanonical(
      {
        category: 'admin_access',
        enabled: true,
        retentionDays: 7,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      GLOBAL_SCOPE,
    );

    const now = new Date('2026-06-01T00:00:00Z');

    await insertEvent({
      category: 'admin_access',
      tenantId: null,
      ownershipState: 'unresolved_legacy',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    await insertEvent({
      category: 'admin_access',
      tenantId: 'legacy-missing',
      ownershipState: 'unresolved_legacy',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.deleted === 1)).toBe(true);

    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('dry-run counts every expired row without deleting', async () => {
    const now = new Date('2026-06-01T00:00:00Z');

    for (let i = 0; i < 5; i += 1) {
      await insertEvent({
        category: 'server_action',
        ownershipState: 'intentional_global',
        occurredAt: new Date(now.getTime() - 31 * DAY_MS - i * 1000),
      });
    }

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: true,
      now,
      batchSize: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.deleted).toBe(5);

    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(5);
  });

  it('keeps dry-run count in parity with real delete for the same canonical key', async () => {
    const now = new Date('2026-06-01T00:00:00Z');

    await settingsSvc.upsertCanonical(
      {
        category: 'auth',
        enabled: true,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      GLOBAL_SCOPE,
    );

    await settingsSvc.upsertCanonical(
      {
        category: 'auth',
        enabled: true,
        retentionDays: 7,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      ORG_A_SCOPE,
    );

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      organizationId: ORG_A,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      organizationId: ORG_A,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 9 * DAY_MS),
    });

    await insertEvent({
      category: 'auth',
      tenantId: ORG_A,
      organizationId: ORG_A,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 6 * DAY_MS),
    });

    await insertEvent({
      category: 'auth',
      tenantId: ORG_B,
      organizationId: ORG_B,
      ownershipState: 'canonical_organization',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    const dryRunResults = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: true,
      now,
    });

    const dryRunTarget = dryRunResults.find(
      (result) =>
        result.key.kind === 'canonical-organization' &&
        result.key.category === 'auth' &&
        result.key.organizationId === ORG_A,
    );

    expect(dryRunTarget).toBeDefined();
    expect(dryRunTarget?.deleted).toBe(2);

    const rowsAfterDryRun = await testDb.db.select().from(auditEventsTable);
    expect(rowsAfterDryRun).toHaveLength(4);

    const deleteResults = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    const deleteTarget = deleteResults.find(
      (result) =>
        result.key.kind === 'canonical-organization' &&
        result.key.category === 'auth' &&
        result.key.organizationId === ORG_A,
    );

    expect(deleteTarget).toBeDefined();
    expect(deleteTarget?.deleted).toBe(dryRunTarget?.deleted);

    const remaining = await testDb.db
      .select({
        organizationId: auditEventsTable.organizationId,
        occurredAt: auditEventsTable.occurredAt,
      })
      .from(auditEventsTable);

    expect(remaining).toHaveLength(2);
    expect(remaining).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationId: ORG_A,
          occurredAt: new Date(now.getTime() - 6 * DAY_MS),
        }),
        expect.objectContaining({
          organizationId: ORG_B,
          occurredAt: new Date(now.getTime() - 8 * DAY_MS),
        }),
      ]),
    );
  });

  it('purges in batches until the exact group is empty', async () => {
    const now = new Date('2026-06-01T00:00:00Z');

    for (let i = 0; i < 5; i += 1) {
      await insertEvent({
        category: 'server_action',
        ownershipState: 'intentional_global',
        occurredAt: new Date(now.getTime() - 31 * DAY_MS - i * 1000),
      });
    }

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
      batchSize: 2,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.deleted).toBe(5);

    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('returns an empty result when there are no events', async () => {
    await expect(purgeExpiredAuditEvents(testDb.db)).resolves.toEqual([]);
  });
});
