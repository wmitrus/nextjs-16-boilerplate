import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { FeatureFlagNotFoundError } from '@/modules/feature-flags/domain/errors';
import { DrizzleFeatureFlagAdminService } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

const FLAG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  resolveScope: vi.fn(),
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

vi.mock('../feature-flags-admin-scope', () => ({
  resolveFeatureFlagsAdminScope: mocks.resolveScope,
}));

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
  organizationId: null,
  enabled: true,
  description: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PLATFORM_SCOPE = { kind: 'platform-global' as const };
// Matches makeAllowedProvisioningAccess()'s default access.tenant.
const ORG_SCOPE = {
  kind: 'organization' as const,
  organizationId: 'tenant_test_1',
  tenantId: 'tenant_test_1',
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
    mocks.resolveScope.mockResolvedValue(PLATFORM_SCOPE);
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

  it('returns 404 when scope derivation legitimately denies membership (no valid scope at all)', async () => {
    mocks.resolveScope.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: true }),
      makeContext(),
    );
    expect(res.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
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
      PLATFORM_SCOPE,
    );
    const body = await res.json();
    expect(body.data.flag.enabled).toBe(false);
  });

  it('REGRESSION: audit event uses the mutated flag’s LEGACY tenant_id, never the canonical scope tenant', async () => {
    // OZI-71 FF·D final review — the Audit subsystem is not yet on the
    // canonical model (see the identical, fully-explained note on the
    // create handler in `route.ts`). `scope.tenantId` (the canonical
    // parent tenant that authorized this mutation) and the returned DTO's
    // legacy `tenant_id` are deliberately DIFFERENT values here, to prove
    // the audit path reads the legacy one and canonical scope containment
    // (already exercised by the SQL containment suite) is untouched by
    // this choice.
    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);
    const LEGACY_SHADOW_VALUE = 'legacy-shadow-value-unrelated-to-canonical';
    mocks.update.mockResolvedValue({
      ...MOCK_FLAG,
      tenantId: LEGACY_SHADOW_VALUE,
    });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: false }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    // Canonical mutation containment is unaffected: the same-statement
    // scope predicate still ran with the real canonical scope.
    expect(mocks.update).toHaveBeenCalledWith(
      FLAG_ID,
      expect.anything(),
      ORG_SCOPE,
    );
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: LEGACY_SHADOW_VALUE }),
    );
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: ORG_SCOPE.tenantId }),
    );
  });

  it('attributes a platform-global-scoped update’s audit event to tenantId: null', async () => {
    mocks.resolveScope.mockResolvedValue(PLATFORM_SCOPE);
    mocks.update.mockResolvedValue({ ...MOCK_FLAG, tenantId: null });

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeRequest('PATCH', { enabled: false }),
      makeContext(),
    );
    expect(res.status).toBe(200);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null }),
    );
  });

  it('SEC-26: scopes the update to organization scope for an ABAC-authorized non-platform-admin', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);
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
      ORG_SCOPE,
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
    mocks.resolveScope.mockResolvedValue(PLATFORM_SCOPE);
  });

  it('returns 400 for a malformed (non-UUID) id before touching the DB (SEC-23)', async () => {
    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext('bad-id'));
    expect(res.status).toBe(400);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when scope derivation legitimately denies membership (no valid scope at all)', async () => {
    mocks.resolveScope.mockResolvedValue(null);

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(404);
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
    expect(mocks.delete).toHaveBeenCalledWith(FLAG_ID, PLATFORM_SCOPE);
  });

  it('SEC-26: scopes the delete to organization scope for an ABAC-authorized non-platform-admin', async () => {
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);
    mocks.delete.mockResolvedValue(MOCK_FLAG);

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith(FLAG_ID, ORG_SCOPE);
  });

  it('REGRESSION: audit event uses the deleted flag’s LEGACY tenant_id, never the canonical scope tenant', async () => {
    mocks.resolveScope.mockResolvedValue(ORG_SCOPE);
    const LEGACY_SHADOW_VALUE = 'legacy-shadow-value-unrelated-to-canonical';
    mocks.delete.mockResolvedValue({
      ...MOCK_FLAG,
      tenantId: LEGACY_SHADOW_VALUE,
    });

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith(FLAG_ID, ORG_SCOPE);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: LEGACY_SHADOW_VALUE }),
    );
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: ORG_SCOPE.tenantId }),
    );
  });

  it('attributes a platform-global-scoped delete’s audit event to tenantId: null', async () => {
    mocks.resolveScope.mockResolvedValue(PLATFORM_SCOPE);
    mocks.delete.mockResolvedValue({ ...MOCK_FLAG, tenantId: null });

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest('DELETE'), makeContext());
    expect(res.status).toBe(200);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null }),
    );
  });
});
