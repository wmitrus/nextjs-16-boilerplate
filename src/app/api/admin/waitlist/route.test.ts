import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  authzService: { can: vi.fn() },
  listPending: vi.fn(),
  db: {},
  registry: new Map<symbol, unknown>(),
  container: {
    resolve: vi.fn((token: symbol) => mocks.registry.get(token)),
  },
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: mocks.connection };
});

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
    // A class, not `vi.fn().mockImplementation(...)` -- see the note in
    // `src/app/api/auth/waitlist/route.test.ts`: the factory runs after
    // `vi.resetAllMocks()`, so a mock implementation set here is not
    // reliably present when the route constructs it.
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

function makeRequest() {
  return new NextRequest('http://localhost/api/admin/waitlist');
}

/**
 * SEC-41. `listPending()` takes no scope and the table has no trustworthy
 * one to take -- so who may call it is the entire access-control decision
 * for this route.
 */
describe('GET /api/admin/waitlist', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.registry.set(AUTHORIZATION.SERVICE, mocks.authzService);
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.listPending.mockResolvedValue([]);
  });

  it('returns 403 when the caller is not a platform admin', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(403);
    expect(mocks.listPending).not.toHaveBeenCalled();
  });

  it('rejects a tenant admin holding SECURITY_MANAGE_POLICIES', async () => {
    // The cross-tenant read this case closes: `SECURITY_MANAGE_POLICIES` is
    // evaluated against the caller's active tenant, so every tenant owner
    // holds it -- and this listing spans every tenant's applicants.
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.authzService.can.mockResolvedValue(true);

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(403);
    expect(mocks.authzService.can).not.toHaveBeenCalled();
    expect(mocks.listPending).not.toHaveBeenCalled();
  });

  it('lists pending entries for an env-based platform admin', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listPending.mockResolvedValue([
      { id: 'entry-1', email: 'a@test.dev', name: 'A' },
    ]);

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.data.entries).toHaveLength(1);
  });
});
