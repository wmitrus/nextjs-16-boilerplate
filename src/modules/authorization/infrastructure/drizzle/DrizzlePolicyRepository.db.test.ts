/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

import { DrizzlePolicyRepository } from './DrizzlePolicyRepository';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  await seedAuthorization(testDb.db, { users });
});

afterAll(async () => {
  await testDb.cleanup();
});

const baseContext: AuthorizationContext = {
  tenant: { tenantId: '10000000-0000-0000-0000-000000000001' },
  subject: { id: '00000000-0000-0000-0000-000000000001' },
  resource: { type: 'users' },
  action: 'users:read',
};

describe('DrizzlePolicyRepository (real DB)', () => {
  it('returns policies for a known tenant', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies(baseContext);

    expect(policies.length).toBeGreaterThan(0);
  });

  it('contains no wildcard policies (resource or actions)', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies(baseContext);

    const wildcardResource = policies.find((p) => p.resource === '*');
    const wildcardActions = policies.find(
      (p) => Array.isArray(p.actions) && (p.actions as string[]).includes('*'),
    );
    expect(wildcardResource).toBeUndefined();
    expect(wildcardActions).toBeUndefined();
  });

  it('returns empty array for unknown tenant', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies({
      ...baseContext,
      tenant: { tenantId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
    });

    expect(policies).toEqual([]);
  });

  it('returns owner policy with explicit user resource actions', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies(baseContext);

    const ownerUserPolicy = policies.find(
      (p) => p.effect === 'allow' && p.resource === 'user',
    );
    expect(ownerUserPolicy).toBeDefined();
    expect(ownerUserPolicy?.actions).toContain('user:read');
  });
});
