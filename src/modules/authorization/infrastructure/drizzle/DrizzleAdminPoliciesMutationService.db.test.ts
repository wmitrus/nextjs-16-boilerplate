/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

import {
  DuplicatePolicyError,
  ProtectedPolicyMutationError,
} from '../../domain/errors';

import { DrizzleAdminPoliciesMutationService } from './DrizzleAdminPoliciesMutationService';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeOrgId: string;
let acmeMemberRoleId: string;

const PROTECTED_OWNER_POLICY_ID = '30000000-0000-4000-8000-000000000005';

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  acmeOrgId = auth.orgs.acmeHq.id;
  acmeMemberRoleId = auth.roles.acmeMember.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleAdminPoliciesMutationService (real DB)', () => {
  it('updates a custom organization policy with constrained fields only', async () => {
    const service = new DrizzleAdminPoliciesMutationService(testDb.db);
    const created = await service.createRolePolicy({
      organizationId: acmeOrgId,
      roleId: acmeMemberRoleId,
      effect: 'deny',
      resource: RESOURCES.ROUTE,
      actions: [ACTIONS.ROUTE_ACCESS],
    });

    const updated = await service.updateRolePolicy({
      organizationId: acmeOrgId,
      policyId: created.id,
      effect: 'allow',
      resource: RESOURCES.TENANT,
      actions: [ACTIONS.TENANT_MANAGE_MEMBERS, ACTIONS.TENANT_READ],
    });

    expect(updated.roleId).toBe(acmeMemberRoleId);
    expect(updated.effect).toBe('allow');
    expect(updated.resource).toBe(RESOURCES.TENANT);
    expect(updated.actions).toEqual([
      ACTIONS.TENANT_MANAGE_MEMBERS,
      ACTIONS.TENANT_READ,
    ]);
  });

  it('rejects updates that would duplicate another policy identity', async () => {
    const service = new DrizzleAdminPoliciesMutationService(testDb.db);
    const first = await service.createRolePolicy({
      organizationId: acmeOrgId,
      roleId: acmeMemberRoleId,
      effect: 'deny',
      resource: RESOURCES.BILLING,
      actions: [ACTIONS.BILLING_UPDATE],
    });
    const second = await service.createRolePolicy({
      organizationId: acmeOrgId,
      roleId: acmeMemberRoleId,
      effect: 'deny',
      resource: RESOURCES.SECURITY,
      actions: [ACTIONS.SECURITY_READ_AUDIT],
    });

    await expect(
      service.updateRolePolicy({
        organizationId: acmeOrgId,
        policyId: second.id,
        effect: first.effect,
        resource: first.resource,
        actions: first.actions,
      }),
    ).rejects.toBeInstanceOf(DuplicatePolicyError);
  });

  it('blocks edits to the protected owner baseline policy', async () => {
    const service = new DrizzleAdminPoliciesMutationService(testDb.db);

    await expect(
      service.updateRolePolicy({
        organizationId: acmeOrgId,
        policyId: PROTECTED_OWNER_POLICY_ID,
        effect: 'deny',
        resource: RESOURCES.SECURITY,
        actions: [ACTIONS.SECURITY_READ_AUDIT],
      }),
    ).rejects.toBeInstanceOf(ProtectedPolicyMutationError);
  });
});
