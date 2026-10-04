import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import {
  AuditSettingAliasConflictError,
  AuditSettingNotFoundError,
} from '@/modules/audit-log/domain/errors';
import { DrizzleAuditLogSettingsAdminService } from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogSettingsAdminService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  list: vi.fn(),
  upsertCanonical: vi.fn(),
  resetCanonical: vi.fn(),
  resolveAdminScope: vi.fn(),
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

vi.mock('./audit-log-settings-admin-scope', () => ({
  resolveAuditLogSettingsAdminScope: mocks.resolveAdminScope,
}));

vi.mock(
  '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogSettingsAdminService',
  () => ({
    DrizzleAuditLogSettingsAdminService: vi.fn(),
  }),
);

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

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

const ORGANIZATION_SCOPE = {
  kind: 'organization',
  organizationId: '15000000-0000-4000-8000-000000000001',
  tenantId: '10000000-0000-4000-8000-000000000001',
} as const;

const PLATFORM_SCOPE = {
  kind: 'platform-global',
} as const;

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
  mocks.resolveAdminScope.mockImplementation(
    async (input: { platformTargetOrganizationId?: string | null }) => ({
      outcome: 'resolved' as const,
      scope:
        input.platformTargetOrganizationId === null
          ? PLATFORM_SCOPE
          : ORGANIZATION_SCOPE,
    }),
  );
  mocks.registry.clear();
  mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);

  vi.mocked(DrizzleAuditLogSettingsAdminService).mockImplementation(
    function () {
      return {
        list: mocks.list,
        upsertCanonical: mocks.upsertCanonical,
        resetCanonical: mocks.resetCanonical,
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
    expect(mocks.resolveAdminScope).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('uses platform-global canonical scope for an env-based platform admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveAdminScope.mockResolvedValue({
      outcome: 'resolved',
      scope: PLATFORM_SCOPE,
    });
    mocks.list.mockResolvedValue([TEST_SETTING]);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(200);

    expect(mocks.resolveAdminScope).toHaveBeenCalledWith({
      access: expect.any(Object),
      db: mocks.db,
      authProvider: expect.any(String),
    });

    expect(mocks.list).toHaveBeenCalledWith(PLATFORM_SCOPE);

    const body = (await res.json()) as {
      data: {
        settings: unknown[];
        scope: {
          isPlatformAdmin: boolean;
          organizationId: string | null;
        };
      };
    };

    expect(body.data.settings).toHaveLength(1);
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

    mocks.resolveAdminScope.mockResolvedValue({
      outcome: 'resolved',
      scope: ORGANIZATION_SCOPE,
    });
    mocks.list.mockResolvedValue([TEST_SETTING]);

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(ORGANIZATION_SCOPE);

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
      organizationId: ORGANIZATION_SCOPE.organizationId,
    });
  });

  it('maps a canonical membership denial to an empty list with no legacy fallback', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);

    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });

    mocks.resolveAdminScope.mockResolvedValue({
      outcome: 'denied',
    });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);

    expect(res.status).toBe(200);
    expect(mocks.list).not.toHaveBeenCalled();

    const body = (await res.json()) as {
      data: {
        settings: unknown[];
        scope: {
          isPlatformAdmin: boolean;
          organizationId: string | null;
        };
      };
    };

    expect(body.data.settings).toEqual([]);
    expect(body.data.scope).toEqual({
      isPlatformAdmin: false,
      organizationId: null,
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
    mocks.upsertCanonical.mockResolvedValue(TEST_SETTING);

    const { PATCH } = await import('./route');
    const res = await PATCH(makeBodyRequest('PATCH', validBody), mockContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.setting.category).toBe('auth');
    // Recorded under 'rbac_policy', never under the category being changed
    // -- see the route's own comment (Codex review, PR #72).
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'audit_log_setting.update',
        outcome: 'success',
        targetType: 'audit_log_setting',
        targetId: 'auth',
      }),
    );
  });

  it('returns 409 when the requested organization alias is occupied by another legacy setting row', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveAdminScope.mockResolvedValueOnce({
      outcome: 'resolved',
      scope: {
        kind: 'organization',
        organizationId: '15000000-0000-4000-8000-000000000001',
        tenantId: '10000000-0000-4000-8000-000000000001',
      },
    });
    mocks.upsertCanonical.mockRejectedValue(
      new AuditSettingAliasConflictError(),
    );

    const { PATCH } = await import('./route');
    const res = await PATCH(
      makeBodyRequest('PATCH', {
        ...validBody,
        tenantId: 'org_provider_acme',
      }),
      mockContext,
    );

    expect(res.status).toBe(409);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
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
      mocks.upsertCanonical.mockResolvedValue({
        ...TEST_SETTING,
        tenantId: 'tenant_test_1',
      });

      const { PATCH } = await import('./route');
      const res = await PATCH(
        makeBodyRequest('PATCH', { ...validBody, tenantId: null }),
        mockContext,
      );
      expect(res.status).toBe(200);
      expect(mocks.upsertCanonical).toHaveBeenCalledTimes(1);

      const [input, scope] = mocks.upsertCanonical.mock.calls[0]!;
      expect(input).not.toHaveProperty('tenantId');
      expect(input).toMatchObject({
        category: 'auth',
        enabled: true,
      });
      expect(scope).toEqual(ORGANIZATION_SCOPE);
    });

    it("ignores a requested foreign tenantId and derives the caller's own tenant instead", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.upsertCanonical.mockResolvedValue({
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
      expect(mocks.upsertCanonical).toHaveBeenCalledTimes(1);

      const [input, scope] = mocks.upsertCanonical.mock.calls[0]!;
      expect(input).not.toHaveProperty('tenantId');
      expect(input).toMatchObject({
        category: 'auth',
        enabled: true,
      });
      expect(scope).toEqual(ORGANIZATION_SCOPE);
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
    mocks.resetCanonical.mockRejectedValue(new AuditSettingNotFoundError());

    const { DELETE } = await import('./route');
    const res = await DELETE(makeBodyRequest('DELETE', validBody), mockContext);
    expect(res.status).toBe(404);
  });

  it('normalizes a provider alias to the internal organization key before reset', async () => {
    const providerAlias = 'org_provider_acme';
    const internalOrganizationId = '15000000-0000-4000-8000-000000000001';
    const parentTenantId = '10000000-0000-4000-8000-000000000001';

    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveAdminScope.mockResolvedValueOnce({
      outcome: 'resolved',
      scope: {
        kind: 'organization',
        organizationId: internalOrganizationId,
        tenantId: parentTenantId,
      },
    });
    mocks.resetCanonical.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const res = await DELETE(
      makeBodyRequest('DELETE', {
        category: 'auth',
        tenantId: providerAlias,
      }),
      mockContext,
    );

    expect(res.status).toBe(200);
    expect(mocks.resetCanonical).toHaveBeenCalledWith('auth', {
      kind: 'organization',
      organizationId: internalOrganizationId,
      tenantId: parentTenantId,
    });
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        legacyTenantId: internalOrganizationId,
        writeScope: {
          kind: 'organization',
          organizationId: internalOrganizationId,
          tenantId: parentTenantId,
        },
      }),
    );
  });

  it('returns 409 when canonical and legacy alias rows collide during reset', async () => {
    const providerAlias = 'org_provider_acme';
    const internalOrganizationId = '15000000-0000-4000-8000-000000000001';
    const parentTenantId = '10000000-0000-4000-8000-000000000001';

    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveAdminScope.mockResolvedValueOnce({
      outcome: 'resolved',
      scope: {
        kind: 'organization',
        organizationId: internalOrganizationId,
        tenantId: parentTenantId,
      },
    });
    mocks.resetCanonical.mockRejectedValue(
      new AuditSettingAliasConflictError(),
    );

    const { DELETE } = await import('./route');
    const res = await DELETE(
      makeBodyRequest('DELETE', {
        category: 'auth',
        tenantId: providerAlias,
      }),
      mockContext,
    );

    expect(res.status).toBe(409);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 200 on successful reset', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resetCanonical.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const res = await DELETE(makeBodyRequest('DELETE', validBody), mockContext);
    expect(res.status).toBe(200);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'audit_log_setting.reset',
        outcome: 'success',
        targetType: 'audit_log_setting',
        targetId: 'auth',
      }),
    );
  });

  it("SEC-26: an ABAC-authorized non-platform-admin's foreign tenantId is derived to their own tenant, not trusted", async () => {
    const internalOrganizationId = '15000000-0000-4000-8000-000000000001';

    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: internalOrganizationId,
          tenantId: internalOrganizationId,
          userId: 'user_test_1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resetCanonical.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const res = await DELETE(
      makeBodyRequest('DELETE', {
        category: 'auth',
        tenantId: 'some-other-tenant',
      }),
      mockContext,
    );
    expect(res.status).toBe(200);
    expect(mocks.resetCanonical).toHaveBeenCalledWith(
      'auth',
      ORGANIZATION_SCOPE,
    );
  });
});
