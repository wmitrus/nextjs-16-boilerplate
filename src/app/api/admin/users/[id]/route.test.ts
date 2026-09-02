import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { DrizzleAdminUsersService } from '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  findById: vi.fn(),
  updateProfile: vi.fn(),
  deactivate: vi.fn(),
  db: {},
  registry: new Map<symbol, unknown>(),
  container: {
    resolve: vi.fn((token: symbol) => mocks.registry.get(token)),
  },
  recordAdminAuditEvent: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

vi.mock('../users-admin-scope', () => ({
  resolveAdminUsersScope: mocks.resolveScope,
  AdminUsersScopeInvariantError,
}));

vi.mock(
  '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService',
  () => ({
    DrizzleAdminUsersService: vi.fn(),
  }),
);

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

function setupService() {
  mocks.registry.clear();
  mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
  vi.mocked(DrizzleAdminUsersService).mockImplementation(function () {
    return {
      findById: mocks.findById,
      updateProfile: mocks.updateProfile,
      deactivate: mocks.deactivate,
    } as unknown as DrizzleAdminUsersService;
  });
}

describe('GET /api/admin/users/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.resolveScope.mockResolvedValue(GLOBAL_SCOPE);
    setupService();
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

  it('returns 400 for a malformed (non-UUID) id before touching scope or the DB (SEC-23)', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);

    const { GET } = await import('./route');
    const res = await GET(makeRequest('GET'), makeContext('not-a-uuid'));
    expect(res.status).toBe(400);
    expect(mocks.resolveScope).not.toHaveBeenCalled();
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('returns 403 when not admin (before scope resolution)', async () => {
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
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(403);
    expect(mocks.resolveScope).not.toHaveBeenCalled();
  });

  it('returns 404 when user not found', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.findById.mockResolvedValue(null);

    const { GET } = await import('./route');
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 200 and forwards the platform-global scope when found', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.findById.mockResolvedValue(MOCK_USER);

    const { GET } = await import('./route');
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { user: { id: string } } };
    expect(body.data.user.id).toBe(USER_ID);
    expect(mocks.findById).toHaveBeenCalledWith(USER_ID, GLOBAL_SCOPE);
  });

  it(
    'SEC-26 regression: an ABAC-authorized non-platform-admin lookup is ' +
      'scoped to the canonical organization scope, and an out-of-scope user ' +
      '404s exactly like a nonexistent id -- never a distinguishing 403',
    async () => {
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
      mocks.findById.mockResolvedValue(null);

      const { GET } = await import('./route');
      const res = await GET(makeRequest('GET'), makeContext());

      expect(mocks.findById).toHaveBeenCalledWith(USER_ID, ORG_SCOPE);
      expect(res.status).toBe(404);
    },
  );

  it('an ordinary canonical scope denial (null) returns the same 404 as a nonexistent user and never calls the service', async () => {
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
    const res = await GET(makeRequest('GET'), makeContext());

    expect(res.status).toBe(404);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('a scope invariant failure surfaces as a generic 500', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveScope.mockRejectedValue(new AdminUsersScopeInvariantError());

    const { GET } = await import('./route');
    const res = await GET(makeRequest('GET'), makeContext());
    expect(res.status).toBe(500);
    expect(mocks.findById).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/users/[id] — update displayName', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.resolveScope.mockResolvedValue(GLOBAL_SCOPE);
    setupService();
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
  });

  it('returns 400 for a malformed (non-UUID) id before touching scope or the DB (SEC-23)', async () => {
    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { displayName: 'New Name' }),
      makeContext('not-a-uuid'),
    );
    expect(res.status).toBe(400);
    expect(mocks.resolveScope).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
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
    mocks.updateProfile.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { displayName: 'New Name' }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200, forwards the canonical scope, and records the audit event with the unchanged legacy tenantId', async () => {
    mocks.updateProfile.mockResolvedValue({
      ...MOCK_USER,
      displayName: 'New Name',
    });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { displayName: 'New Name' }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith(
      USER_ID,
      { displayName: 'New Name' },
      GLOBAL_SCOPE,
    );
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'admin_access',
        action: 'user.update',
        outcome: 'success',
        targetType: 'user',
        targetId: USER_ID,
      }),
    );
  });

  it('SEC-26 regression: forwards the canonical organization scope for an ABAC-authorized non-platform-admin, and a foreign-scope target 404s', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);
    mocks.updateProfile.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { displayName: 'New Name' }),
      makeContext(),
    );

    expect(mocks.updateProfile).toHaveBeenCalledWith(
      USER_ID,
      { displayName: 'New Name' },
      ORG_SCOPE,
    );
    expect(res.status).toBe(404);
  });

  it('an ordinary canonical scope denial (null) 404s and never calls the service', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { displayName: 'New Name' }),
      makeContext(),
    );

    expect(res.status).toBe(404);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/users/[id] — deactivate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.resolveScope.mockResolvedValue(GLOBAL_SCOPE);
    setupService();
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'admin@test.dev' },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
  });

  it('returns 400 for a malformed (non-UUID) id before touching scope or the DB (SEC-23)', async () => {
    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext('not-a-uuid'),
    );
    expect(res.status).toBe(400);
    expect(mocks.resolveScope).not.toHaveBeenCalled();
    expect(mocks.deactivate).not.toHaveBeenCalled();
  });

  it('returns 404 when user to deactivate not found', async () => {
    mocks.deactivate.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200, forwards the canonical scope, and records the audit event unchanged', async () => {
    mocks.deactivate.mockResolvedValue({
      ...MOCK_USER,
      deactivatedAt: new Date(),
    });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.deactivate).toHaveBeenCalledWith(
      USER_ID,
      expect.any(Date),
      GLOBAL_SCOPE,
    );
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'admin_access',
        action: 'user.deactivate',
        outcome: 'success',
        targetType: 'user',
        targetId: USER_ID,
      }),
    );
  });

  it('SEC-26 regression: forwards the canonical organization scope for an ABAC-authorized non-platform-admin, and a foreign-scope target 404s', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);
    mocks.deactivate.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext(),
    );

    expect(mocks.deactivate).toHaveBeenCalledWith(
      USER_ID,
      expect.any(Date),
      ORG_SCOPE,
    );
    expect(res.status).toBe(404);
  });

  it('an ordinary canonical scope denial (null) 404s and never calls the service', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { action: 'deactivate' }),
      makeContext(),
    );

    expect(res.status).toBe(404);
    expect(mocks.deactivate).not.toHaveBeenCalled();
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
