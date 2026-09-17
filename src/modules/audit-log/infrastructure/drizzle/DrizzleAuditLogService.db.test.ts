/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type {
  AuditEventInput,
  AuditWriteScope,
} from '@/core/contracts/audit-log';

import { AuditCanonicalWriteInvariantError } from '../../domain/errors';

import { DrizzleAuditLogService } from './DrizzleAuditLogService';
import { DrizzleAuditLogSettingsAdminService } from './DrizzleAuditLogSettingsAdminService';
import { auditEventsTable, auditLogSettingsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleAuditLogService;
let settingsSvc: DrizzleAuditLogSettingsAdminService;

const TENANT_A = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const TENANT_B = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';
const ORG_A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const ORG_B1 = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const ORG_MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const organizationScope = (
  organizationId: string,
  tenantId: string,
): AuditWriteScope =>
  ({
    kind: 'organization',
    organizationId,
    tenantId,
  }) as AuditWriteScope;

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleAuditLogService(testDb.db);
  settingsSvc = new DrizzleAuditLogSettingsAdminService(testDb.db);

  await testDb.db.execute(
    sql`INSERT INTO tenants (id, name) VALUES
        (${TENANT_A}, 'Audit Tenant A'),
        (${TENANT_B}, 'Audit Tenant B')`,
  );
  await testDb.db.execute(
    sql`INSERT INTO organizations (id, tenant_id, name) VALUES
        (${ORG_A1}, ${TENANT_A}, 'Audit Org A1'),
        (${ORG_B1}, ${TENANT_B}, 'Audit Org B1')`,
  );
});

afterEach(async () => {
  await testDb.db.delete(auditEventsTable);
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

function makeEvent(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    category: 'auth',
    action: 'auth.signin_success',
    outcome: 'success',
    writeScope: { kind: 'platform-global' },
    legacyTenantId: 'acme',
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
      organizationId: null,
      ownershipState: 'intentional_global',
      ip: '1.2.3.4',
    });
  });

  describe('AUD·B canonical ownership containment', () => {
    it('valid organization tuple inserts one canonical organization-owned event', async () => {
      await svc.record(
        makeEvent({
          writeScope: organizationScope(ORG_A1, TENANT_A),
          legacyTenantId: 'legacy-a1',
        }),
      );

      const rows = await testDb.db.select().from(auditEventsTable);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenantId: 'legacy-a1',
        organizationId: ORG_A1,
        ownershipState: 'canonical_organization',
      });
    });

    it('mismatched organization/tenant tuple inserts zero rows and fails closed', async () => {
      await expect(
        svc.record(
          makeEvent({
            writeScope: organizationScope(ORG_A1, TENANT_B),
            legacyTenantId: 'legacy-a1',
          }),
        ),
      ).rejects.toBeInstanceOf(AuditCanonicalWriteInvariantError);

      expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
    });

    it('nonexistent organization inserts zero rows and never falls back to global', async () => {
      await expect(
        svc.record(
          makeEvent({
            writeScope: organizationScope(ORG_MISSING, TENANT_A),
            legacyTenantId: 'legacy-missing',
          }),
        ),
      ).rejects.toBeInstanceOf(AuditCanonicalWriteInvariantError);

      expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
    });
  });

  describe('AUD·B writer classification matrix', () => {
    const GLOBAL_WRITE_SCOPE: AuditWriteScope = { kind: 'platform-global' };
    const LEGACY_ORG = 'legacy-org-context';
    const LEGACY_ACTOR = 'legacy-actor-context';

    /**
     * OZI-71 AUD·B writer inventory.
     *
     * The route/writer unit tests bind each production call-site to the scope
     * shown here. This real-DB matrix proves that every resulting
     * classification persists the expected canonical ownership while the
     * legacy compatibility key remains independent and unchanged.
     */
    const writerCases = [
      {
        writer: 'admin/layout env-admin grant',
        category: 'admin_access',
        action: 'admin_panel.access_granted',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: LEGACY_ACTOR,
      },
      {
        writer: 'admin/layout ABAC denial',
        category: 'admin_access',
        action: 'admin_panel.access_denied',
        outcome: 'denied',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'admin/layout ABAC grant',
        category: 'admin_access',
        action: 'admin_panel.access_granted',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },

      {
        writer: 'audit-log-settings update organization',
        category: 'rbac_policy',
        action: 'audit_log_setting.update',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'audit-log-settings update global',
        category: 'rbac_policy',
        action: 'audit_log_setting.update',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: null,
      },
      {
        writer: 'audit-log-settings reset organization',
        category: 'rbac_policy',
        action: 'audit_log_setting.reset',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'audit-log-settings reset global',
        category: 'rbac_policy',
        action: 'audit_log_setting.reset',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: null,
      },

      {
        writer: 'feature-flags create organization',
        category: 'feature_flag',
        action: 'feature_flag.create',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'feature-flags create global',
        category: 'feature_flag',
        action: 'feature_flag.create',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: null,
      },
      {
        writer: 'feature-flags update organization',
        category: 'feature_flag',
        action: 'feature_flag.update',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'feature-flags update global',
        category: 'feature_flag',
        action: 'feature_flag.update',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: null,
      },
      {
        writer: 'feature-flags delete organization',
        category: 'feature_flag',
        action: 'feature_flag.delete',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'feature-flags delete global',
        category: 'feature_flag',
        action: 'feature_flag.delete',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: null,
      },

      {
        writer: 'organizations invitation create',
        category: 'membership',
        action: 'invitation.create',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations invitation revoke',
        category: 'membership',
        action: 'invitation.revoke',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations membership role update',
        category: 'membership',
        action: 'membership.update_role',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations policy create',
        category: 'rbac_policy',
        action: 'rbac_policy.create',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations policy update',
        category: 'rbac_policy',
        action: 'rbac_policy.update',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations policy delete',
        category: 'rbac_policy',
        action: 'rbac_policy.delete',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations role create',
        category: 'rbac_policy',
        action: 'role.create',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations role rename',
        category: 'rbac_policy',
        action: 'role.rename',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations role delete',
        category: 'rbac_policy',
        action: 'role.delete',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'organizations status update',
        category: 'organization',
        action: 'organization.update_status',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },

      {
        writer: 'users deactivate organization',
        category: 'admin_access',
        action: 'user.deactivate',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'users deactivate global',
        category: 'admin_access',
        action: 'user.deactivate',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: LEGACY_ACTOR,
      },
      {
        writer: 'users update organization',
        category: 'admin_access',
        action: 'user.update',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'users update global',
        category: 'admin_access',
        action: 'user.update',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: LEGACY_ACTOR,
      },

      {
        writer: 'waitlist approve',
        category: 'waitlist',
        action: 'waitlist.approve',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: LEGACY_ACTOR,
      },
      {
        writer: 'waitlist reject',
        category: 'waitlist',
        action: 'waitlist.reject',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: LEGACY_ACTOR,
      },

      {
        writer: 'mfa recovery codes regenerate',
        category: 'auth',
        action: 'mfa.recovery_codes.regenerated',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'mfa TOTP enroll',
        category: 'auth',
        action: 'mfa.enrolled',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'mfa TOTP disable',
        category: 'auth',
        action: 'mfa.disabled',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'mfa challenge failure',
        category: 'auth',
        action: 'mfa.challenge.failed',
        outcome: 'denied',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'mfa challenge verified',
        category: 'auth',
        action: 'mfa.challenge.verified',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },

      {
        writer: 'withAdminStepUp denial',
        category: 'admin_access',
        action: 'admin.step_up.denied',
        outcome: 'denied',
        classification: 'platform-global',
        legacyTenantId: LEGACY_ACTOR,
      },

      {
        writer: 'action-audit authenticated',
        category: 'server_action',
        action: 'matrix.action_audit.authenticated',
        outcome: 'success',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'action-audit anonymous',
        category: 'server_action',
        action: 'matrix.action_audit.anonymous',
        outcome: 'success',
        classification: 'platform-global',
        legacyTenantId: null,
      },

      {
        writer: 'security-logger authenticated',
        category: 'security_event',
        action: 'ssrf_attempt',
        outcome: 'failure',
        classification: 'organization',
        legacyTenantId: LEGACY_ORG,
      },
      {
        writer: 'security-logger anonymous',
        category: 'security_event',
        action: 'matrix.security_logger.anonymous',
        outcome: 'failure',
        classification: 'platform-global',
        legacyTenantId: null,
      },
    ] as const;

    it.each(writerCases)(
      '$writer -> $classification',
      async ({ category, action, outcome, classification, legacyTenantId }) => {
        // Force every category on so the matrix tests ownership rather than
        // taxonomy defaults (notably waitlist defaults to disabled).
        await settingsSvc.upsert(
          {
            category,
            tenantId: null,
            enabled: true,
            retentionDays: 30,
            sampleRate: null,
            captureInputOnSuccess: false,
            updatedByUserId: null,
          },
          null,
          GLOBAL_WRITE_SCOPE,
        );

        const writeScope =
          classification === 'organization'
            ? organizationScope(ORG_A1, TENANT_A)
            : GLOBAL_WRITE_SCOPE;

        await svc.record({
          category,
          action,
          outcome,
          writeScope,
          legacyTenantId,
        });

        const rows = await testDb.db.select().from(auditEventsTable);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          category,
          action,
          outcome,
          tenantId: legacyTenantId,
          organizationId: classification === 'organization' ? ORG_A1 : null,
          ownershipState:
            classification === 'organization'
              ? 'canonical_organization'
              : 'intentional_global',
        });
      },
    );
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
      { kind: 'platform-global' },
    );

    await svc.record(makeEvent());

    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(0);
  });

  it('prefers an organization override over the global row', async () => {
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
      { kind: 'platform-global' },
    );

    await settingsSvc.upsert(
      {
        category: 'auth',
        tenantId: ORG_A1,
        enabled: true,
        retentionDays: 30,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      },
      { tenantId: ORG_A1 },
      organizationScope(ORG_A1, TENANT_A),
    );

    // Organization-owned AUD·B writers use the stable internal organization
    // UUID as the legacy compatibility key.
    await svc.record(
      makeEvent({
        writeScope: organizationScope(ORG_A1, TENANT_A),
        legacyTenantId: ORG_A1,
      }),
    );
    expect(await testDb.db.select().from(auditEventsTable)).toHaveLength(1);

    await testDb.db.delete(auditEventsTable);

    // A different real organization has no override and therefore falls back
    // to the disabled global setting.
    await svc.record(
      makeEvent({
        writeScope: organizationScope(ORG_B1, TENANT_B),
        legacyTenantId: ORG_B1,
      }),
    );
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
        { kind: 'platform-global' },
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
        { kind: 'platform-global' },
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
        { kind: 'platform-global' },
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
