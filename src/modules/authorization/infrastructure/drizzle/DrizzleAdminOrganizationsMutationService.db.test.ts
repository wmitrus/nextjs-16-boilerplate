/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { OrganizationNotFoundError } from '../../domain/errors';

import { DrizzleAdminOrganizationsMutationService } from './DrizzleAdminOrganizationsMutationService';
import { organizationsTable } from './schema';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let activeOrganizationId: string;
let organizationId: string;
let siblingOrganizationId: string;
let outsideScopeOrganizationId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  activeOrganizationId = auth.orgs.acmeHq.id;
  organizationId = auth.orgs.acmeHq.id;
  outsideScopeOrganizationId = auth.orgs.globexHq.id;
  siblingOrganizationId = '15000000-0000-4000-8000-000000000003';

  await testDb.db.insert(organizationsTable).values({
    id: siblingOrganizationId,
    tenantId: auth.tenants.acme.id,
    name: 'Acme Education',
    slug: 'acme-education',
  });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminOrganizationsMutationService (real DB)', () => {
  it('updates the active organization within an organization scope', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);
    const scope = {
      kind: 'organization' as const,
      organizationId: activeOrganizationId,
    };

    const archived = await service.updateOrganizationStatus({
      scope,
      organizationId,
      status: 'archived',
    });

    expect(archived.id).toBe(organizationId);
    expect(archived.tenantId).toBe('10000000-0000-4000-8000-000000000001');
    expect(archived.status).toBe('archived');

    const reactivated = await service.updateOrganizationStatus({
      scope,
      organizationId,
      status: 'active',
    });

    expect(reactivated.status).toBe('active');
  });

  it('rejects a sibling update for a non-platform organization scope', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    await expect(
      service.updateOrganizationStatus({
        scope: {
          kind: 'organization',
          organizationId: activeOrganizationId,
        },
        organizationId: siblingOrganizationId,
        status: 'archived',
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);

    const rows = await testDb.db
      .select({ status: organizationsTable.status })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, siblingOrganizationId));

    expect(rows[0]?.status).toBe('active');
  });

  it('allows a sibling update for an explicit active-tenant scope', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);
    const scope = {
      kind: 'active-tenant' as const,
      activeOrganizationId,
    };

    const archived = await service.updateOrganizationStatus({
      scope,
      organizationId: siblingOrganizationId,
      status: 'archived',
    });

    expect(archived.id).toBe(siblingOrganizationId);
    expect(archived.status).toBe('archived');

    await service.updateOrganizationStatus({
      scope,
      organizationId: siblingOrganizationId,
      status: 'active',
    });
  });

  it('rejects updates outside an explicit active-tenant scope', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    await expect(
      service.updateOrganizationStatus({
        scope: {
          kind: 'active-tenant',
          activeOrganizationId,
        },
        organizationId: outsideScopeOrganizationId,
        status: 'archived',
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });
});
