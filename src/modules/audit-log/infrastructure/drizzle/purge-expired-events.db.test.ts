/** @vitest-environment node */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAuditLogSettingsAdminService } from './DrizzleAuditLogSettingsAdminService';
import {
  listPresentCategoryTenantPairs,
  purgeExpiredAuditEvents,
} from './purge-expired-events';
import { auditEventsTable, auditLogSettingsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let settingsSvc: DrizzleAuditLogSettingsAdminService;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  testDb = await resolveTestDb();
  settingsSvc = new DrizzleAuditLogSettingsAdminService(testDb.db);
});

afterEach(async () => {
  await testDb.db.delete(auditEventsTable);
  await testDb.db.delete(auditLogSettingsTable);
});

afterAll(async () => {
  await testDb.cleanup();
});

async function insertEvent(overrides: {
  category?: string;
  tenantId?: string | null;
  occurredAt: Date;
}) {
  await testDb.db.insert(auditEventsTable).values({
    category: (overrides.category ?? 'auth') as 'auth',
    action: 'auth.signin_success',
    outcome: 'success',
    tenantId: overrides.tenantId === undefined ? 'acme' : overrides.tenantId,
    occurredAt: overrides.occurredAt,
  });
}

describe('listPresentCategoryTenantPairs', () => {
  it('returns distinct (category, tenantId) pairs present in the table', async () => {
    await insertEvent({
      category: 'auth',
      tenantId: 'acme',
      occurredAt: new Date(),
    });
    await insertEvent({
      category: 'auth',
      tenantId: 'acme',
      occurredAt: new Date(),
    });
    await insertEvent({
      category: 'auth',
      tenantId: 'globex',
      occurredAt: new Date(),
    });
    await insertEvent({
      category: 'billing',
      tenantId: null,
      occurredAt: new Date(),
    });

    const pairs = await listPresentCategoryTenantPairs(testDb.db);

    expect(pairs).toHaveLength(3);
    expect(pairs).toContainEqual({ category: 'auth', tenantId: 'acme' });
    expect(pairs).toContainEqual({ category: 'auth', tenantId: 'globex' });
    expect(pairs).toContainEqual({ category: 'billing', tenantId: null });
  });

  it('returns an empty array when the table is empty', async () => {
    expect(await listPresentCategoryTenantPairs(testDb.db)).toEqual([]);
  });
});

describe('purgeExpiredAuditEvents', () => {
  it('deletes rows older than the taxonomy default retention and keeps newer rows', async () => {
    // 'server_action' defaults to 30 days retention.
    const now = new Date('2026-06-01T00:00:00Z');
    await insertEvent({
      category: 'server_action',
      tenantId: 'acme',
      occurredAt: new Date(now.getTime() - 31 * DAY_MS),
    });
    await insertEvent({
      category: 'server_action',
      tenantId: 'acme',
      occurredAt: new Date(now.getTime() - 10 * DAY_MS),
    });

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    expect(results).toEqual([
      {
        pair: { category: 'server_action', tenantId: 'acme' },
        retentionDays: 30,
        deleted: 1,
      },
    ]);

    const remaining = await testDb.db.select().from(auditEventsTable);
    expect(remaining).toHaveLength(1);
  });

  it('honors an admin-configured retention override, not just the taxonomy default', async () => {
    await settingsSvc.upsert(
      {
        category: 'auth',
        tenantId: null,
        enabled: true,
        retentionDays: 7,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      null,
    );

    const now = new Date('2026-06-01T00:00:00Z');
    await insertEvent({
      category: 'auth',
      tenantId: 'acme',
      occurredAt: new Date(now.getTime() - 8 * DAY_MS),
    });

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    expect(results).toEqual([
      {
        pair: { category: 'auth', tenantId: 'acme' },
        retentionDays: 7,
        deleted: 1,
      },
    ]);
    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('does not delete anything in dry-run mode but still reports what would be deleted', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    await insertEvent({
      category: 'server_action',
      tenantId: 'acme',
      occurredAt: new Date(now.getTime() - 31 * DAY_MS),
    });

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: true,
      now,
    });

    expect(results[0]?.deleted).toBe(1);
    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(1);
  });

  it('purges in batches, looping until nothing older than the cutoff remains', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    for (let i = 0; i < 5; i += 1) {
      await insertEvent({
        category: 'server_action',
        tenantId: 'acme',
        occurredAt: new Date(now.getTime() - 31 * DAY_MS - i * 1000),
      });
    }

    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
      batchSize: 2,
    });

    expect(results[0]?.deleted).toBe(5);
    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('keeps a null-tenant (platform-level) pair scoped correctly from a real-tenant pair', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    await insertEvent({
      category: 'billing',
      tenantId: null,
      occurredAt: new Date(now.getTime() - 400 * DAY_MS),
    });
    await insertEvent({
      category: 'billing',
      tenantId: 'acme',
      occurredAt: new Date(now.getTime() - 400 * DAY_MS),
    });

    // 'billing' defaults to 365 days retention -- both rows are expired.
    const results = await purgeExpiredAuditEvents(testDb.db, {
      dryRun: false,
      now,
    });

    expect(results).toHaveLength(2);
    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('returns an empty result set when there are no rows to consider', async () => {
    expect(await purgeExpiredAuditEvents(testDb.db)).toEqual([]);
  });
});
