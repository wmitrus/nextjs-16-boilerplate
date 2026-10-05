import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { DrizzleAuditLogReadService } from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogReadService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const ORG_SCOPE = {
  kind: 'organization',
  organizationId: '15000000-0000-4000-8000-000000000001',
  tenantId: '10000000-0000-4000-8000-000000000001',
} as const;

const PLATFORM_SCOPE = { kind: 'platform-global' } as const;

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  resolveScope: vi.fn(),
  isEnvAdmin: vi.fn(),
  list: vi.fn(),
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

vi.mock('./audit-logs-admin-scope', () => ({
  resolveAuditLogsAdminScope: mocks.resolveScope,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => mocks.container,
}));

vi.mock(
  '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogReadService',
  () => ({
    DrizzleAuditLogReadService: vi.fn(),
  }),
);

function makeGetRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/audit-logs${query}`);
}

const mockContext = { params: Promise.resolve({}) };

const TEST_EVENT = {
  id: 1,
  occurredAt: '2026-01-01T00:00:00.000Z',
  category: 'auth',
  action: 'auth.signin_success',
  outcome: 'success',
  tenantId: 'legacy-compat-key',
  actorUserId: null,
  targetType: null,
  targetId: null,
  ip: null,
  userAgent: null,
  correlationId: null,
  requestId: null,
  metadata: null,
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.connection.mockResolvedValue(undefined);
  mocks.resolveScope.mockResolvedValue(ORG_SCOPE);

  mocks.registry.clear();
  mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);

  vi.mocked(DrizzleAuditLogReadService).mockImplementation(function () {
    return {
      list: mocks.list,
    } as unknown as DrizzleAuditLogReadService;
  });
});

describe('GET /api/admin/audit-logs', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.resolveAccess.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Auth required',
      diagnostics: {},
    });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);

    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(403);
    expect(mocks.resolveScope).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid query', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest('?category=not-real'), mockContext);

    expect(res.status).toBe(400);
  });

  it('returns 400 when limit coercion fails', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest('?limit=not-a-number'), mockContext);

    expect(res.status).toBe(400);
  });

  it('caps an oversized limit at 200', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveScope.mockResolvedValue(PLATFORM_SCOPE);
    mocks.list.mockResolvedValue({ events: [], total: 0 });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest('?limit=5000'), mockContext);

    expect(res.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(
      PLATFORM_SCOPE,
      expect.any(Object),
      expect.objectContaining({ limit: 200 }),
    );
  });

  it('uses explicit platform-global scope for a platform admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveScope.mockResolvedValue(PLATFORM_SCOPE);
    mocks.list.mockResolvedValue({
      events: [TEST_EVENT],
      total: 1,
    });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(200);
    expect(mocks.resolveScope).toHaveBeenCalledWith(
      expect.any(Object),
      mocks.db,
    );
    expect(mocks.list).toHaveBeenCalledWith(
      PLATFORM_SCOPE,
      expect.any(Object),
      { limit: 50, offset: 0 },
    );

    const body = (await res.json()) as {
      data: {
        events: unknown[];
        total: number;
        scope: {
          isPlatformAdmin: boolean;
          organizationId: string | null;
        };
      };
    };

    expect(body.data.events).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.scope).toEqual({
      isPlatformAdmin: true,
      organizationId: null,
    });
  });

  it('uses canonical organization scope for an ABAC-authorized ordinary admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);

    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });

    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);
    mocks.list.mockResolvedValue({
      events: [TEST_EVENT],
      total: 1,
    });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(200);

    expect(mocks.list).toHaveBeenCalledWith(ORG_SCOPE, expect.any(Object), {
      limit: 50,
      offset: 0,
    });

    const body = (await res.json()) as {
      data: {
        scope: {
          isPlatformAdmin: boolean;
          organizationId: string | null;
        };
      };
    };

    expect(body.data.scope).toEqual({
      isPlatformAdmin: false,
      organizationId: ORG_SCOPE.organizationId,
    });
  });

  it('maps a legitimate canonical membership denial to an empty page with no legacy fallback', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);

    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });

    mocks.resolveScope.mockResolvedValue(null);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(200);
    expect(mocks.list).not.toHaveBeenCalled();

    const body = (await res.json()) as {
      data: {
        events: unknown[];
        total: number;
        scope: {
          isPlatformAdmin: boolean;
          organizationId: string | null;
        };
      };
    };

    expect(body.data.events).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.scope).toEqual({
      isPlatformAdmin: false,
      organizationId: null,
    });
  });

  it('passes query filters through the canonical scoped service boundary', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveScope.mockResolvedValue(PLATFORM_SCOPE);
    mocks.list.mockResolvedValue({ events: [], total: 0 });

    const { GET } = await import('./route');
    const res = await GET(
      makeGetRequest(
        '?category=billing&outcome=failure&actorUserId=user-1&limit=10&offset=5',
      ),
      mockContext,
    );

    expect(res.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(
      PLATFORM_SCOPE,
      expect.objectContaining({
        category: 'billing',
        outcome: 'failure',
        actorUserId: 'user-1',
      }),
      { limit: 10, offset: 5 },
    );
  });
});
