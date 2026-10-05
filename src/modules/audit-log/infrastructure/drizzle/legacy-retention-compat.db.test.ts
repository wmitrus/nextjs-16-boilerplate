/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';

import { getAuditCategoryDefault } from '../../domain/category';

import {
  resolveCanonicalEffectiveAuditSetting,
  resolveLegacyAuditRetentionCompat,
} from './effective-settings';
import { auditLogSettingsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

const TENANT_ID = '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a';
const ORGANIZATION_ID = '8b8b8b8b-8b8b-4b8b-8b8b-8b8b8b8b8b8b';

const organizationScope = {
  kind: 'organization' as const,
  organizationId: internalOrganizationIdFromOrgRow(ORGANIZATION_ID),
  tenantId: parentTenantIdFromOrgRow(TENANT_ID),
};

beforeAll(async () => {
  testDb = await resolveTestDb();

  await testDb.db.execute(sql`
    INSERT INTO tenants (id, name)
    VALUES (${TENANT_ID}, 'Legacy Retention Compat Tenant')
  `);

  await testDb.db.execute(sql`
    INSERT INTO organizations (id, tenant_id, name)
    VALUES (
      ${ORGANIZATION_ID},
      ${TENANT_ID},
      'Legacy Retention Compat Organization'
    )
  `);
});

afterEach(async () => {
  await testDb.db.delete(auditLogSettingsTable);
});

afterAll(async () => {
  await testDb.db.execute(sql`
    DELETE FROM organizations
    WHERE id = ${ORGANIZATION_ID}
  `);

  await testDb.db.execute(sql`
    DELETE FROM tenants
    WHERE id = ${TENANT_ID}
  `);

  await testDb.cleanup();
});

describe('resolveLegacyAuditRetentionCompat', () => {
  it.each(['unresolved_legacy', 'quarantined'] as const)(
    'allows %s only through the bounded legacy-retention path',
    async (ownershipState) => {
      await testDb.db.insert(auditLogSettingsTable).values({
        category: 'auth',
        tenantId: null,
        organizationId: null,
        ownershipState,
        enabled: true,
        retentionDays: 7,
        sampleRate: null,
        captureInputOnSuccess: false,
        updatedByUserId: null,
      });

      const legacy = await resolveLegacyAuditRetentionCompat(
        testDb.db,
        'auth',
        'historical-legacy-key',
      );

      expect(legacy.retentionDays).toBe(7);

      const platformCanonical = await resolveCanonicalEffectiveAuditSetting(
        testDb.db,
        'auth',
        { kind: 'platform-global' },
      );

      const organizationCanonical = await resolveCanonicalEffectiveAuditSetting(
        testDb.db,
        'auth',
        organizationScope,
      );

      const taxonomy = getAuditCategoryDefault('auth');

      expect(platformCanonical).not.toBeNull();
      expect(platformCanonical?.retentionDays).toBe(taxonomy.retentionDays);

      expect(organizationCanonical).not.toBeNull();
      expect(organizationCanonical?.retentionDays).toBe(taxonomy.retentionDays);
    },
  );
});
