/** @vitest-environment node */
/* eslint-disable @typescript-eslint/no-deprecated */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleExternalIdentityMapper } from './DrizzleExternalIdentityMapper';

import { DrizzleProvisioningService } from '@/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

/**
 * @deprecated DrizzleExternalIdentityMapper now provides SELECT-only methods.
 * Write-path operations are handled exclusively by ProvisioningService.ensureProvisioned().
 */
describe('DrizzleExternalIdentityMapper (deprecated read-only — real DB)', () => {
  it('resolves existing user identity mapping after provisioning', async () => {
    const provisioning = new DrizzleProvisioningService(
      testDb.db,
      5,
      'verified-only',
    );
    await provisioning.ensureProvisioned({
      provider: 'clerk',
      externalUserId: 'user_compat_read_001',
      email: 'compat-read@example.com',
      tenancyMode: 'personal',
    });

    const mapper = new DrizzleExternalIdentityMapper(testDb.db);
    const userId = await mapper.resolveInternalUserId(
      'clerk',
      'user_compat_read_001',
    );
    expect(typeof userId).toBe('string');
    expect(userId).not.toBeNull();
  });

  it('resolves existing tenant identity mapping after org/provider provisioning', async () => {
    const provisioning = new DrizzleProvisioningService(
      testDb.db,
      5,
      'verified-only',
    );
    await provisioning.ensureProvisioned({
      provider: 'clerk',
      externalUserId: 'user_compat_read_002',
      tenantExternalId: 'org_compat_read_001',
      tenantRole: 'org:admin',
      tenancyMode: 'org',
      tenantContextSource: 'provider',
    });

    const mapper = new DrizzleExternalIdentityMapper(testDb.db);
    const tenantId = await mapper.resolveInternalTenantId(
      'clerk',
      'org_compat_read_001',
    );
    expect(typeof tenantId).toBe('string');
    expect(tenantId).not.toBeNull();
  });

  it('returns null for unknown user identity', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);
    const result = await mapper.resolveInternalUserId(
      'clerk',
      'unknown_user_xxx',
    );
    expect(result).toBeNull();
  });

  it('returns null for unknown tenant identity', async () => {
    const mapper = new DrizzleExternalIdentityMapper(testDb.db);
    const result = await mapper.resolveInternalTenantId(
      'clerk',
      'unknown_org_xxx',
    );
    expect(result).toBeNull();
  });
});
