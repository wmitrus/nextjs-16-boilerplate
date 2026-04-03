/** @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

import { DrizzleFeatureFlagService } from './DrizzleFeatureFlagService';
import { featureFlagsTable } from './schema';

import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';

let testDb: TestDb;
let svc: DrizzleFeatureFlagService;

const ctx = (tenantId: string): AuthorizationContext => ({
  tenant: { tenantId },
  subject: { id: 'user-1' },
  resource: { type: 'feature' },
  action: 'feature:read',
});

beforeAll(async () => {
  testDb = await resolveTestDb();
  svc = new DrizzleFeatureFlagService(testDb.db);

  await testDb.db.insert(featureFlagsTable).values([
    { key: 'global-on', tenantId: null, enabled: true },
    { key: 'global-off', tenantId: null, enabled: false },
    { key: 'tenant-override', tenantId: null, enabled: true },
    { key: 'tenant-override', tenantId: 'acme', enabled: false },
    { key: 'acme-only', tenantId: 'acme', enabled: true },
  ]);
});

afterAll(async () => {
  await testDb.cleanup();
});

describe('DrizzleFeatureFlagService (real DB)', () => {
  it('returns false when flag does not exist in DB', async () => {
    expect(await svc.isEnabled('nonexistent-flag', ctx('acme'))).toBe(false);
  });

  it('returns true for a global flag (tenantId=null) with enabled=true', async () => {
    expect(await svc.isEnabled('global-on', ctx('any-tenant'))).toBe(true);
  });

  it('returns false for a global flag with enabled=false', async () => {
    expect(await svc.isEnabled('global-off', ctx('any-tenant'))).toBe(false);
  });

  it('tenant-scoped flag overrides global flag (tenant off beats global on)', async () => {
    expect(await svc.isEnabled('tenant-override', ctx('acme'))).toBe(false);
  });

  it('falls back to global flag when tenant has no override', async () => {
    expect(await svc.isEnabled('tenant-override', ctx('other-tenant'))).toBe(
      true,
    );
  });

  it('returns false for a flag scoped to a different tenant', async () => {
    expect(await svc.isEnabled('acme-only', ctx('other-tenant'))).toBe(false);
  });

  it('accepts non-UUID string tenant IDs (text column)', async () => {
    expect(await svc.isEnabled('global-on', ctx('demo'))).toBe(true);
  });
});
