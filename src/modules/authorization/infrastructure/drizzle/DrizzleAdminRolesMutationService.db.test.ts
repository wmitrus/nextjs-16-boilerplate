/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DuplicateRoleNameError,
  ProtectedRoleDeletionError,
  ProtectedRoleMutationError,
  ProtectedSystemRoleNameError,
} from '../../domain/errors';

import { DrizzleAdminRolesMutationService } from './DrizzleAdminRolesMutationService';
import { membershipsTable } from './schema';
import { seedAuthorization } from './seed';

import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';
import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeOrgId: string;
let acmeOwnerRoleId: string;
let bobUserId: string;
const CHARLIE_USER_ID = '00000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
  acmeOwnerRoleId = auth.roles.acmeOwner.id;
  bobUserId = users.bob.id;

  await testDb.db.insert(usersTable).values({
    id: CHARLIE_USER_ID,
    email: 'charlie@example.com',
  });
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminRolesMutationService (real DB)', () => {
  it('rejects creating a duplicate custom role name in the same organization', async () => {
    const service = new DrizzleAdminRolesMutationService(testDb.db);

    await service.createCustomRole({
      organizationId: acmeOrgId,
      name: 'billing_manager',
    });

    await expect(
      service.createCustomRole({
        organizationId: acmeOrgId,
        name: 'Billing_Manager',
      }),
    ).rejects.toBeInstanceOf(DuplicateRoleNameError);
  });

  it('rejects reserved system role names for custom roles', async () => {
    const service = new DrizzleAdminRolesMutationService(testDb.db);

    await expect(
      service.createCustomRole({
        organizationId: acmeOrgId,
        name: 'owner',
      }),
    ).rejects.toBeInstanceOf(ProtectedSystemRoleNameError);
  });

  it('rejects renaming a custom role to a duplicate name', async () => {
    const service = new DrizzleAdminRolesMutationService(testDb.db);

    const first = await service.createCustomRole({
      organizationId: acmeOrgId,
      name: 'finance_manager',
    });
    const second = await service.createCustomRole({
      organizationId: acmeOrgId,
      name: 'support_manager',
    });

    await expect(
      service.renameCustomRole({
        organizationId: acmeOrgId,
        roleId: second.id,
        name: first.name,
      }),
    ).rejects.toBeInstanceOf(DuplicateRoleNameError);
  });

  it('rejects renaming a protected system role', async () => {
    const service = new DrizzleAdminRolesMutationService(testDb.db);

    await expect(
      service.renameCustomRole({
        organizationId: acmeOrgId,
        roleId: acmeOwnerRoleId,
        name: 'owner-renamed',
      }),
    ).rejects.toBeInstanceOf(ProtectedRoleMutationError);
  });

  it('rejects deleting a role that is assigned to a membership', async () => {
    const service = new DrizzleAdminRolesMutationService(testDb.db);

    const createdRole = await service.createCustomRole({
      organizationId: acmeOrgId,
      name: 'assigned_role',
    });

    await testDb.db.insert(membershipsTable).values({
      userId: CHARLIE_USER_ID,
      organizationId: acmeOrgId,
      roleId: createdRole.id,
    });

    await expect(
      service.deleteCustomRole({
        organizationId: acmeOrgId,
        roleId: createdRole.id,
      }),
    ).rejects.toBeInstanceOf(ProtectedRoleDeletionError);
  });

  it('rejects deleting a role that still has pending invitations', async () => {
    const service = new DrizzleAdminRolesMutationService(testDb.db);

    const createdRole = await service.createCustomRole({
      organizationId: acmeOrgId,
      name: 'invite_only_role',
    });

    await testDb.db.insert((await import('./schema')).invitationsTable).values({
      id: '45000000-0000-4000-8000-000000000001',
      organizationId: acmeOrgId,
      invitedByUserId: bobUserId,
      email: 'invite-only@example.com',
      roleId: createdRole.id,
      token: 'invite-only-token',
      status: 'pending',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(
      service.deleteCustomRole({
        organizationId: acmeOrgId,
        roleId: createdRole.id,
      }),
    ).rejects.toBeInstanceOf(ProtectedRoleDeletionError);
  });
});
