/** @vitest-environment node */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AuditEventInput } from '@/core/contracts/audit-log';

import { DrizzleAuditLogService } from './DrizzleAuditLogService';
import { DrizzleAuditLogSettingsAdminService } from './DrizzleAuditLogSettingsAdminService';
import { auditEventsTable, auditLogSettingsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleAuditLogService;
let settingsSvc: DrizzleAuditLogSettingsAdminService;

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleAuditLogService(testDb.db);
  settingsSvc = new DrizzleAuditLogSettingsAdminService(testDb.db);
});

afterEach(async () => {
  await testDb.db.delete(auditEventsTable);
  await testDb.db.delete(auditLogSettingsTable);
});

afterAll(async () => {
  await testDb.cleanup();
});

function makeEvent(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    category: 'auth',
    action: 'auth.signin_success',
    outcome: 'success',
    tenantId: 'acme',
    actorUserId: null,
    ip: '1.2.3.4',
    correlationId: 'corr-1',
    requestId: 'req-1',
    ...overrides,
  };
}

describe('DrizzleAuditLogService (real DB)', () => {
  it('inserts a row for an enabled category (taxonomy default)', async () => {
    // 'auth' defaults to enabled -- no settings row needed.
    await svc.record(makeEvent());

    const rows = await testDb.db.select().from(auditEventsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'auth',
      action: 'auth.signin_success',
      outcome: 'success',
      tenantId: 'acme',
      ip: '1.2.3.4',
    });
  });

  it('drops the event without inserting when the category is disabled', async () => {
    // 'waitlist' defaults to disabled -- no settings row needed.
    await svc.record(
      makeEvent({ category: 'waitlist', action: 'waitlist.approve' }),
    );

    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('honors an admin-configured disabled override even for a normally-enabled category', async () => {
    await settingsSvc.upsert(
      {
        category: 'auth',
        tenantId: null,
        enabled: false,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      null,
    );

    await svc.record(makeEvent());

    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('prefers a tenant override over the global row', async () => {
    await settingsSvc.upsert(
      {
        category: 'auth',
        tenantId: null,
        enabled: false,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      null,
    );
    await settingsSvc.upsert(
      {
        category: 'auth',
        tenantId: 'acme',
        enabled: true,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      { tenantId: 'acme' },
    );

    // acme has its own (enabled) override -- persists despite the disabled global row.
    await svc.record(makeEvent({ tenantId: 'acme' }));
    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(1);

    await testDb.db.delete(auditEventsTable);

    // globex has no override -- falls back to the disabled global row.
    await svc.record(makeEvent({ tenantId: 'globex' }));
    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  describe('metadata capture rules', () => {
    it('always captures metadata on failure, regardless of captureInputOnSuccess', async () => {
      await svc.record(
        makeEvent({
          outcome: 'failure',
          metadata: { field: 'value' },
        }),
      );

      const [row] = await testDb.db.select().from(auditEventsTable);
      expect(row?.metadata).toEqual({ field: 'value' });
    });

    it('omits metadata on success by default (captureInputOnSuccess: false)', async () => {
      await svc.record(
        makeEvent({ outcome: 'success', metadata: { field: 'value' } }),
      );

      const [row] = await testDb.db.select().from(auditEventsTable);
      expect(row?.metadata).toBeNull();
    });

    it('captures metadata on success when captureInputOnSuccess is enabled', async () => {
      await settingsSvc.upsert(
        {
          category: 'auth',
          tenantId: null,
          enabled: true,
          retentionDays: 30,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        null,
      );

      await svc.record(
        makeEvent({ outcome: 'success', metadata: { field: 'value' } }),
      );

      const [row] = await testDb.db.select().from(auditEventsTable);
      expect(row?.metadata).toEqual({ field: 'value' });
    });

    it('truncates metadata that exceeds the size cap instead of storing it raw', async () => {
      const bigString = 'x'.repeat(20_000);

      await svc.record(
        makeEvent({ outcome: 'failure', metadata: { big: bigString } }),
      );

      const [row] = await testDb.db.select().from(auditEventsTable);
      expect(row?.metadata).toMatchObject({ truncated: true });
      expect(
        (row?.metadata as { originalSizeBytes: number }).originalSizeBytes,
      ).toBeGreaterThan(8192);
    });

    it('measures the size cap in UTF-8 bytes, not UTF-16 code units', async () => {
      // Each CJK character below is 1 UTF-16 code unit but 3 UTF-8 bytes --
      // 3,000 of them is 3,000 code units (under the 8,192 cap by `.length`)
      // but 9,000 bytes (over the cap by actual encoded size). A byte-count
      // regression would store this raw instead of truncating it.
      const wideString = '漢'.repeat(3000);

      await svc.record(
        makeEvent({ outcome: 'failure', metadata: { wide: wideString } }),
      );

      const [row] = await testDb.db.select().from(auditEventsTable);
      expect(row?.metadata).toMatchObject({ truncated: true });
      expect(
        (row?.metadata as { originalSizeBytes: number }).originalSizeBytes,
      ).toBeGreaterThan(8192);
    });
  });

  describe('sampling', () => {
    it('never drops a failure event, even at sampleRate 0', async () => {
      await settingsSvc.upsert(
        {
          category: 'server_action',
          tenantId: null,
          enabled: true,
          retentionDays: 30,
          sampleRate: 0,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
      );

      await svc.record(
        makeEvent({ category: 'server_action', outcome: 'failure' }),
      );

      expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(1);
    });

    it('drops success events at sampleRate 0', async () => {
      await settingsSvc.upsert(
        {
          category: 'server_action',
          tenantId: null,
          enabled: true,
          retentionDays: 30,
          sampleRate: 0,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
      );

      await svc.record(
        makeEvent({ category: 'server_action', outcome: 'success' }),
      );

      expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
    });
  });

  it('drops an unrecognized category without throwing or inserting', async () => {
    await expect(
      svc.record(makeEvent({ category: 'not-a-real-category' })),
    ).resolves.toBeUndefined();

    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('truncates a long userAgent to 512 characters', async () => {
    await svc.record(makeEvent({ userAgent: 'a'.repeat(1000) }));

    const [row] = await testDb.db.select().from(auditEventsTable);
    expect(row?.userAgent).toHaveLength(512);
  });
});
