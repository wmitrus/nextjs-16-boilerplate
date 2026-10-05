/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';

import { getAuditCategoryDefault } from '../../domain/category';

import {
  resolveCanonicalEffectiveAuditSetting,
  type AuditEffectiveSettingScope,
} from './effective-settings';
import { auditLogSettingsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

const TENANT_A = '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a';
const TENANT_B = '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b';

const ORG_A1 = 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5';
const ORG_A2 = 'a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6';
const ORG_B1 = 'b5b5b5b5-b5b5-4b5b-8b5b-b5b5b5b5b5b5';

function orgScope(
  organizationId: string,
  tenantId: string,
): AuditEffectiveSettingScope {
  return {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(organizationId),
    tenantId: parentTenantIdFromOrgRow(tenantId),
  };
}

const PLATFORM_SCOPE: AuditEffectiveSettingScope = {
  kind: 'platform-global',
};

function expectedRuntimeDefault(
  category: Parameters<typeof getAuditCategoryDefault>[0],
) {
  const def = getAuditCategoryDefault(category);

  return {
    enabled: def.enabled,
    retentionDays: def.retentionDays,
    sampleRate: def.sampleRate,
    captureInputOnSuccess: def.captureInputOnSuccess,
  };
}

beforeAll(async () => {
  testDb = await resolveTestDb();

  await testDb.db.execute(sql`
    INSERT INTO tenants (id, name)
    VALUES
      (${TENANT_A}, 'Effective Settings Tenant A'),
      (${TENANT_B}, 'Effective Settings Tenant B')
  `);

  await testDb.db.execute(sql`
    INSERT INTO organizations (id, tenant_id, name)
    VALUES
      (${ORG_A1}, ${TENANT_A}, 'Effective Settings Org A1'),
      (${ORG_A2}, ${TENANT_A}, 'Effective Settings Org A2'),
      (${ORG_B1}, ${TENANT_B}, 'Effective Settings Org B1')
  `);

  await testDb.db.insert(auditLogSettingsTable).values([
    // Organization override must beat the global row.
    {
      category: 'auth',
      tenantId: 'legacy-auth-org-a1',
      organizationId: ORG_A1,
      ownershipState: 'canonical_organization',
      enabled: false,
      retentionDays: 111,
      sampleRate: null,
      captureInputOnSuccess: true,
      updatedByUserId: null,
    },
    {
      category: 'auth',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: true,
      retentionDays: 222,
      sampleRate: null,
      captureInputOnSuccess: false,
      updatedByUserId: null,
    },

    // Global fallback target and invalid-tuple proof.
    {
      category: 'billing',
      tenantId: null,
      organizationId: null,
      ownershipState: 'intentional_global',
      enabled: false,
      retentionDays: 333,
      sampleRate: null,
      captureInputOnSuccess: true,
      updatedByUserId: null,
    },

    // Sibling organization row — must never bleed into ORG_A1.
    {
      category: 'server_action',
      tenantId: 'legacy-server-action-a2',
      organizationId: ORG_A2,
      ownershipState: 'canonical_organization',
      enabled: false,
      retentionDays: 444,
      sampleRate: null,
      captureInputOnSuccess: true,
      updatedByUserId: null,
    },

    // These states must be invisible to canonical runtime resolution even
    // though their legacy tenant_id values could previously have matched.
    {
      category: 'security_event',
      tenantId: 'legacy-unresolved-a1',
      organizationId: null,
      ownershipState: 'unresolved_legacy',
      enabled: false,
      retentionDays: 555,
      sampleRate: null,
      captureInputOnSuccess: true,
      updatedByUserId: null,
    },
    {
      category: 'waitlist',
      tenantId: null,
      organizationId: null,
      ownershipState: 'quarantined',
      enabled: true,
      retentionDays: 666,
      sampleRate: null,
      captureInputOnSuccess: true,
      updatedByUserId: null,
    },

    // Canonical organization row must not become platform-global.
    {
      category: 'membership',
      tenantId: 'legacy-membership-b1',
      organizationId: ORG_B1,
      ownershipState: 'canonical_organization',
      enabled: false,
      retentionDays: 777,
      sampleRate: null,
      captureInputOnSuccess: true,
      updatedByUserId: null,
    },
  ]);
});

afterAll(async () => {
  await testDb.db.delete(auditLogSettingsTable);

  await testDb.db.execute(sql`
    DELETE FROM organizations
    WHERE id IN (${ORG_A1}, ${ORG_A2}, ${ORG_B1})
  `);

  await testDb.db.execute(sql`
    DELETE FROM tenants
    WHERE id IN (${TENANT_A}, ${TENANT_B})
  `);

  await testDb.cleanup();
});

describe('resolveCanonicalEffectiveAuditSetting (real DB)', () => {
  it('organization override wins over intentional-global', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'auth',
      orgScope(ORG_A1, TENANT_A),
    );

    expect(setting).toEqual({
      enabled: false,
      retentionDays: 111,
      sampleRate: null,
      captureInputOnSuccess: true,
    });
  });

  it('valid organization scope falls back to intentional-global', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'billing',
      orgScope(ORG_A1, TENANT_A),
    );

    expect(setting).toEqual({
      enabled: false,
      retentionDays: 333,
      sampleRate: null,
      captureInputOnSuccess: true,
    });
  });

  it('valid organization scope with no stored match falls back to taxonomy', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'feature_flag',
      orgScope(ORG_A1, TENANT_A),
    );

    expect(setting).toEqual(expectedRuntimeDefault('feature_flag'));
  });

  it('CRITICAL: inconsistent ORG_A1 + TENANT_B returns null with no global or taxonomy fallback', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'billing',
      orgScope(ORG_A1, TENANT_B),
    );

    expect(setting).toBeNull();

    // Sanity: the same global row is reachable when the tuple is valid.
    await expect(
      resolveCanonicalEffectiveAuditSetting(
        testDb.db,
        'billing',
        orgScope(ORG_A1, TENANT_A),
      ),
    ).resolves.toMatchObject({
      retentionDays: 333,
    });
  });

  it('does not read a sibling organization override', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'server_action',
      orgScope(ORG_A1, TENANT_A),
    );

    expect(setting).toEqual(expectedRuntimeDefault('server_action'));
    expect(setting?.retentionDays).not.toBe(444);
  });

  it('unresolved_legacy never participates in organization resolution', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'security_event',
      orgScope(ORG_A1, TENANT_A),
    );

    expect(setting).toEqual(expectedRuntimeDefault('security_event'));
    expect(setting?.retentionDays).not.toBe(555);
  });

  it('platform-global resolves intentional-global only', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'billing',
      PLATFORM_SCOPE,
    );

    expect(setting).toEqual({
      enabled: false,
      retentionDays: 333,
      sampleRate: null,
      captureInputOnSuccess: true,
    });
  });

  it('platform-global excludes quarantined even when legacy tenant_id is null', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'waitlist',
      PLATFORM_SCOPE,
    );

    expect(setting).toEqual(expectedRuntimeDefault('waitlist'));
    expect(setting?.retentionDays).not.toBe(666);
  });

  it('platform-global excludes canonical organization rows', async () => {
    const setting = await resolveCanonicalEffectiveAuditSetting(
      testDb.db,
      'membership',
      PLATFORM_SCOPE,
    );

    expect(setting).toEqual(expectedRuntimeDefault('membership'));
    expect(setting?.retentionDays).not.toBe(777);
  });
});
