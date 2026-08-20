import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { AuditSettingNotFoundError } from '@/modules/audit-log/domain/errors';
import { DrizzleAuditLogSettingsAdminService } from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogSettingsAdminService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  listGlobalEffective: vi.fn(),
  listEffectiveForTenant: vi.fn(),
  upsert: vi.fn(),
  resetToDefault: vi.fn(),
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
  '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogSettingsAdminService',
  () => ({
    DrizzleAuditLogSettingsAdminService: vi.fn(),
  }),
);

function makeGetRequest() {
  return new NextRequest('http://localhost/api/admin/audit-log-settings');
}

function makeBodyRequest(method: 'PATCH' | 'DELETE', body?: unknown) {
  return new NextRequest('http://localhost/api/admin/audit-log-settings', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const mockContext = { params: Promise.resolve({}) };

const TEST_SETTING = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  category: 'auth',
  tenantId: null,
  source: 'global',
  enabled: true,
  retentionDays: 180,
  sampleRate: null,
  captureInputOnSuccess: false,
  updatedByUserId: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.registry.clear();
  mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
  vi.mocked(DrizzleAuditLogSettingsAdminService).mockImplementation(
    function () {
      return {
        listGlobalEffective: mocks.listGlobalEffective,
        listEffectiveForTenant: mocks.listEffectiveForTenant,
        upsert: mocks.upsert,
        resetToDefault: mocks.resetToDefault,
      } as unknown as DrizzleAuditLogSettingsAdminService;
    },
  );
});

describe('GET /api/admin/audit-log-settings', () => {
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

  it('returns 200 with settings for env-based admin, using the unscoped listGlobalEffective', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listGlobalEffective.mockResolvedValue([TEST_SETTING]);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        settings: unknown[];
        scope: { isPlatformAdmin: boolean; tenantId: string | null };
      };
    };
    expect(body.data.settings).toHaveLength(1);
    expect(mocks.listGlobalEffective).toHaveBeenCalledTimes(1);
    expect(mocks.listEffectiveForTenant).not.toHaveBeenCalled();
    expect(body.data.scope).toEqual({ isPlatformAdmin: true, tenantId: null });
  });

  it('SEC-26: uses the tenant-scoped listEffectiveForTenant for an ABAC-authorized non-platform-admin, never the unscoped listGlobalEffective', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.listEffectiveForTenant.mockResolvedValue([TEST_SETTING]);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);
    expect(mocks.listEffectiveForTenant).toHaveBeenCalledWith('tenant_test_1');
    expect(mocks.listGlobalEffective).not.toHaveBeenCalled();

    const body = (await res.json()) as {
      data: { scope: { isPlatformAdmin: boolean; tenantId: string | null } };
    };
    expect(body.data.scope).toEqual({
      isPlatformAdmin: false,
      tenantId: 'tenant_test_1',
    });
  });
});

describe('PATCH /api/admin/audit-log-settings', () => {
  const validBody = {
    category: 'auth',
    tenantId: null,
    enabled: true,
    retentionDays: 180,
    captureInputOnSuccess: false,
  };

  it('returns 401 when unauthenticated', async () => {
    mocks.resolveAccess.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Auth required',
      diagnostics: {},
    });

    const { PATCH } = await import('./route');
    const res = await PATCH(makeBodyRequest('PATCH', validBody), mockContext);
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { PATCH } = await import('./route');
    const res = await PATCH(makeBodyRequest('PATCH', validBody), mockContext);
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid payload (unknown category)', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeBodyRequest('PATCH', { ...validBody, category: 'not-real' }),
      mockContext,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when retentionDays is outside the allowed bounds', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeBodyRequest('PATCH', { ...validBody, retentionDays: 1 }),
      mockContext,
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 with the updated setting on success', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.upsert.mockResolvedValue(TEST_SETTING);

    const { PATCH } = await import('./route');
    const res = await PATCH(makeBodyRequest('PATCH', validBody), mockContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.setting.category).toBe('auth');
  });

  describe('SEC-26 regression: ABAC-authorized non-platform-admin scope constraint', () => {
    beforeEach(() => {
      mocks.isEnvAdmin.mockReturnValue(false);
      mocks.registry.set(AUTHORIZATION.SERVICE, {
        can: vi.fn().mockResolvedValue(true),
      });
    });

    it("ignores a requested global (null tenantId) setting and derives the caller's own tenant instead", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.upsert.mockResolvedValue({
        ...TEST_SETTING,
        tenantId: 'tenant_test_1',
      });

      const { PATCH } = await import('./route');
      const res = await PATCH(
        makeBodyRequest('PATCH', { ...validBody, tenantId: null }),
        mockContext,
      );
      expect(res.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant_test_1' }),
        { tenantId: 'tenant_test_1' },
      );
    });

    it("ignores a requested foreign tenantId and derives the caller's own tenant instead", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.upsert.mockResolvedValue({
        ...TEST_SETTING,
        tenantId: 'tenant_test_1',
      });

      const { PATCH } = await import('./route');
      const res = await PATCH(
        makeBodyRequest('PATCH', {
          ...validBody,
          tenantId: 'some-other-tenant',
        }),
        mockContext,
      );
      expect(res.status).toBe(200);
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant_test_1' }),
        { tenantId: 'tenant_test_1' },
      );
    });
  });
});

describe('DELETE /api/admin/audit-log-settings', () => {
  const validBody = { category: 'auth', tenantId: null };

  it('returns 403 when authenticated but not admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { DELETE } = await import('./route');
    const res = await DELETE(makeBodyRequest('DELETE', validBody), mockContext);
    expect(res.status).toBe(403);
  });

  it('returns 404 when there is no override row to reset', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resetToDefault.mockRejectedValue(new AuditSettingNotFoundError());

    const { DELETE } = await import('./route');
    const res = await DELETE(makeBodyRequest('DELETE', validBody), mockContext);
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful reset', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resetToDefault.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const res = await DELETE(makeBodyRequest('DELETE', validBody), mockContext);
    expect(res.status).toBe(200);
  });

  it("SEC-26: an ABAC-authorized non-platform-admin's foreign tenantId is derived to their own tenant, not trusted", async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resetToDefault.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const res = await DELETE(
      makeBodyRequest('DELETE', {
        category: 'auth',
        tenantId: 'some-other-tenant',
      }),
      mockContext,
    );
    expect(res.status).toBe(200);
    expect(mocks.resetToDefault).toHaveBeenCalledWith('auth', 'tenant_test_1', {
      tenantId: 'tenant_test_1',
    });
  });
});
