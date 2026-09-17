/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AuditWriteScope } from '@/core/contracts/audit-log';

import {
  AuditCanonicalWriteInvariantError,
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

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';

const GLOBAL_WRITE_SCOPE: AuditWriteScope = { kind: 'platform-global' };

const organizationScope = (
  organizationId: string,
  tenantId: string,
): AuditWriteScope =>
  ({
    kind: 'organization',
    organizationId,
    tenantId,
  }) as AuditWriteScope;

const ACME_WRITE_SCOPE = organizationScope(ORG_A1, TENANT_A);
const GLOBEX_WRITE_SCOPE = organizationScope(ORG_B1, TENANT_B);

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleAuditLogSettingsAdminService(testDb.db);

  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES
        (${TENANT_A}, 'Audit Settings Tenant A'),
        (${TENANT_B}, 'Audit Settings Tenant B')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_A1}, ${TENANT_A}, 'Audit Settings Org A1'),
        (${ORG_B1}, ${TENANT_B}, 'Audit Settings Org B1')`,
  );
});

afterEach(async () => {
  await testDb.db.delete(auditLogSettingsTable);
});

afterAll(async () => {
  await testDb.db.execute(
    sql`DELETE FROM organizations WHERE id IN (${ORG_A1}, ${ORG_B1})`,
  );
  await testDb.db.execute(
    sql`DELETE FROM tenants WHERE id IN (${TENANT_A}, ${TENANT_B})`,
  );
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
        GLOBAL_WRITE_SCOPE,
      );

      const settings = await svc.listGlobalEffective();
      const waitlist = settings.find((s) => s.category === 'waitlist');
      expect(waitlist).toMatchObject({
        source: 'global',
        enabled: true,
        retentionDays: 45,
      });
      expect(waitlist?.id).toEqual(expect.any(String));

      const [stored] = await testDb.db.select().from(auditLogSettingsTable);
      expect(stored).toMatchObject({
        organizationId: null,
        ownershipState: 'intentional_global',
      });
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
        GLOBAL_WRITE_SCOPE,
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
        ACME_WRITE_SCOPE,
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
        GLOBAL_WRITE_SCOPE,
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
        GLOBAL_WRITE_SCOPE,
      );
      expect(updated.id).toBe(created.id);
      expect(updated).toMatchObject({ enabled: false, retentionDays: 200 });

      const all = await svc.listGlobalEffective();
      expect(
        all.filter((s) => s.category === 'billing' && s.source === 'global'),
      ).toHaveLength(1);
    });

    it('reconciles alternate legacy aliases that resolve to the same canonical organization', async () => {
      const providerAlias = 'org_provider_acme';

      const created = await svc.upsert(
        {
          category: 'security_event',
          tenantId: providerAlias,
          enabled: true,
          retentionDays: 30,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        null,
        ACME_WRITE_SCOPE,
      );

      const updated = await svc.upsert(
        {
          category: 'security_event',
          tenantId: ORG_A1,
          enabled: false,
          retentionDays: 90,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        null,
        ACME_WRITE_SCOPE,
      );

      expect(updated.id).toBe(created.id);
      expect(updated).toMatchObject({
        tenantId: providerAlias,
        enabled: false,
        retentionDays: 90,
        captureInputOnSuccess: true,
      });

      const rows = await testDb.db.select().from(auditLogSettingsTable);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: created.id,
        category: 'security_event',
        tenantId: providerAlias,
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
        enabled: false,
        retentionDays: 90,
        captureInputOnSuccess: true,
      });
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
          GLOBAL_WRITE_SCOPE,
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
          GLOBAL_WRITE_SCOPE,
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
          GLOBAL_WRITE_SCOPE,
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
        GLOBAL_WRITE_SCOPE,
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
          ACME_WRITE_SCOPE,
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
          ACME_WRITE_SCOPE,
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
        ACME_WRITE_SCOPE,
      );
      expect(result.tenantId).toBe('acme');

      const [stored] = await testDb.db.select().from(auditLogSettingsTable);
      expect(stored).toMatchObject({
        tenantId: 'acme',
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
      });
    });

    it('upsert fails closed when the canonical organization/tenant tuple is inconsistent', async () => {
      await expect(
        svc.upsert(
          {
            category: 'auth',
            tenantId: 'acme',
            enabled: true,
            retentionDays: 30,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          { tenantId: 'acme' },
          organizationScope(ORG_A1, TENANT_B),
        ),
      ).rejects.toThrow(AuditCanonicalWriteInvariantError);

      expect(await testDb.db.select().from(auditLogSettingsTable)).toHaveLength(
        0,
      );
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
        GLOBEX_WRITE_SCOPE,
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
