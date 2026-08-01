/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MembershipNotFoundError,
  ProtectedMembershipMutationError,
  RoleNotFoundError,
} from '../../domain/errors';

import { DrizzleAdminMembershipsMutationService } from './DrizzleAdminMembershipsMutationService';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeOrgId: string;
let acmeOwnerRoleId: string;
let acmeMemberRoleId: string;
let globexOwnerRoleId: string;
let aliceUserId: string;
let bobUserId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
  acmeOwnerRoleId = auth.roles.acmeOwner.id;
  acmeMemberRoleId = auth.roles.acmeMember.id;
  globexOwnerRoleId = auth.roles.globexOwner.id;
  aliceUserId = users.alice.id;
  bobUserId = users.bob.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminMembershipsMutationService (real DB)', () => {
  it('updates a membership role within the same organization', async () => {
    const service = new DrizzleAdminMembershipsMutationService(testDb.db);

    const updated = await service.updateMemberRole({
      organizationId: acmeOrgId,
      userId: bobUserId,
      roleId: acmeOwnerRoleId,
    });

    expect(updated.organizationId).toBe(acmeOrgId);
    expect(updated.userId).toBe(bobUserId);
    expect(updated.roleId).toBe(acmeOwnerRoleId);
    expect(updated.roleName).toBe('owner');
    expect(updated.roleIsSystem).toBe(true);

    await service.updateMemberRole({
      organizationId: acmeOrgId,
      userId: bobUserId,
      roleId: acmeMemberRoleId,
    });
  });

  it('rejects assigning a role from another organization', async () => {
    const service = new DrizzleAdminMembershipsMutationService(testDb.db);

    await expect(
      service.updateMemberRole({
        organizationId: acmeOrgId,
        userId: bobUserId,
        roleId: globexOwnerRoleId,
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it('rejects reassigning the last owner membership', async () => {
    const service = new DrizzleAdminMembershipsMutationService(testDb.db);

    await expect(
      service.updateMemberRole({
        organizationId: acmeOrgId,
        userId: aliceUserId,
        roleId: acmeMemberRoleId,
      }),
    ).rejects.toBeInstanceOf(ProtectedMembershipMutationError);
  });

  it('rejects updates for missing memberships', async () => {
    const service = new DrizzleAdminMembershipsMutationService(testDb.db);

    await expect(
      service.updateMemberRole({
        organizationId: acmeOrgId,
        userId: '00000000-0000-0000-0000-000000000099',
        roleId: acmeMemberRoleId,
      }),
    ).rejects.toBeInstanceOf(MembershipNotFoundError);
  });
});
