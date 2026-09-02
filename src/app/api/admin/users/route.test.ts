import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { DrizzleAdminUsersService } from '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const ORG_SCOPE = {
  kind: 'organization' as const,
  organizationId: '15000000-0000-4000-8000-000000000001',
  tenantId: '10000000-0000-4000-8000-000000000001',
};
const GLOBAL_SCOPE = { kind: 'platform-global' as const };

class AdminUsersScopeInvariantError extends Error {
  constructor() {
    super('Admin users canonical scope invariant violated.');
    this.name = 'AdminUsersScopeInvariantError';
  }
}

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  resolveScope: vi.fn(),
  listAll: vi.fn(),
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
    ADMIN_USER_EMAILS: 'admin@test.dev',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

vi.mock('./users-admin-scope', () => ({
  resolveAdminUsersScope: mocks.resolveScope,
  AdminUsersScopeInvariantError,
}));

vi.mock(
  '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService',
  () => ({
    DrizzleAdminUsersService: vi.fn(),
  }),
);

function makeRequest(search?: string, limit?: number, offset?: number) {
  const url = new URL('http://localhost/api/admin/users');
  if (search) url.searchParams.set('search', search);
  if (limit !== undefined) url.searchParams.set('limit', String(limit));
  if (offset !== undefined) url.searchParams.set('offset', String(offset));
  return new NextRequest(url.toString(), { method: 'GET' });
}

const mockContext = { params: Promise.resolve({}) };

const TEST_USERS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'alice@example.com',
    displayName: 'Alice',
    onboardingComplete: true,
    createdAt: new Date('2026-01-01'),
  },
];

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.resolveScope.mockResolvedValue(GLOBAL_SCOPE);
    vi.mocked(DrizzleAdminUsersService).mockImplementation(function () {
      return {
        listAll: mocks.listAll,
      } as unknown as DrizzleAdminUsersService;
    });
    mocks.listAll.mockResolvedValue({ users: TEST_USERS, total: 1 });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.resolveAccess.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Auth required',
      diagnostics: {},
    });
    mocks.isEnvAdmin.mockReturnValue(false);

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), mockContext);
    expect(res.status).toBe(401);
    expect(mocks.resolveScope).not.toHaveBeenCalled();
  });

  it('returns 403 when authenticated but not admin (before any scope resolution)', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'user-1', email: 'notadmin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), mockContext);
    expect(res.status).toBe(403);
    expect(mocks.resolveScope).not.toHaveBeenCalled();
    expect(mocks.listAll).not.toHaveBeenCalled();
  });

  it('returns 200 with user list for env-based admin and forwards the platform-global scope', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listAll.mockResolvedValue({ users: TEST_USERS, total: 1 });

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), mockContext);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { users: unknown[]; total: number };
    };
    expect(body.data.users).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(mocks.listAll).toHaveBeenCalledWith(expect.anything(), GLOBAL_SCOPE);
  });

  it('clamps limit to maximum of 100', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listAll.mockResolvedValue({ users: [], total: 0 });

    const { GET } = await import('./route');
    await GET(makeRequest(undefined, 999), mockContext);

    expect(mocks.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
      GLOBAL_SCOPE,
    );
  });

  it('passes search param to listAll', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listAll.mockResolvedValue({ users: [], total: 0 });

    const { GET } = await import('./route');
    await GET(makeRequest('alice'), mockContext);

    expect(mocks.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'alice' }),
      GLOBAL_SCOPE,
    );
  });

  it('SEC-26 regression: an ABAC-authorized non-platform-admin gets the canonical organization scope forwarded, never null or a legacy { tenantId }', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'owner-1', email: 'owner@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);

    const { GET } = await import('./route');
    await GET(makeRequest(), mockContext);

    expect(mocks.listAll).toHaveBeenCalledWith(expect.anything(), ORG_SCOPE);
  });

  it('an ordinary canonical scope denial (null) returns the existing empty-list shape and never calls the service', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'owner-1', email: 'owner@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(null);

    const { GET } = await import('./route');
    const res = await GET(makeRequest(undefined, 25, 0), mockContext);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { users: unknown[]; total: number; limit: number; offset: number };
    };
    expect(body.data).toEqual({ users: [], total: 0, limit: 25, offset: 0 });
    expect(mocks.listAll).not.toHaveBeenCalled();
  });

  it('a scope invariant failure surfaces as a generic 500 and never calls the service', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveScope.mockRejectedValue(new AdminUsersScopeInvariantError());

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), mockContext);

    expect(res.status).toBe(500);
    expect(mocks.listAll).not.toHaveBeenCalled();
  });
});
