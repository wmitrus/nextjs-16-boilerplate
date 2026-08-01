/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OrganizationNotFoundError } from '../../domain/errors';

import { DrizzleAdminOrganizationsMutationService } from './DrizzleAdminOrganizationsMutationService';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let activeOrganizationId: string;
let organizationId: string;
let outsideScopeOrganizationId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  activeOrganizationId = auth.orgs.acmeHq.id;
  organizationId = auth.orgs.acmeHq.id;
  outsideScopeOrganizationId = auth.orgs.globexHq.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminOrganizationsMutationService (real DB)', () => {
  it('updates organization status within the active tenant scope', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    const archived = await service.updateOrganizationStatus({
      activeOrganizationId,
      organizationId,
      status: 'archived',
    });

    expect(archived.id).toBe(organizationId);
    expect(archived.tenantId).toBe('10000000-0000-4000-8000-000000000001');
    expect(archived.status).toBe('archived');

    const reactivated = await service.updateOrganizationStatus({
      activeOrganizationId,
      organizationId,
      status: 'active',
    });

    expect(reactivated.status).toBe('active');
  });

  it('rejects updates outside the supplied tenant scope', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    await expect(
      service.updateOrganizationStatus({
        activeOrganizationId,
        organizationId: outsideScopeOrganizationId,
        status: 'archived',
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });
});
