import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { DrizzleAuditLogReadService } from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogReadService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  listGlobal: vi.fn(),
  listForTenant: vi.fn(),
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
  tenantId: 'tenant_test_1',
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
  mocks.registry.clear();
  mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
  vi.mocked(DrizzleAuditLogReadService).mockImplementation(function () {
    return {
      listGlobal: mocks.listGlobal,
      listForTenant: mocks.listForTenant,
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
  });

  it('returns 400 for an invalid query (unknown category)', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest('?category=not-real'), mockContext);
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit exceeds sane bounds after coercion fails', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest('?limit=not-a-number'), mockContext);
    expect(res.status).toBe(400);
  });

  it('caps an oversized limit at 200 instead of rejecting it', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listGlobal.mockResolvedValue({ events: [], total: 0 });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest('?limit=5000'), mockContext);
    expect(res.status).toBe(200);
    expect(mocks.listGlobal).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ limit: 200 }),
    );
  });

  it('returns 200 using the unscoped listGlobal for an env-based platform admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listGlobal.mockResolvedValue({ events: [TEST_EVENT], total: 1 });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        events: unknown[];
        total: number;
        scope: { isPlatformAdmin: boolean; tenantId: string | null };
      };
    };
    expect(body.data.events).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(mocks.listGlobal).toHaveBeenCalledTimes(1);
    expect(mocks.listForTenant).not.toHaveBeenCalled();
    expect(body.data.scope).toEqual({ isPlatformAdmin: true, tenantId: null });
  });

  it('SEC-26: uses the tenant-scoped listForTenant for an ABAC-authorized non-platform-admin, never the unscoped listGlobal', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.listForTenant.mockResolvedValue({ events: [TEST_EVENT], total: 1 });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);
    expect(mocks.listForTenant).toHaveBeenCalledWith(
      'tenant_test_1',
      expect.any(Object),
      expect.any(Object),
    );
    expect(mocks.listGlobal).not.toHaveBeenCalled();

    const body = (await res.json()) as {
      data: { scope: { isPlatformAdmin: boolean; tenantId: string | null } };
    };
    expect(body.data.scope).toEqual({
      isPlatformAdmin: false,
      tenantId: 'tenant_test_1',
    });
  });

  it('passes through filters parsed from the query string', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listGlobal.mockResolvedValue({ events: [], total: 0 });

    const { GET } = await import('./route');
    const res = await GET(
      makeGetRequest(
        '?category=billing&outcome=failure&actorUserId=user-1&limit=10&offset=5',
      ),
      mockContext,
    );
    expect(res.status).toBe(200);
    expect(mocks.listGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'billing',
        outcome: 'failure',
        actorUserId: 'user-1',
      }),
      { limit: 10, offset: 5 },
    );
  });
});
