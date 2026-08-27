/** @vitest-environment node */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AUTH, INFRASTRUCTURE } from '@/core/contracts';

import { seedAuthorization } from '@/modules/authorization/infrastructure/drizzle/seed';
import { seedUsers } from '@/modules/user/infrastructure/drizzle/seed';
import { resolveTestDb, type TestDb } from '@/testing/db/create-test-db';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  registry: new Map<symbol, unknown>(),
  container: { resolve: vi.fn() },
}));

mocks.container.resolve.mockImplementation((token: symbol) =>
  mocks.registry.get(token),
);

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: mocks.resolveAccess,
}));

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvAdmin,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => mocks.container,
}));

// No SMTP/Resend traffic for a read-only loader; only `resolveWaitlistService`
// wires this in.
vi.mock('@/modules/invitations/infrastructure/EmailServiceFactory', () => ({
  createEmailService: () => ({}),
}));

let testDb: TestDb;
// Real, FK-satisfying organizations from the shared authorization fixture --
// standing in for "Tenant A" and "Tenant B" (`organization_id` on
// `waitlist_entries` references `organizations.id`).
let tenantAOrgId: string;
let tenantBOrgId: string;

beforeAll(async () => {
  testDb = await resolveTestDb();
  const users = await seedUsers(testDb.db);
  const auth = await seedAuthorization(testDb.db, { users });
  tenantAOrgId = auth.orgs.acmeHq.id;
  tenantBOrgId = auth.orgs.globexHq.id;
});

afterAll(async () => {
  await testDb.cleanup();
});

/**
 * Real-DB proof that the gate added to `loadPendingEntriesForPlatformAdmin`
 * actually blocks cross-tenant data, not just a mocked `listPending()` call
 * count: an ordinary tenant admin's loader call must return zero rows even
 * though real pending applicants -- claiming different organizations --
 * exist in the same platform-global `waitlist_entries` table. Only an
 * env-based platform admin may see them. See the loader's doc comment in
 * `page.tsx` (SEC-41, SEC-26).
 */
describe('loadPendingEntriesForPlatformAdmin (real DB)', () => {
  beforeEach(() => {
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, testDb.db);
    mocks.registry.set(AUTH.USER_REPOSITORY, {
      findByEmail: async () => null,
    });
  });

  it('does not leak other tenants/organizations applicants to a non-platform tenant admin', async () => {
    const { DrizzleWaitlistRepository } =
      await import('@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository');
    const repo = new DrizzleWaitlistRepository(testDb.db);
    await repo.add({
      email: 'applicant-tenant-a@example.com',
      organizationId: tenantAOrgId,
    });
    await repo.add({
      email: 'applicant-tenant-b@example.com',
      organizationId: tenantBOrgId,
    });

    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: tenantAOrgId,
          tenantId: tenantAOrgId,
          userId: 'admin_a',
        },
      }),
    );

    const { loadPendingEntriesForPlatformAdmin } = await import('./page');
    const entries = await loadPendingEntriesForPlatformAdmin();

    expect(entries).toEqual([]);
  });

  it('lets an env-based platform admin see pending applicants across every organization', async () => {
    const { DrizzleWaitlistRepository } =
      await import('@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository');
    const repo = new DrizzleWaitlistRepository(testDb.db);
    await repo.add({
      email: 'platform-visible-a@example.com',
      organizationId: tenantAOrgId,
    });
    await repo.add({
      email: 'platform-visible-b@example.com',
      organizationId: tenantBOrgId,
    });

    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());

    const { loadPendingEntriesForPlatformAdmin } = await import('./page');
    const entries = await loadPendingEntriesForPlatformAdmin();
    const emails = entries.map((entry) => entry.email);

    expect(emails).toContain('platform-visible-a@example.com');
    expect(emails).toContain('platform-visible-b@example.com');
  });
});
