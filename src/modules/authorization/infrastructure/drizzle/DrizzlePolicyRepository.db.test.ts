/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

import { DrizzlePolicyRepository } from './DrizzlePolicyRepository';
import { seedAuthorization } from './seed';

import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let acmeTenantId: string;
let acmeOwnerRoleId: string;
let acmeMemberRoleId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });
  acmeTenantId = auth.tenants.acme.id;
  acmeOwnerRoleId = auth.roles.acmeOwner.id;
  acmeMemberRoleId = auth.roles.acmeMember.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

const baseContext: AuthorizationContext = {
  tenant: { tenantId: '10000000-0000-4000-8000-000000000001' },
  subject: { id: '00000000-0000-0000-0000-000000000001' },
  resource: { type: 'user' },
  action: 'user:read',
};

describe('DrizzlePolicyRepository (real DB)', () => {
  it('returns policies for a known tenant + assigned role', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies({
      ...baseContext,
      tenant: { tenantId: acmeTenantId },
      subject: { id: baseContext.subject.id, roles: [acmeOwnerRoleId] },
    });

    expect(policies.length).toBeGreaterThan(0);
  });

  it('contains no wildcard policies (resource or actions)', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies({
      ...baseContext,
      tenant: { tenantId: acmeTenantId },
      subject: { id: baseContext.subject.id, roles: [acmeOwnerRoleId] },
    });

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
      subject: { id: baseContext.subject.id, roles: [acmeOwnerRoleId] },
    });

    expect(policies).toEqual([]);
  });

  it('returns owner policies for owner role', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies({
      ...baseContext,
      tenant: { tenantId: acmeTenantId },
      subject: { id: baseContext.subject.id, roles: [acmeOwnerRoleId] },
      action: 'user:invite',
    });

    const ownerInvitePolicy = policies.find(
      (p) =>
        p.effect === 'allow' &&
        p.resource === 'user' &&
        p.actions.includes('user:invite'),
    );
    expect(ownerInvitePolicy).toBeDefined();
  });

  it('does not return owner-only policies for member role', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies({
      ...baseContext,
      tenant: { tenantId: acmeTenantId },
      subject: { id: baseContext.subject.id, roles: [acmeMemberRoleId] },
      action: 'user:invite',
    });

    const ownerInvitePolicy = policies.find(
      (p) =>
        p.effect === 'allow' &&
        p.resource === 'user' &&
        p.actions.includes('user:invite'),
    );
    expect(ownerInvitePolicy).toBeUndefined();
  });

  it('member self-access policy deserializes to executable condition', async () => {
    const repo = new DrizzlePolicyRepository(testDb.db);
    const policies = await repo.getPolicies({
      ...baseContext,
      tenant: { tenantId: acmeTenantId },
      subject: { id: baseContext.subject.id, roles: [acmeMemberRoleId] },
    });

    const memberReadPolicy = policies.find(
      (p) =>
        p.effect === 'allow' &&
        p.resource === 'user' &&
        p.actions.includes('user:read') &&
        p.condition !== undefined,
    );
    expect(memberReadPolicy).toBeDefined();

    const allowContext: AuthorizationContext = {
      ...baseContext,
      subject: { id: 'self-user-id' },
      resource: { type: 'user', id: 'self-user-id' },
      action: 'user:read',
    };
    const denyContext: AuthorizationContext = {
      ...allowContext,
      resource: { type: 'user', id: 'different-user-id' },
    };

    expect(memberReadPolicy?.condition?.(allowContext)).toBe(true);
    expect(memberReadPolicy?.condition?.(denyContext)).toBe(false);
  });
});
