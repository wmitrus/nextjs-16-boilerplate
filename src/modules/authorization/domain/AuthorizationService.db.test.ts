/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

import { DrizzleMembershipRepository } from '../infrastructure/drizzle/DrizzleMembershipRepository';
import { DrizzlePolicyRepository } from '../infrastructure/drizzle/DrizzlePolicyRepository';
import { DrizzleRoleRepository } from '../infrastructure/drizzle/DrizzleRoleRepository';
import { DrizzleTenantAttributesRepository } from '../infrastructure/drizzle/DrizzleTenantAttributesRepository';
import { seedAuthorization } from '../infrastructure/drizzle/seed';

import { DefaultAuthorizationService } from './AuthorizationService';
import { PolicyEngine } from './policy/PolicyEngine';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let aliceId: string;
let bobId: string;
let acmeTenantId: string;

function createService(): DefaultAuthorizationService {
  return new DefaultAuthorizationService(
    new DrizzlePolicyRepository(testDb.db),
    new DrizzleMembershipRepository(testDb.db),
    new DrizzleRoleRepository(testDb.db),
    new DrizzleTenantAttributesRepository(testDb.db),
    new PolicyEngine(),
  );
}

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });

  aliceId = users.alice.id;
  bobId = users.bob.id;
  acmeTenantId = auth.tenants.acme.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DefaultAuthorizationService (real DB)', () => {
  it('allows owner to invite users', async () => {
    const service = createService();

    const allowed = await service.can({
      tenant: { tenantId: acmeTenantId },
      subject: { id: aliceId },
      resource: { type: RESOURCES.USER, id: bobId },
      action: ACTIONS.USER_INVITE,
    });

    expect(allowed).toBe(true);
  });

  it('denies member access to owner-only actions', async () => {
    const service = createService();

    const allowed = await service.can({
      tenant: { tenantId: acmeTenantId },
      subject: { id: bobId },
      resource: { type: RESOURCES.USER, id: aliceId },
      action: ACTIONS.USER_INVITE,
    });

    expect(allowed).toBe(false);
  });

  it('allows member to read own user resource', async () => {
    const service = createService();

    const allowed = await service.can({
      tenant: { tenantId: acmeTenantId },
      subject: { id: bobId },
      resource: { type: RESOURCES.USER, id: bobId },
      action: ACTIONS.USER_READ,
    });

    expect(allowed).toBe(true);
  });

  it('denies member read of another user resource', async () => {
    const service = createService();

    const allowed = await service.can({
      tenant: { tenantId: acmeTenantId },
      subject: { id: bobId },
      resource: { type: RESOURCES.USER, id: aliceId },
      action: ACTIONS.USER_READ,
    });

    expect(allowed).toBe(false);
  });
});
