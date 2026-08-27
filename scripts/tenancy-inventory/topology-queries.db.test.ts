/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { withReadOnlyDb } from './readonly-db';
import {
  latestSchemaMigration,
  organizationsMissingTenantAttributesCount,
  policiesWithNullOrganizationCount,
  providerOrganizationMappingAnomalies,
  quotaEnforcementSignal,
  tenantIdShapeCounts,
  tenantOrganizationCounts,
  userProviderMappingAnomalies,
  usersInMultipleOrganizationsCount,
  usersInMultipleTenantsCount,
  waitlistEntriesWithTenantIdCount,
} from './topology-queries';

/**
 * Phase B0 refactored every one of these functions to run its SQL from
 * `query-registry.ts` instead of owning its own copy -- this is the
 * behavior-preservation proof: each function still runs cleanly against a
 * real local database and returns the same shape it always did. Not a
 * deep semantic assertion (that logic didn't change; OZI-75 already
 * dry-ran it against local dev-db) -- this is the fast-feedback guard
 * against a registry SQL/table-name typo surfacing only at first real use.
 */
describe('topology-queries (real DB, via query-registry)', () => {
  it('every function runs cleanly against local test-db and returns a well-shaped result', async () => {
    await withReadOnlyDb('test', async (tx) => {
      const schemaMigration = await latestSchemaMigration(tx);
      // An empty local test-db may have zero migrations recorded
      // depending on seed order -- null is a valid, well-typed result,
      // not a failure.
      if (schemaMigration) {
        expect(typeof schemaMigration.id).toBe('number');
        expect(typeof schemaMigration.hash).toBe('string');
      }

      const tenantOrgCounts = await tenantOrganizationCounts(tx);
      expect(tenantOrgCounts).toMatchObject({
        zeroOrganizations: expect.any(Number),
        oneOrganization: expect.any(Number),
        multipleOrganizations: expect.any(Number),
      });

      expect(typeof (await usersInMultipleOrganizationsCount(tx))).toBe(
        'number',
      );
      expect(typeof (await usersInMultipleTenantsCount(tx))).toBe('number');
      expect(typeof (await organizationsMissingTenantAttributesCount(tx))).toBe(
        'number',
      );

      const orgMapping = await providerOrganizationMappingAnomalies(tx);
      expect(orgMapping).toMatchObject({
        organizationsWithoutProviderMapping: expect.any(Number),
        organizationsWithMultipleMappingsSameProvider: expect.any(Number),
      });

      const userMapping = await userProviderMappingAnomalies(tx);
      expect(userMapping).toMatchObject({
        usersWithoutProviderMapping: expect.any(Number),
        usersWithMultipleMappingsSameProvider: expect.any(Number),
      });

      for (const table of [
        'feature_flags',
        'audit_log_settings',
        'audit_events',
      ] as const) {
        const shape = await tenantIdShapeCounts(tx, table);
        expect(shape).toMatchObject({
          nonNull: expect.any(Number),
          matchesInternalTenantUuid: expect.any(Number),
          matchesInternalOrganizationUuid: expect.any(Number),
          matchesNeither: expect.any(Number),
        });
      }

      expect(typeof (await waitlistEntriesWithTenantIdCount(tx))).toBe(
        'number',
      );
      expect(typeof (await policiesWithNullOrganizationCount(tx))).toBe(
        'number',
      );

      const quota = await quotaEnforcementSignal(tx);
      expect(quota).toMatchObject({
        tenantsExceedingMaxOrganizations: expect.any(Number),
        tenantsExceedingMaxUsers: expect.any(Number),
      });
    });
  });
});
