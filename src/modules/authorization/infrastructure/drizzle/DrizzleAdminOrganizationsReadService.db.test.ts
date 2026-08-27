/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAdminOrganizationsReadService } from './DrizzleAdminOrganizationsReadService';
import { DrizzleAdminRolesMutationService } from './DrizzleAdminRolesMutationService';
import { organizationsTable } from './schema';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeOrgId: string;
let acmeSiblingOrgId: string;
let globexOrgId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
  globexOrgId = auth.orgs.globexHq.id;
  acmeSiblingOrgId = '15000000-0000-4000-8000-000000000003';

  await testDb.db.insert(organizationsTable).values({
    id: acmeSiblingOrgId,
    tenantId: auth.tenants.acme.id,
    name: 'Acme Education',
    slug: 'acme-education',
  });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminOrganizationsReadService (real DB)', () => {
  it('contains a non-platform actor to the active organization', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const scope = {
      kind: 'organization' as const,
      organizationId: acmeOrgId,
    };

    const list = await readService.listInActiveScope({
      scope,
      limit: 20,
      offset: 0,
    });
    const sibling = await readService.getDetailInActiveScope({
      scope,
      organizationId: acmeSiblingOrgId,
    });

    expect(list.organizations.map((organization) => organization.id)).toEqual([
      acmeOrgId,
    ]);
    expect(list.total).toBe(1);
    expect(sibling).toBeNull();
  });

  it('allows an explicit platform actor to read siblings in the active tenant only', async () => {
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);
    const scope = {
      kind: 'active-tenant' as const,
      activeOrganizationId: acmeOrgId,
    };

    const list = await readService.listInActiveScope({
      scope,
      limit: 20,
      offset: 0,
    });
    const sibling = await readService.getDetailInActiveScope({
      scope,
      organizationId: acmeSiblingOrgId,
    });
    const outsideTenant = await readService.getDetailInActiveScope({
      scope,
      organizationId: globexOrgId,
    });

    expect(list.organizations.map((organization) => organization.id)).toEqual(
      expect.arrayContaining([acmeOrgId, acmeSiblingOrgId]),
    );
    expect(list.organizations.map((organization) => organization.id)).not.toContain(
      globexOrgId,
    );
    expect(list.total).toBe(2);
    expect(sibling?.organization.id).toBe(acmeSiblingOrgId);
    expect(outsideTenant).toBeNull();
  });

  it('returns custom roles on the members page with UUID ids intact', async () => {
    const rolesService = new DrizzleAdminRolesMutationService(testDb.db);
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    const created = await rolesService.createCustomRole({
      organizationId: acmeOrgId,
      name: 'billing_manager_probe',
    });

    const page = await readService.getMembersInActiveScope({
      scope: {
        kind: 'organization',
        organizationId: acmeOrgId,
      },
      organizationId: acmeOrgId,
    });

    const customRole = page?.roles.find((role) => role.name === created.name);

    expect(customRole).toBeDefined();
    expect(customRole?.id).toBe(created.id);
    expect(customRole?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
