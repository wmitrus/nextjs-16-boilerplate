import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { FeatureFlagNotFoundError } from '@/modules/feature-flags/domain/errors';
import { DrizzleFeatureFlagAdminService } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const FLAG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
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

vi.mock(
  '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService',
  () => ({
    DrizzleFeatureFlagAdminService: vi.fn(),
  }),
);

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

function makeRequest(method: 'PATCH' | 'DELETE', body?: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/feature-flags/${FLAG_ID}`,
    {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
  );
}

function makeContext(id: string = FLAG_ID) {
  return { params: Promise.resolve({ id }) };
}

const MOCK_FLAG = {
  id: FLAG_ID,
  key: 'my-flag',
  tenantId: null,
  enabled: true,
  description: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('PATCH /api/admin/feature-flags/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    vi.mocked(DrizzleFeatureFlagAdminService).mockImplementation(function () {
      return {
        update: mocks.update,
        delete: mocks.delete,
      } as unknown as DrizzleFeatureFlagAdminService;
    });
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
  });

  it('returns 400 for a malformed (non-UUID) id before touching the DB (SEC-23)', async () => {
    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: true }),
      makeContext('not-a-uuid'),
    );
    expect(res.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
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
      makeRequest('PATCH', { enabled: true }),
      makeContext(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: true }),
      makeContext(),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest(
      `http://localhost/api/admin/feature-flags/${FLAG_ID}`,
      { method: 'PATCH', body: 'not-json' },
    );
    const { PATCH } = await import('./route');
    const res = await PATCH(req, makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 400 when neither enabled nor description is provided', async () => {
    const { PATCH } = await import('./route');
    const res = await PATCH(makeRequest('PATCH', {}), makeContext());
    expect(res.status).toBe(400);
  });

  it('returns 404 when the flag does not exist', async () => {
    mocks.update.mockRejectedValue(new FeatureFlagNotFoundError());

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: true }),
      makeContext(),
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 and updates the flag', async () => {
    mocks.update.mockResolvedValue({ ...MOCK_FLAG, enabled: false });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: false }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      FLAG_ID,
      {
        enabled: false,
        description: undefined,
      },
      null,
    );
    const body = await res.json();
    expect(body.data.flag.enabled).toBe(false);
  });

  it('attributes the audit event to the updated flag’s own tenant, not the platform admin’s active tenant', async () => {
    // The caller's active tenant is 'tenant_test_1' (makeAllowedProvisioningAccess's
    // default); a platform admin can update a flag belonging to a different
    // tenant, and the audit event must reflect the flag's real scope.
    mocks.update.mockResolvedValue({ ...MOCK_FLAG, tenantId: 'tenant_other' });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: false }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_other' }),
    );
  });

  it("SEC-26: scopes the update to the caller's own tenant for an ABAC-authorized non-platform-admin", async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.update.mockResolvedValue({ ...MOCK_FLAG, enabled: false });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: false }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      FLAG_ID,
      { enabled: false, description: undefined },
      { tenantId: 'tenant_test_1' },
    );
  });
});

describe('DELETE /api/admin/feature-flags/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    vi.mocked(DrizzleFeatureFlagAdminService).mockImplementation(function () {
      return {
        update: mocks.update,
        delete: mocks.delete,
      } as unknown as DrizzleFeatureFlagAdminService;
    });
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
  });

  it('returns 400 for a malformed (non-UUID) id before touching the DB (SEC-23)', async () => {
    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext('bad-id'));
    expect(res.status).toBe(400);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the flag does not exist', async () => {
    mocks.delete.mockRejectedValue(new FeatureFlagNotFoundError());

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(404);
  });

  it('returns 200 and deletes the flag', async () => {
    mocks.delete.mockResolvedValue(MOCK_FLAG);

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith(FLAG_ID, null);
  });

  it("SEC-26: scopes the delete to the caller's own tenant for an ABAC-authorized non-platform-admin", async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.delete.mockResolvedValue(MOCK_FLAG);

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith(FLAG_ID, {
      tenantId: 'tenant_test_1',
    });
  });

  it('attributes the audit event to the deleted flag’s own tenant, not the platform admin’s active tenant', async () => {
    mocks.delete.mockResolvedValue({ ...MOCK_FLAG, tenantId: 'tenant_other' });

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(200);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_other' }),
    );
  });
});
