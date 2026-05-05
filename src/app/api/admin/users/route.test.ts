import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  listAll: vi.fn(),
  userRepo: {
    listAll: vi.fn(),
  },
  container: {
    resolve: vi.fn(),
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
    mocks.container.resolve.mockReturnValue(mocks.userRepo);
    mocks.userRepo.listAll.mockResolvedValue({
      users: TEST_USERS,
      total: 1,
    });
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
  });

  it('returns 403 when authenticated but not admin', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'user-1', email: 'notadmin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.container.resolve.mockReturnValue({
      can: vi.fn().mockResolvedValue(false),
    });

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), mockContext);
    expect(res.status).toBe(403);
  });

  it('returns 200 with user list for env-based admin', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.container.resolve.mockReturnValue(mocks.userRepo);
    mocks.userRepo.listAll.mockResolvedValue({ users: TEST_USERS, total: 1 });

    const { GET } = await import('./route');
    const res = await GET(makeRequest(), mockContext);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { users: unknown[]; total: number };
    };
    expect(body.data.users).toHaveLength(1);
    expect(body.data.total).toBe(1);
  });

  it('clamps limit to maximum of 100', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.container.resolve.mockReturnValue(mocks.userRepo);
    mocks.userRepo.listAll.mockResolvedValue({ users: [], total: 0 });

    const { GET } = await import('./route');
    await GET(makeRequest(undefined, 999), mockContext);

    expect(mocks.userRepo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('passes search param to listAll', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.container.resolve.mockReturnValue(mocks.userRepo);
    mocks.userRepo.listAll.mockResolvedValue({ users: [], total: 0 });

    const { GET } = await import('./route');
    await GET(makeRequest('alice'), mockContext);

    expect(mocks.userRepo.listAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'alice' }),
    );
  });
});
