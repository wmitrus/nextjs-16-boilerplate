import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  userRepo: {
    findById: vi.fn(),
    updateProfile: vi.fn(),
    deactivate: vi.fn(),
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

function makeRequest(method: 'GET' | 'PATCH', body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/users/${USER_ID}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeContext(id: string = USER_ID) {
  return { params: Promise.resolve({ id }) };
}

const MOCK_USER = {
  id: USER_ID,
  email: 'bob@example.com',
  displayName: 'Bob',
  onboardingComplete: false,
  createdAt: new Date('2026-01-01'),
};

describe('GET /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.container.resolve.mockReturnValue(mocks.userRepo);
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
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
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
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.userRepo.findById.mockResolvedValue(null);

    const { GET } = await import('./route');
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 200 with user data when found', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.userRepo.findById.mockResolvedValue(MOCK_USER);

    const { GET } = await import('./route');
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { user: { id: string } } };
    expect(body.data.user.id).toBe(USER_ID);
  });
});

describe('PATCH /api/admin/users/[id] — update displayName', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.container.resolve.mockReturnValue(mocks.userRepo);
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest(`http://localhost/api/admin/users/${USER_ID}`, {
      method: 'PATCH',
      body: 'not-json',
    });
    const { PATCH } = await import('./route');
    const res = await PATCH(req, makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing displayName', async () => {
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest('PATCH', {}), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 404 when user not found', async () => {
    mocks.userRepo.findById.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { displayName: 'New Name' }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and updates displayName', async () => {
    mocks.userRepo.findById.mockResolvedValue(MOCK_USER);
    mocks.userRepo.updateProfile.mockResolvedValue(undefined);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { displayName: 'New Name' }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.userRepo.updateProfile).toHaveBeenCalledWith(USER_ID, {
      displayName: 'New Name',
    });
  });
});

describe('PATCH /api/admin/users/[id] — deactivate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.container.resolve.mockReturnValue(mocks.userRepo);
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
  });

  it('returns 404 when user to deactivate not found', async () => {
    mocks.userRepo.findById.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and calls deactivate when user found', async () => {
    mocks.userRepo.findById.mockResolvedValue(MOCK_USER);
    mocks.userRepo.deactivate.mockResolvedValue(undefined);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.userRepo.deactivate).toHaveBeenCalledWith(
      USER_ID,
      expect.any(Date),
    );
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.resolveAccess.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Auth required',
      diagnostics: {},
    });
    mocks.isEnvAdmin.mockReturnValue(false);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });
});
