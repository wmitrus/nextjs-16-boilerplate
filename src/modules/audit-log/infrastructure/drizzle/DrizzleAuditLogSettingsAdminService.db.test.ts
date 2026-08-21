/** @vitest-environment node */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  AuditSettingNotFoundError,
  AuditSettingScopeError,
  InvalidAuditRetentionDaysError,
  InvalidAuditSampleRateError,
} from '../../domain/errors';

import { DrizzleAuditLogSettingsAdminService } from './DrizzleAuditLogSettingsAdminService';
import { auditLogSettingsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleAuditLogSettingsAdminService;

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleAuditLogSettingsAdminService(testDb.db);
});

afterEach(async () => {
  await testDb.db.delete(auditLogSettingsTable);
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAuditLogSettingsAdminService (real DB)', () => {
  describe('listGlobalEffective', () => {
    it('returns one row per taxonomy category, using taxonomy defaults when no row exists', async () => {
      const settings = await svc.listGlobalEffective();

      expect(settings).toHaveLength(10);
      expect(settings.every((s) => s.source === 'taxonomy-default')).toBe(true);
      const waitlist = settings.find((s) => s.category === 'waitlist');
      expect(waitlist).toMatchObject({ enabled: false, retentionDays: 30 });
    });

    it('overlays a stored global row on top of the taxonomy default', async () => {
      await svc.upsert(
        {
          category: 'waitlist',
          tenantId: null,
          enabled: true,
          retentionDays: 45,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
      );

      const settings = await svc.listGlobalEffective();
      const waitlist = settings.find((s) => s.category === 'waitlist');
      expect(waitlist).toMatchObject({
        source: 'global',
        enabled: true,
        retentionDays: 45,
      });
      expect(waitlist?.id).toEqual(expect.any(String));
    });
  });

  describe('listEffectiveForTenant', () => {
    it('prefers a tenant override over the global row, which is preferred over the taxonomy default', async () => {
      await svc.upsert(
        {
          category: 'auth',
          tenantId: null,
          enabled: false,
          retentionDays: 200,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
      );
      await svc.upsert(
        {
          category: 'auth',
          tenantId: 'acme',
          enabled: true,
          retentionDays: 10,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        { tenantId: 'acme' },
      );

      const acmeView = await svc.listEffectiveForTenant('acme');
      const auth = acmeView.find((s) => s.category === 'auth');
      expect(auth).toMatchObject({
        source: 'tenant-override',
        enabled: true,
        retentionDays: 10,
        captureInputOnSuccess: true,
      });

      // A different tenant with no override of its own falls back to the
      // global row, never to acme's override (SEC-26).
      const globexView = await svc.listEffectiveForTenant('globex');
      const globexAuth = globexView.find((s) => s.category === 'auth');
      expect(globexAuth).toMatchObject({
        source: 'global',
        enabled: false,
        retentionDays: 200,
      });
    });
  });

  describe('upsert', () => {
    it('creates a global row on first call and updates it in place on the second', async () => {
      const created = await svc.upsert(
        {
          category: 'billing',
          tenantId: null,
          enabled: true,
          retentionDays: 100,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
      );
      expect(created.retentionDays).toBe(100);

      const updated = await svc.upsert(
        {
          category: 'billing',
          tenantId: null,
          enabled: false,
          retentionDays: 200,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
      );
      expect(updated.id).toBe(created.id);
      expect(updated).toMatchObject({ enabled: false, retentionDays: 200 });

      const all = await svc.listGlobalEffective();
      expect(
        all.filter((s) => s.category === 'billing' && s.source === 'global'),
      ).toHaveLength(1);
    });

    it('rejects retentionDays outside the allowed range', async () => {
      await expect(
        svc.upsert(
          {
            category: 'billing',
            tenantId: null,
            enabled: true,
            retentionDays: 1,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          null,
        ),
      ).rejects.toThrow(InvalidAuditRetentionDaysError);

      await expect(
        svc.upsert(
          {
            category: 'billing',
            tenantId: null,
            enabled: true,
            retentionDays: 10_000,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          null,
        ),
      ).rejects.toThrow(InvalidAuditRetentionDaysError);
    });

    it('rejects a sampleRate outside [0, 1]', async () => {
      await expect(
        svc.upsert(
          {
            category: 'server_action',
            tenantId: null,
            enabled: true,
            retentionDays: 30,
            sampleRate: 1.5,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          null,
        ),
      ).rejects.toThrow(InvalidAuditSampleRateError);
    });
  });

  describe('resetToDefault', () => {
    it('deletes the override row, reverting the effective value to the default', async () => {
      await svc.upsert(
        {
          category: 'feature_flag',
          tenantId: null,
          enabled: false,
          retentionDays: 15,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
      );

      await svc.resetToDefault('feature_flag', null, null);

      const settings = await svc.listGlobalEffective();
      const ff = settings.find((s) => s.category === 'feature_flag');
      expect(ff).toMatchObject({ source: 'taxonomy-default', enabled: true });
    });

    it('throws AuditSettingNotFoundError when there is no override row to delete', async () => {
      await expect(
        svc.resetToDefault('feature_flag', null, null),
      ).rejects.toThrow(AuditSettingNotFoundError);
    });
  });

  describe('tenant scoping (SEC-26 regression coverage)', () => {
    it('upsert rejects a scoped caller targeting a foreign tenantId', async () => {
      await expect(
        svc.upsert(
          {
            category: 'auth',
            tenantId: 'globex',
            enabled: true,
            retentionDays: 30,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          { tenantId: 'acme' },
        ),
      ).rejects.toThrow(AuditSettingScopeError);
    });

    it('upsert rejects a scoped caller targeting the global (null) row', async () => {
      await expect(
        svc.upsert(
          {
            category: 'auth',
            tenantId: null,
            enabled: true,
            retentionDays: 30,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          { tenantId: 'acme' },
        ),
      ).rejects.toThrow(AuditSettingScopeError);
    });

    it('upsert allows a scoped caller targeting their own tenantId', async () => {
      const result = await svc.upsert(
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
      expect(result.tenantId).toBe('acme');
    });

    it('resetToDefault rejects a scoped caller targeting a foreign tenantId', async () => {
      await svc.upsert(
        {
          category: 'auth',
          tenantId: 'globex',
          enabled: true,
          retentionDays: 30,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        { tenantId: 'globex' },
      );

      await expect(
        svc.resetToDefault('auth', 'globex', { tenantId: 'acme' }),
      ).rejects.toThrow(AuditSettingScopeError);

      // The row must still exist -- the rejected delete must not have run.
      const globexView = await svc.listEffectiveForTenant('globex');
      expect(globexView.find((s) => s.category === 'auth')?.source).toBe(
        'tenant-override',
      );
    });
  });
});
