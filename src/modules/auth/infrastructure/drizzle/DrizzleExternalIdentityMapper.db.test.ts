/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleInternalIdentityLookup } from './DrizzleInternalIdentityLookup';

import { DrizzleProvisioningService } from '@/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await resolveTestDb();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleInternalIdentityLookup (real DB)', () => {
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

    const lookup = new DrizzleInternalIdentityLookup(testDb.db);
    const userId = await lookup.findInternalUserId(
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
      orgExternalId: 'org_compat_read_001',
      tenantRole: 'org:admin',
      tenancyMode: 'org',
      tenantContextSource: 'provider',
    });

    const lookup = new DrizzleInternalIdentityLookup(testDb.db);
    const tenantId = await lookup.findInternalOrganizationId(
      'clerk',
      'org_compat_read_001',
    );
    expect(typeof tenantId).toBe('string');
    expect(tenantId).not.toBeNull();
  });

  it('returns null for unknown user identity', async () => {
    const lookup = new DrizzleInternalIdentityLookup(testDb.db);
    const result = await lookup.findInternalUserId('clerk', 'unknown_user_xxx');
    expect(result).toBeNull();
  });

  it('returns null for unknown tenant identity', async () => {
    const lookup = new DrizzleInternalIdentityLookup(testDb.db);
    const result = await lookup.findInternalOrganizationId(
      'clerk',
      'unknown_org_xxx',
    );
    expect(result).toBeNull();
  });
});
