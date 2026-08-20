import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { DuplicateFeatureFlagError } from '@/modules/feature-flags/domain/errors';
import { DrizzleFeatureFlagAdminService } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  listAll: vi.fn(),
  listForTenant: vi.fn(),
  create: vi.fn(),
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
  '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService',
  () => ({
    DrizzleFeatureFlagAdminService: vi.fn(),
  }),
);

vi.mock('@/core/env', () => ({
  env: {
    FEATURE_FLAG_PROVIDER: 'db',
  },
}));

function makeGetRequest() {
  return new NextRequest('http://localhost/api/admin/feature-flags');
}

function makePostRequest(body?: unknown) {
  return new NextRequest('http://localhost/api/admin/feature-flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const mockContext = { params: Promise.resolve({}) };

const TEST_FLAG = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  key: 'my-flag',
  tenantId: null,
  enabled: true,
  description: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('GET /api/admin/feature-flags', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    vi.mocked(DrizzleFeatureFlagAdminService).mockImplementation(function () {
      return {
        listAll: mocks.listAll,
        listForTenant: mocks.listForTenant,
        create: mocks.create,
      } as unknown as DrizzleFeatureFlagAdminService;
    });
  });

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

  it('returns 200 with flags and activeProvider for env-based admin, using the unscoped listAll', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listAll.mockResolvedValue([TEST_FLAG]);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { flags: unknown[]; activeProvider: string };
    };
    expect(body.data.flags).toHaveLength(1);
    expect(body.data.activeProvider).toBe('db');
    expect(mocks.listAll).toHaveBeenCalledTimes(1);
    expect(mocks.listForTenant).not.toHaveBeenCalled();
  });

  it('SEC-26: uses the tenant-scoped listForTenant for an ABAC-authorized non-platform-admin, never the unscoped listAll', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.listForTenant.mockResolvedValue([TEST_FLAG]);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);
    expect(mocks.listForTenant).toHaveBeenCalledWith('tenant_test_1');
    expect(mocks.listAll).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/feature-flags', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    vi.mocked(DrizzleFeatureFlagAdminService).mockImplementation(function () {
      return {
        listAll: mocks.listAll,
        listForTenant: mocks.listForTenant,
        create: mocks.create,
      } as unknown as DrizzleFeatureFlagAdminService;
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.resolveAccess.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Auth required',
      diagnostics: {},
    });

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ key: 'x', tenantId: null, enabled: true }),
      mockContext,
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated but not admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ key: 'x', tenantId: null, enabled: true }),
      mockContext,
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for an invalid payload', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { POST } = await import('./route');
    const res = await POST(makePostRequest({ key: '' }), mockContext);
    expect(res.status).toBe(400);
  });

  it('returns 409 when the flag key/tenant combination already exists', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.create.mockRejectedValue(new DuplicateFeatureFlagError());

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ key: 'dup', tenantId: null, enabled: true }),
      mockContext,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DUPLICATE_FEATURE_FLAG');
  });

  it('returns 201 with the created flag on success', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.create.mockResolvedValue(TEST_FLAG);

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ key: 'my-flag', tenantId: null, enabled: true }),
      mockContext,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.flag.key).toBe('my-flag');
  });

  describe('SEC-26 regression: ABAC-authorized non-platform-admin scope constraint', () => {
    beforeEach(() => {
      mocks.isEnvAdmin.mockReturnValue(false);
      mocks.registry.set(AUTHORIZATION.SERVICE, {
        can: vi.fn().mockResolvedValue(true),
      });
    });

    it('rejects creating a global (null tenantId) flag', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({ key: 'x', tenantId: null, enabled: true }),
        mockContext,
      );
      expect(res.status).toBe(403);
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('rejects creating a flag scoped to another tenant', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({
          key: 'x',
          tenantId: 'some-other-tenant',
          enabled: true,
        }),
        mockContext,
      );
      expect(res.status).toBe(403);
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("allows creating a flag scoped to the caller's own tenant", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.create.mockResolvedValue({
        ...TEST_FLAG,
        tenantId: 'tenant_test_1',
      });

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({
          key: 'x',
          tenantId: 'tenant_test_1',
          enabled: true,
        }),
        mockContext,
      );
      expect(res.status).toBe(201);
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant_test_1' }),
      );
    });
  });
});
