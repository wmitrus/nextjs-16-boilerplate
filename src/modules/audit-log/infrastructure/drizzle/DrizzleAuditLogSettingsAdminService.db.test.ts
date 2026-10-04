/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AuditWriteScope } from '@/core/contracts/audit-log';

import {
  AuditCanonicalWriteInvariantError,
  AuditSettingAliasConflictError,
  AuditSettingNotFoundError,
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
  describe('AUD·D canonical list', () => {
    it('organization scope resolves own override over intentional-global', async () => {
      await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: false,
          retentionDays: 200,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        GLOBAL_WRITE_SCOPE,
      );

      await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: true,
          retentionDays: 10,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        ACME_WRITE_SCOPE,
      );

      const settings = await svc.list(ACME_WRITE_SCOPE);
      const auth = settings.find((setting) => setting.category === 'auth');

      expect(auth).toMatchObject({
        source: 'tenant-override',
        enabled: true,
        retentionDays: 10,
        captureInputOnSuccess: true,
      });
    });

    it('valid organization scope falls back to intentional-global then taxonomy', async () => {
      await svc.upsertCanonical(
        {
          category: 'billing',
          enabled: false,
          retentionDays: 123,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        GLOBAL_WRITE_SCOPE,
      );

      const settings = await svc.list(ACME_WRITE_SCOPE);

      expect(
        settings.find((setting) => setting.category === 'billing'),
      ).toMatchObject({
        source: 'global',
        enabled: false,
        retentionDays: 123,
      });

      expect(
        settings.find((setting) => setting.category === 'feature_flag'),
      ).toMatchObject({
        source: 'taxonomy-default',
      });
    });

    it('CRITICAL: inconsistent organization/tenant tuple returns no settings and no fallback', async () => {
      await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: true,
          retentionDays: 180,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        GLOBAL_WRITE_SCOPE,
      );

      await expect(
        svc.list(organizationScope(ORG_A1, TENANT_B)),
      ).resolves.toEqual([]);
    });

    it('never reads sibling organization overrides', async () => {
      await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: false,
          retentionDays: 111,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        GLOBEX_WRITE_SCOPE,
      );

      const settings = await svc.list(ACME_WRITE_SCOPE);
      const auth = settings.find((setting) => setting.category === 'auth');

      expect(auth?.source).not.toBe('tenant-override');
      expect(auth?.retentionDays).not.toBe(111);
    });

    it('excludes unresolved_legacy and quarantined from organization reads', async () => {
      await testDb.db.insert(auditLogSettingsTable).values([
        {
          category: 'security_event',
          tenantId: ORG_A1,
          organizationId: null,
          ownershipState: 'unresolved_legacy',
          enabled: false,
          retentionDays: 555,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        {
          category: 'waitlist',
          tenantId: 'legacy-quarantined',
          organizationId: null,
          ownershipState: 'quarantined',
          enabled: true,
          retentionDays: 666,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
      ]);

      const settings = await svc.list(ACME_WRITE_SCOPE);

      expect(
        settings.find((setting) => setting.category === 'security_event'),
      ).not.toMatchObject({ retentionDays: 555 });

      expect(
        settings.find((setting) => setting.category === 'waitlist'),
      ).not.toMatchObject({ retentionDays: 666 });
    });

    it('platform-global reads intentional-global only', async () => {
      await svc.upsertCanonical(
        {
          category: 'billing',
          enabled: false,
          retentionDays: 321,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        GLOBAL_WRITE_SCOPE,
      );

      await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: false,
          retentionDays: 111,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        ACME_WRITE_SCOPE,
      );

      const settings = await svc.list(GLOBAL_WRITE_SCOPE);

      expect(
        settings.find((setting) => setting.category === 'billing'),
      ).toMatchObject({
        source: 'global',
        retentionDays: 321,
      });

      expect(
        settings.find((setting) => setting.category === 'auth'),
      ).not.toMatchObject({
        source: 'tenant-override',
        retentionDays: 111,
      });
    });
  });

  describe('AUD·D canonical mutations', () => {
    it('upserts an organization setting by canonical semantic partial unique', async () => {
      const created = await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: true,
          retentionDays: 30,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        ACME_WRITE_SCOPE,
      );

      const updated = await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: false,
          retentionDays: 90,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        ACME_WRITE_SCOPE,
      );

      expect(updated.id).toBe(created.id);
      expect(updated).toMatchObject({
        tenantId: ORG_A1,
        source: 'tenant-override',
        enabled: false,
        retentionDays: 90,
        captureInputOnSuccess: true,
      });

      const rows = await testDb.db.select().from(auditLogSettingsTable);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenantId: ORG_A1,
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
      });
    });

    it('upserts platform-global by the intentional_global partial unique', async () => {
      const created = await svc.upsertCanonical(
        {
          category: 'billing',
          enabled: true,
          retentionDays: 100,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        GLOBAL_WRITE_SCOPE,
      );

      const updated = await svc.upsertCanonical(
        {
          category: 'billing',
          enabled: false,
          retentionDays: 200,
          captureInputOnSuccess: true,
          updatedByUserId: null,
        },
        GLOBAL_WRITE_SCOPE,
      );

      expect(updated.id).toBe(created.id);
      expect(updated).toMatchObject({
        tenantId: null,
        source: 'global',
        enabled: false,
        retentionDays: 200,
      });

      const rows = await testDb.db.select().from(auditLogSettingsTable);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenantId: null,
        organizationId: null,
        ownershipState: 'intentional_global',
      });
    });

    it('fails closed when the organization/tenant tuple is inconsistent', async () => {
      await expect(
        svc.upsertCanonical(
          {
            category: 'auth',
            enabled: true,
            retentionDays: 30,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          organizationScope(ORG_A1, TENANT_B),
        ),
      ).rejects.toThrow(AuditCanonicalWriteInvariantError);

      expect(await testDb.db.select().from(auditLogSettingsTable)).toHaveLength(
        0,
      );
    });

    it('preserves a quarantined rollback-shadow collision instead of reclassifying it', async () => {
      const [quarantined] = await testDb.db
        .insert(auditLogSettingsTable)
        .values({
          category: 'security_event',
          tenantId: ORG_A1,
          organizationId: null,
          ownershipState: 'quarantined',
          enabled: true,
          retentionDays: 45,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        })
        .returning();

      await expect(
        svc.upsertCanonical(
          {
            category: 'security_event',
            enabled: false,
            retentionDays: 90,
            captureInputOnSuccess: true,
            updatedByUserId: null,
          },
          ACME_WRITE_SCOPE,
        ),
      ).rejects.toThrow(AuditSettingAliasConflictError);

      const rows = await testDb.db.select().from(auditLogSettingsTable);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: quarantined?.id,
        tenantId: ORG_A1,
        organizationId: null,
        ownershipState: 'quarantined',
        enabled: true,
        retentionDays: 45,
      });
    });

    it('resetCanonical deletes exactly the canonical organization override', async () => {
      await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: true,
          retentionDays: 30,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        ACME_WRITE_SCOPE,
      );

      await svc.resetCanonical('auth', ACME_WRITE_SCOPE);

      expect(await testDb.db.select().from(auditLogSettingsTable)).toHaveLength(
        0,
      );
    });

    it('resetCanonical fails closed on an inconsistent organization tuple', async () => {
      await svc.upsertCanonical(
        {
          category: 'auth',
          enabled: true,
          retentionDays: 30,
          captureInputOnSuccess: false,
          updatedByUserId: null,
        },
        ACME_WRITE_SCOPE,
      );

      await expect(
        svc.resetCanonical('auth', organizationScope(ORG_A1, TENANT_B)),
      ).rejects.toThrow(AuditCanonicalWriteInvariantError);

      expect(await testDb.db.select().from(auditLogSettingsTable)).toHaveLength(
        1,
      );
    });

    it('resetCanonical never deletes an unresolved legacy alias fallback', async () => {
      await testDb.db.insert(auditLogSettingsTable).values({
        category: 'server_action',
        tenantId: ORG_A1,
        organizationId: null,
        ownershipState: 'unresolved_legacy',
        enabled: false,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      });

      await expect(
        svc.resetCanonical('server_action', ACME_WRITE_SCOPE),
      ).rejects.toThrow(AuditSettingNotFoundError);

      expect(await testDb.db.select().from(auditLogSettingsTable)).toHaveLength(
        1,
      );
    });

    it('platform-global reset only deletes intentional_global', async () => {
      await testDb.db.insert(auditLogSettingsTable).values({
        category: 'billing',
        tenantId: 'quarantined-global-shadow',
        organizationId: null,
        ownershipState: 'quarantined',
        enabled: true,
        retentionDays: 45,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      });

      await expect(
        svc.resetCanonical('billing', GLOBAL_WRITE_SCOPE),
      ).rejects.toThrow(AuditSettingNotFoundError);

      const [row] = await testDb.db.select().from(auditLogSettingsTable);
      expect(row?.ownershipState).toBe('quarantined');
    });
  });

  describe('AUD·D canonical mutation validation', () => {
    it('rejects retentionDays outside the allowed range', async () => {
      await expect(
        svc.upsertCanonical(
          {
            category: 'billing',
            enabled: true,
            retentionDays: 1,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          GLOBAL_WRITE_SCOPE,
        ),
      ).rejects.toThrow(InvalidAuditRetentionDaysError);

      await expect(
        svc.upsertCanonical(
          {
            category: 'billing',
            enabled: true,
            retentionDays: 10_000,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          GLOBAL_WRITE_SCOPE,
        ),
      ).rejects.toThrow(InvalidAuditRetentionDaysError);
    });

    it('rejects sampleRate outside [0, 1]', async () => {
      await expect(
        svc.upsertCanonical(
          {
            category: 'server_action',
            enabled: true,
            retentionDays: 30,
            sampleRate: 1.5,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          GLOBAL_WRITE_SCOPE,
        ),
      ).rejects.toThrow(InvalidAuditSampleRateError);
    });
  });
});
