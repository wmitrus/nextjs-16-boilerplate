/** @vitest-environment node */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  parentTenantIdFromOrgRow,
  tenantIdFromTenantsRow,
} from '@/core/contracts/canonical-ids.provenance';

import { OrganizationNotFoundError } from '../../domain/errors';

import { DrizzleAdminOrganizationsMutationService } from './DrizzleAdminOrganizationsMutationService';
import type { OrganizationsAdminDataScope } from './DrizzleAdminOrganizationsReadService';
import { organizationsTable } from './schema';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeOrgId: string;
let siblingOrganizationId: string;
let globexOrgId: string;
let acmeTenantId: string;
let globexTenantId: string;

function organizationScope(
  organizationId: string,
  tenantId: string,
): OrganizationsAdminDataScope {
  return {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(organizationId),
    tenantId: parentTenantIdFromOrgRow(tenantId),
  };
}

function tenantScope(tenantId: string): OrganizationsAdminDataScope {
  return {
    kind: 'tenant',
    tenantId: tenantIdFromTenantsRow(tenantId),
  };
}

async function statusOf(organizationId: string): Promise<string | undefined> {
  const rows = await testDb.db
    .select({ status: organizationsTable.status })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));
  return rows[0]?.status;
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
  globexOrgId = auth.orgs.globexHq.id;
  acmeTenantId = auth.tenants.acme.id;
  globexTenantId = auth.tenants.globex.id;
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

describe('DrizzleAdminOrganizationsMutationService (real DB, canonical DataScope)', () => {
  it('(2) organization scope: an authorized mutation succeeds and changes the row', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);
    const scope = organizationScope(acmeOrgId, acmeTenantId);

    const archived = await service.updateOrganizationStatus({
      scope,
      organizationId: acmeOrgId,
      status: 'archived',
    });

    expect(archived.id).toBe(acmeOrgId);
    expect(archived.tenantId).toBe(acmeTenantId);
    expect(archived.status).toBe('archived');
    expect(await statusOf(acmeOrgId)).toBe('archived');

    const reactivated = await service.updateOrganizationStatus({
      scope,
      organizationId: acmeOrgId,
      status: 'active',
    });

    expect(reactivated.status).toBe('active');
    expect(await statusOf(acmeOrgId)).toBe('active');
  });

  it('(4) organization scope: a sibling mutation throws and the sibling row is unchanged', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    await expect(
      service.updateOrganizationStatus({
        scope: organizationScope(acmeOrgId, acmeTenantId),
        organizationId: siblingOrganizationId,
        status: 'archived',
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(await statusOf(siblingOrganizationId)).toBe('active');
  });

  it('(5) organization scope: correct organizationId + WRONG tenantId throws and leaves the row unchanged (defence in depth)', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    await expect(
      service.updateOrganizationStatus({
        scope: organizationScope(acmeOrgId, globexTenantId),
        organizationId: acmeOrgId,
        status: 'archived',
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(await statusOf(acmeOrgId)).toBe('active');
  });

  it('(11) organization scope: a requested resource organization id cannot override the scope', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    await expect(
      service.updateOrganizationStatus({
        scope: organizationScope(acmeOrgId, acmeTenantId),
        organizationId: siblingOrganizationId,
        status: 'archived',
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(await statusOf(siblingOrganizationId)).toBe('active');
  });

  it('(8) tenant scope: a sibling organization in the SAME tenant can be mutated', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);
    const scope = tenantScope(acmeTenantId);

    const archived = await service.updateOrganizationStatus({
      scope,
      organizationId: siblingOrganizationId,
      status: 'archived',
    });

    expect(archived.id).toBe(siblingOrganizationId);
    expect(archived.status).toBe('archived');
    expect(await statusOf(siblingOrganizationId)).toBe('archived');

    await service.updateOrganizationStatus({
      scope,
      organizationId: siblingOrganizationId,
      status: 'active',
    });
    expect(await statusOf(siblingOrganizationId)).toBe('active');
  });

  it('(10) tenant scope: a cross-tenant mutation throws and the row is unchanged', async () => {
    const service = new DrizzleAdminOrganizationsMutationService(testDb.db);

    await expect(
      service.updateOrganizationStatus({
        scope: tenantScope(acmeTenantId),
        organizationId: globexOrgId,
        status: 'archived',
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);

    expect(await statusOf(globexOrgId)).toBe('active');
  });
});
