/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleAdminOrganizationsReadService } from './DrizzleAdminOrganizationsReadService';
import { DrizzleAdminRolesMutationService } from './DrizzleAdminRolesMutationService';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeOrgId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminOrganizationsReadService (real DB)', () => {
  it('returns custom roles on the members page with UUID ids intact', async () => {
    const rolesService = new DrizzleAdminRolesMutationService(testDb.db);
    const readService = new DrizzleAdminOrganizationsReadService(testDb.db);

    const created = await rolesService.createCustomRole({
      organizationId: acmeOrgId,
      name: 'billing_manager_probe',
    });

    const page = await readService.getMembersInActiveScope({
      activeOrganizationId: acmeOrgId,
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
