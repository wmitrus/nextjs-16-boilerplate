/** @vitest-environment node */
/* eslint-disable @typescript-eslint/no-deprecated */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleExternalIdentityMapper } from './DrizzleExternalIdentityMapper';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

/**
 * @deprecated These write-path methods will be removed in PR-2 when
 * ProvisioningService.ensureProvisioned() takes ownership of create/link operations.
 * ensureTenantAccess() has already been removed — membership bootstrap belongs to ProvisioningService.
 */
describe('DrizzleExternalIdentityMapper (deprecated write-path — real DB)', () => {
  it('resolves existing user identity mapping', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);

    const userId1 = await mapper.resolveOrCreateInternalUserId({
      provider: 'clerk',
      externalUserId: 'user_compat_001',
      email: 'compat-user@example.com',
    });

    const userId2 = await mapper.resolveOrCreateInternalUserId({
      provider: 'clerk',
      externalUserId: 'user_compat_001',
      email: 'compat-user@example.com',
    });

    expect(userId1).toBe(userId2);
    expect(typeof userId1).toBe('string');
    expect(userId1.length).toBeGreaterThan(0);
  });

  it('resolves existing tenant identity mapping', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);

    const tenantId1 = await mapper.resolveOrCreateInternalTenantId({
      provider: 'clerk',
      externalTenantId: 'org_compat_001',
    });

    const tenantId2 = await mapper.resolveOrCreateInternalTenantId({
      provider: 'clerk',
      externalTenantId: 'org_compat_001',
    });

    expect(tenantId1).toBe(tenantId2);
    expect(typeof tenantId1).toBe('string');
    expect(tenantId1.length).toBeGreaterThan(0);
  });

  it('ensureTenantAccess throws — membership bootstrap belongs to ProvisioningService', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);

    await expect(
      mapper.ensureTenantAccess({
        internalUserId: crypto.randomUUID(),
        internalTenantId: crypto.randomUUID(),
      }),
    ).rejects.toThrow('ensureTenantAccess has been removed');
  });
});
