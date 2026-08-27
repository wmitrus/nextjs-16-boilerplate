import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH, INFRASTRUCTURE } from '@/core/contracts';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  listPending: vi.fn(),
  findByEmail: vi.fn(),
  db: {},
  registry: new Map<symbol, unknown>(),
  container: {
    resolve: vi.fn((token: symbol) => mocks.registry.get(token)),
  },
}));

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: mocks.resolveAccess,
}));

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvAdmin,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => mocks.container,
}));

vi.mock('@/core/env', () => ({
  env: {
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'test',
    RESEND_FROM_EMAIL: 'noreply@test.dev',
  },
}));

vi.mock('@/modules/invitations/infrastructure/EmailServiceFactory', () => ({
  createEmailService: () => ({}),
}));

vi.mock(
  '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository',
  () => ({
    // A class, not `vi.fn().mockImplementation(...)` -- mirrors
    // `src/app/api/admin/waitlist/route.test.ts`: the factory runs after
    // `vi.resetAllMocks()`, so a mock implementation set here is not
    // reliably present when the page constructs it.
    DrizzleWaitlistRepository: class {},
  }),
);

vi.mock('@/modules/waitlist/infrastructure/DefaultWaitlistService', () => ({
  DefaultWaitlistService: class {
    listPending(...args: unknown[]) {
      return mocks.listPending(...args);
    }
  },
}));

/**
 * `loadPendingEntriesForPlatformAdmin` is the loader `WaitlistAdminPage`
 * calls -- the same gate the sibling `/api/admin/waitlist` route enforces,
 * proven here at the Server Component boundary directly, mirroring
 * `route.test.ts`'s coverage of the API side. See the loader's own doc
 * comment in `page.tsx` for why `SECURITY_MANAGE_POLICIES` cannot gate this
 * platform-global read (SEC-41, SEC-26).
 */
describe('loadPendingEntriesForPlatformAdmin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.registry.set(AUTH.USER_REPOSITORY, {
      findByEmail: mocks.findByEmail,
    });
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.listPending.mockResolvedValue([]);
    mocks.findByEmail.mockResolvedValue(null);
  });

  it('returns no entries and never calls listPending() for a non-platform-admin caller', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);

    const { loadPendingEntriesForPlatformAdmin } = await import('./page');
    const entries = await loadPendingEntriesForPlatformAdmin();

    expect(entries).toEqual([]);
    expect(mocks.listPending).not.toHaveBeenCalled();
  });

  it('returns no entries and never calls listPending() for a tenant admin holding SECURITY_MANAGE_POLICIES', async () => {
    // The exact cross-tenant read this closes: the `/admin` layout only
    // proves this ABAC grant on the caller's own active tenant, and every
    // ordinary tenant/organization admin holds it -- it must not be treated
    // as platform-wide authority over this unscoped, cross-tenant listing.
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: 'tenant_a',
          tenantId: 'tenant_a',
          userId: 'user_test_1',
        },
      }),
    );

    const { loadPendingEntriesForPlatformAdmin } = await import('./page');
    const entries = await loadPendingEntriesForPlatformAdmin();

    expect(entries).toEqual([]);
    expect(mocks.listPending).not.toHaveBeenCalled();
  });

  it('returns no entries when the caller is not an allowed/provisioned identity', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveAccess.mockResolvedValue({ status: 'SIGN_IN_REQUIRED' });

    const { loadPendingEntriesForPlatformAdmin } = await import('./page');
    const entries = await loadPendingEntriesForPlatformAdmin();

    expect(entries).toEqual([]);
    expect(mocks.listPending).not.toHaveBeenCalled();
  });

  it('lists pending entries for an env-based platform admin', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listPending.mockResolvedValue([
      {
        id: 'entry-1',
        email: 'a@test.dev',
        name: 'A',
        organizationId: null,
        status: 'pending',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        approvedAt: null,
        notifiedAt: null,
      },
    ]);

    const { loadPendingEntriesForPlatformAdmin } = await import('./page');
    const entries = await loadPendingEntriesForPlatformAdmin();

    expect(mocks.listPending).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.email).toBe('a@test.dev');
  });
});
