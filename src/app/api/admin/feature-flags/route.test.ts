import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import {
  DuplicateFeatureFlagError,
  FeatureFlagCanonicalWriteInvariantError,
} from '@/modules/feature-flags/domain/errors';
import { DrizzleFeatureFlagAdminService } from '@/modules/feature-flags/infrastructure/drizzle/DrizzleFeatureFlagAdminService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  listAll: vi.fn(),
  listForTenant: vi.fn(),
  create: vi.fn(),
  resolveCanonical: vi.fn(),
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

vi.mock('@/core/env', () => ({
  env: {
    FEATURE_FLAG_PROVIDER: 'db',
    AUTH_PROVIDER: 'clerk',
  },
}));

vi.mock('./feature-flags-canonical-write', () => ({
  resolveCanonicalFeatureFlagWrite: mocks.resolveCanonical,
}));

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
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

/**
 * The realistic default canonical resolution for a create: an
 * organization-owned override. Matches what `resolveCanonicalFeatureFlagWrite`
 * actually returns for both an ordinary caller and a platform admin targeting a
 * real organization. Tests of the explicit platform-global path override this
 * with `{ kind: 'global' }` in-test.
 */
const ORG_FACTS = {
  kind: 'organization' as const,
  organizationId: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0',
  tenantId: 't0t0t0t0-t0t0-4t0t-8t0t-t0t0t0t0t0t0',
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
      data: {
        flags: unknown[];
        activeProvider: string;
        scope: { isPlatformAdmin: boolean; tenantId: string | null };
      };
    };
    expect(body.data.flags).toHaveLength(1);
    expect(body.data.activeProvider).toBe('db');
    expect(mocks.listAll).toHaveBeenCalledTimes(1);
    expect(mocks.listForTenant).not.toHaveBeenCalled();
    expect(body.data.scope).toEqual({ isPlatformAdmin: true, tenantId: null });
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

    const body = (await res.json()) as {
      data: { scope: { isPlatformAdmin: boolean; tenantId: string | null } };
    };
    // SEC-26 follow-up: the client needs this to render global rows as
    // read-only for a non-platform-admin, since listForTenant() above
    // includes global rows but the caller cannot mutate them.
    expect(body.data.scope).toEqual({
      isPlatformAdmin: false,
      tenantId: 'tenant_test_1',
    });
  });
});

describe('POST /api/admin/feature-flags', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    // FF·B: canonical resolution has its own suites (the real-DB seam +
    // service tests). Here it defaults to the realistic case -- an
    // organization-owned override -- and is overridden per-test where the
    // canonical outcome (explicit global, unresolvable target, invariant) is
    // what's under test.
    mocks.resolveCanonical.mockResolvedValue({
      outcome: 'resolved',
      facts: ORG_FACTS,
    });
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
    mocks.resolveCanonical.mockResolvedValue({
      outcome: 'resolved',
      facts: { kind: 'global' },
    });
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
    mocks.resolveCanonical.mockResolvedValue({
      outcome: 'resolved',
      facts: { kind: 'global' },
    });
    mocks.create.mockResolvedValue(TEST_FLAG);

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ key: 'my-flag', tenantId: null, enabled: true }),
      mockContext,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.flag.key).toBe('my-flag');
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'feature_flag',
        action: 'feature_flag.create',
        outcome: 'success',
        targetType: 'feature_flag',
        targetId: TEST_FLAG.id,
      }),
    );
  });

  it('attributes the audit event to the created flag’s own tenant, not the platform admin’s active tenant', async () => {
    // The caller's active tenant is 'tenant_test_1' (makeAllowedProvisioningAccess's
    // default), but a platform admin can create a flag for a different tenant
    // entirely -- the audit event must reflect the flag's real scope, or the
    // target tenant never sees the mutation in its own trail while an
    // unrelated tenant sees an event that never happened to it.
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.create.mockResolvedValue({ ...TEST_FLAG, tenantId: 'tenant_other' });

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({
        key: 'my-flag',
        tenantId: 'tenant_other',
        enabled: true,
      }),
      mockContext,
    );

    expect(res.status).toBe(201);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_other' }),
    );
  });

  describe('SEC-26 regression: ABAC-authorized non-platform-admin scope constraint', () => {
    beforeEach(() => {
      mocks.isEnvAdmin.mockReturnValue(false);
      mocks.registry.set(AUTHORIZATION.SERVICE, {
        can: vi.fn().mockResolvedValue(true),
      });
    });

    it("ignores a requested global (null tenantId) flag and derives the caller's own tenant instead", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.create.mockResolvedValue({
        ...TEST_FLAG,
        tenantId: 'tenant_test_1',
      });

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({ key: 'x', tenantId: null, enabled: true }),
        mockContext,
      );
      // Deriving (not rejecting) means the normal "Create flag" form -- which
      // defaults to an empty/null Tenant ID -- keeps working for an
      // ABAC-authorized non-platform-admin rather than always 403ing.
      expect(res.status).toBe(201);
      // FF·B: canonical resolution runs for the ABAC caller with their own
      // server-resolved active organization as the candidate -- never a
      // client-supplied value, never `isPlatformAdmin`.
      expect(mocks.resolveCanonical).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlatformAdmin: false,
          ordinaryActiveOrganizationId: 'tenant_test_1',
          platformTargetOrganizationId: null,
        }),
      );
      // ...and the organization facts it returns reach the service create
      // verbatim, alongside the legacy tenant_id. An ordinary caller NEVER
      // passes `{ kind: 'global' }`.
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant_test_1' }),
        ORG_FACTS,
      );
      expect(mocks.create).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'global' }),
      );
    });

    it("ignores a requested foreign tenantId and derives the caller's own tenant instead", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.create.mockResolvedValue({
        ...TEST_FLAG,
        tenantId: 'tenant_test_1',
      });

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({
          key: 'x',
          tenantId: 'some-other-tenant',
          enabled: true,
        }),
        mockContext,
      );
      expect(res.status).toBe(201);
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant_test_1' }),
        ORG_FACTS,
      );
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
        ORG_FACTS,
      );
    });
  });

  describe('FF·B canonical dual-write wiring', () => {
    it('passes the resolved organization facts through to the service create', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      const facts = {
        kind: 'organization' as const,
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        tenantId: 'tttttttt-tttt-4ttt-8ttt-tttttttttttt',
      };
      mocks.resolveCanonical.mockResolvedValue({ outcome: 'resolved', facts });
      mocks.create.mockResolvedValue(TEST_FLAG);

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({
          key: 'k',
          tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          enabled: true,
        }),
        mockContext,
      );

      expect(res.status).toBe(201);
      expect(mocks.resolveCanonical).toHaveBeenCalledWith(
        expect.objectContaining({
          isPlatformAdmin: true,
          platformTargetOrganizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      );
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // legacy tenant_id is still the verbatim client value, NOT the
          // canonical id
          tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
        facts,
      );
    });

    it('returns 422 and writes nothing when a platform-admin organization target is unresolvable', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.resolveCanonical.mockResolvedValue({
        outcome: 'unresolvable-organization-target',
      });

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({
          key: 'k',
          tenantId: 'org_does_not_map',
          enabled: true,
        }),
        mockContext,
      );

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('ORGANIZATION_NOT_RESOLVED');
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
    });

    it('creates an explicit intentional_global flag for a platform admin with tenantId: null', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.resolveCanonical.mockResolvedValue({
        outcome: 'resolved',
        facts: { kind: 'global' },
      });
      mocks.create.mockResolvedValue(TEST_FLAG);

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({ key: 'k', tenantId: null, enabled: true }),
        mockContext,
      );

      expect(res.status).toBe(201);
      expect(mocks.resolveCanonical).toHaveBeenCalledWith(
        expect.objectContaining({ platformTargetOrganizationId: null }),
      );
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: null }),
        { kind: 'global' },
      );
    });

    it('surfaces a resolution-stage invariant failure as a generic 500 (fail closed)', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.resolveCanonical.mockRejectedValue(
        new FeatureFlagCanonicalWriteInvariantError(),
      );

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({ key: 'k', tenantId: null, enabled: true }),
        mockContext,
      );

      expect(res.status).toBe(500);
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('resolution succeeds but the same-statement INSERT matches zero organizations rows: generic 500, no success audit, no retry, no global fallback', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      // Resolution returns valid organization facts...
      mocks.resolveCanonical.mockResolvedValue({
        outcome: 'resolved',
        facts: ORG_FACTS,
      });
      // ...but the tuple-proof INSERT in the service inserts nothing.
      mocks.create.mockRejectedValue(
        new FeatureFlagCanonicalWriteInvariantError(),
      );

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({
          key: 'k',
          tenantId: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0',
          enabled: true,
        }),
        mockContext,
      );

      expect(res.status).toBe(500);
      expect(mocks.create).toHaveBeenCalledTimes(1); // no retry
      expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled(); // no success audit
    });
  });
});
