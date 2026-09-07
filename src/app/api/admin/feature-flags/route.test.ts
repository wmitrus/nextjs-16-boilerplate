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
  list: vi.fn(),
  create: vi.fn(),
  resolveCanonical: vi.fn(),
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

vi.mock('@/core/env', () => ({
  env: {
    FEATURE_FLAG_PROVIDER: 'db',
    AUTH_PROVIDER: 'clerk',
  },
}));

vi.mock('./feature-flags-admin-scope', () => ({
  resolveFeatureFlagsAdminScope: mocks.resolveScope,
}));

vi.mock('./feature-flags-canonical-write', () => ({
  resolveCanonicalFeatureFlagWrite: mocks.resolveCanonical,
}));

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

function makeGetRequest(queryString = '') {
  return new NextRequest(
    `http://localhost/api/admin/feature-flags${queryString}`,
  );
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
  organizationId: null,
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
        list: mocks.list,
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

  it('returns 200 with flags, total, and activeProvider for a platform admin, using platform-global scope and the default page', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveScope.mockResolvedValue({ kind: 'platform-global' });
    mocks.list.mockResolvedValue({ flags: [TEST_FLAG], total: 1 });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        flags: unknown[];
        total: number;
        limit: number;
        offset: number;
        activeProvider: string;
        scope: { isPlatformAdmin: boolean; organizationId: string | null };
      };
    };
    expect(body.data.flags).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(body.data.limit).toBe(50);
    expect(body.data.offset).toBe(0);
    expect(body.data.activeProvider).toBe('db');
    expect(mocks.list).toHaveBeenCalledWith(
      { kind: 'platform-global' },
      { limit: 50, offset: 0 },
    );
    expect(body.data.scope).toEqual({
      isPlatformAdmin: true,
      organizationId: null,
    });
  });

  it('SEC-26: uses organization scope for an ABAC-authorized non-platform-admin', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(true),
    });
    mocks.resolveScope.mockResolvedValue(ORG_FACTS);
    mocks.list.mockResolvedValue({ flags: [TEST_FLAG], total: 1 });

    const { GET } = await import('./route');
    const res = await GET(makeGetRequest(), mockContext);
    expect(res.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(ORG_FACTS, {
      limit: 50,
      offset: 0,
    });

    const body = (await res.json()) as {
      data: {
        scope: { isPlatformAdmin: boolean; organizationId: string | null };
      };
    };
    // SEC-26 follow-up: the client needs this to render the intentional_global
    // overlay as read-only for a non-platform-admin.
    expect(body.data.scope).toEqual({
      isPlatformAdmin: false,
      organizationId: ORG_FACTS.organizationId,
    });
  });

  it('returns an empty page (not a 403) when scope derivation legitimately denies membership', async () => {
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
      data: { flags: unknown[]; total: number };
    };
    expect(body.data.flags).toHaveLength(0);
    expect(body.data.total).toBe(0);
  });

  describe('pagination', () => {
    beforeEach(() => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.resolveScope.mockResolvedValue({ kind: 'platform-global' });
      mocks.list.mockResolvedValue({ flags: [], total: 0 });
    });

    it('parses client-supplied limit/offset and passes them through', async () => {
      const { GET } = await import('./route');
      const res = await GET(makeGetRequest('?limit=10&offset=20'), mockContext);
      expect(res.status).toBe(200);
      expect(mocks.list).toHaveBeenCalledWith(
        { kind: 'platform-global' },
        { limit: 10, offset: 20 },
      );
    });

    it('clamps a client-requested limit above 200 down to 200 -- server-bounded, not client-trusted', async () => {
      const { GET } = await import('./route');
      const res = await GET(makeGetRequest('?limit=99999'), mockContext);
      expect(res.status).toBe(200);
      expect(mocks.list).toHaveBeenCalledWith(
        { kind: 'platform-global' },
        { limit: 200, offset: 0 },
      );
    });

    it('rejects a negative offset with 400 before any list() call', async () => {
      const { GET } = await import('./route');
      const res = await GET(makeGetRequest('?offset=-1'), mockContext);
      expect(res.status).toBe(400);
      expect(mocks.list).not.toHaveBeenCalled();
    });

    it('rejects a zero/negative limit with 400 before any list() call', async () => {
      const { GET } = await import('./route');
      const res = await GET(makeGetRequest('?limit=0'), mockContext);
      expect(res.status).toBe(400);
      expect(mocks.list).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric limit/offset with 400', async () => {
      const { GET } = await import('./route');
      const res = await GET(makeGetRequest('?limit=abc'), mockContext);
      expect(res.status).toBe(400);
      expect(mocks.list).not.toHaveBeenCalled();
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
        list: mocks.list,
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
      makePostRequest({ key: 'x', organizationId: null, enabled: true }),
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
      makePostRequest({ key: 'x', organizationId: null, enabled: true }),
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

  it('REGRESSION: rejects a legacy tenantId-shaped request instead of silently treating it as a platform-global create', async () => {
    // z.object silently STRIPS unknown keys, so `tenantId` (the pre-rename
    // field name) would vanish and `organizationId` would parse as
    // `undefined` -- for a platform admin, `organizationId ?? null` reads as
    // an EXPLICIT platform-global request. `createBodySchema` must be a
    // `strictObject` so this fails closed with 400 instead.
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({
        key: 'legacy-shaped',
        tenantId: ORG_FACTS.organizationId,
        enabled: true,
      }),
      mockContext,
    );

    expect(res.status).toBe(400);
    expect(mocks.resolveCanonical).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });

  it('REGRESSION: rejects an unknown extra field alongside a valid payload (fail-closed, not best-effort)', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({
        key: 'x',
        organizationId: null,
        enabled: true,
        scope: { isPlatformAdmin: true, organizationId: null },
      }),
      mockContext,
    );

    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
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
      makePostRequest({ key: 'dup', organizationId: null, enabled: true }),
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
      makePostRequest({ key: 'my-flag', organizationId: null, enabled: true }),
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

  it('REGRESSION: audit event uses the flag’s LEGACY tenant_id (Audit subsystem compatibility key), never canonical Feature Flag authority', async () => {
    // OZI-71 FF·D final review — the Audit subsystem (audit_events /
    // audit_log_settings) has NOT undergone AUD·A-D: `resolveEffectiveAuditSetting`
    // still matches by exact string equality against
    // `audit_log_settings.tenant_id`, and `audit_events.tenant_id` stores
    // that same legacy key. Feeding it the canonical `TenantId` instead
    // would resolve settings against a value that predates and may not
    // match any legacy-configured override -- crossing the FF/AUD package
    // boundary before AUD's own coordinated cutover. This test proves the
    // two concepts stay independent: canonical resolution
    // (`resolveCanonicalFeatureFlagWrite`) still runs and its facts still
    // reach `service.create` unchanged (Feature Flag authorization is
    // untouched), while the audit event's `tenantId` comes from the
    // returned DTO's legacy `tenant_id` shadow value -- deliberately
    // DIFFERENT from the canonical parent tenant here, to prove the audit
    // path doesn't quietly read the canonical value instead.
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    const LEGACY_SHADOW_VALUE = 'legacy-shadow-value-unrelated-to-canonical';
    mocks.create.mockResolvedValue({
      ...TEST_FLAG,
      tenantId: LEGACY_SHADOW_VALUE,
    });

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({
        key: 'my-flag',
        organizationId: ORG_FACTS.organizationId,
        enabled: true,
      }),
      mockContext,
    );

    expect(res.status).toBe(201);
    // Canonical Feature Flag authorization is unaffected: the resolved
    // organization facts still reach `service.create` untouched.
    expect(mocks.create).toHaveBeenCalledWith(expect.anything(), ORG_FACTS);
    // The audit event uses the legacy shadow value, NOT the canonical
    // parent tenant (which differs from LEGACY_SHADOW_VALUE here).
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: LEGACY_SHADOW_VALUE }),
    );
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: ORG_FACTS.tenantId }),
    );
  });

  it('attributes an explicit platform-global create’s audit event to tenantId: null', async () => {
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveCanonical.mockResolvedValue({
      outcome: 'resolved',
      facts: { kind: 'global' },
    });
    mocks.create.mockResolvedValue({ ...TEST_FLAG, tenantId: null });

    const { POST } = await import('./route');
    const res = await POST(
      makePostRequest({ key: 'g', organizationId: null, enabled: true }),
      mockContext,
    );

    expect(res.status).toBe(201);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null }),
    );
  });

  describe('SEC-26 regression: ABAC-authorized non-platform-admin scope constraint', () => {
    beforeEach(() => {
      mocks.isEnvAdmin.mockReturnValue(false);
      mocks.registry.set(AUTHORIZATION.SERVICE, {
        can: vi.fn().mockResolvedValue(true),
      });
    });

    it("ignores a requested global (null organizationId) and derives the caller's own tenant instead", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.create.mockResolvedValue({
        ...TEST_FLAG,
        tenantId: 'tenant_test_1',
      });

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({ key: 'x', organizationId: null, enabled: true }),
        mockContext,
      );
      // Deriving (not rejecting) means the normal "Create flag" form -- which
      // defaults to an empty/null Organization ID -- keeps working for an
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
      // ...and the legacy tenant_id shadow value is the caller's own verified
      // active tenant -- never a client-supplied value.
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant_test_1' }),
        ORG_FACTS,
      );
      expect(mocks.create).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'global' }),
      );
    });

    it("ignores a requested foreign organizationId and derives the caller's own tenant instead", async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.create.mockResolvedValue({
        ...TEST_FLAG,
        tenantId: 'tenant_test_1',
      });

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({
          key: 'x',
          organizationId: 'some-other-org',
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
          organizationId: 'tenant_test_1',
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

  describe('FF·B/FF·D canonical dual-write wiring', () => {
    it('the legacy tenant_id shadow write is the RAW client organizationId, verbatim — never the resolved parent TenantId', async () => {
      // FF·B (preserved unchanged through FF·D): the legacy column is
      // compatibility/rollback data, not canonical authority. Writing the
      // organization's resolved parent TenantId here instead would collide
      // two sibling organizations under the same tenant on the retained
      // legacy `UNIQUE(key, tenant_id)` — see the real-DB regression in
      // `route.db.test.ts`.
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
          organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
          // the raw request field, verbatim — NOT facts.tenantId.
          tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
        facts,
      );
      expect(mocks.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: facts.tenantId }),
        expect.anything(),
      );
    });

    it('REGRESSION: sibling organizations under the same tenant get DISTINCT legacy tenant_id values (mock-level)', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      const SAME_PARENT_TENANT = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt';
      const ORG_1 = '01010101-0101-4101-8101-010101010101';
      const ORG_2 = '02020202-0202-4202-8202-020202020202';

      const { POST } = await import('./route');

      mocks.resolveCanonical.mockResolvedValueOnce({
        outcome: 'resolved',
        facts: {
          kind: 'organization',
          organizationId: ORG_1,
          tenantId: SAME_PARENT_TENANT,
        },
      });
      mocks.create.mockResolvedValueOnce({ ...TEST_FLAG, tenantId: ORG_1 });
      await POST(
        makePostRequest({
          key: 'shared',
          organizationId: ORG_1,
          enabled: true,
        }),
        mockContext,
      );

      mocks.resolveCanonical.mockResolvedValueOnce({
        outcome: 'resolved',
        facts: {
          kind: 'organization',
          organizationId: ORG_2,
          tenantId: SAME_PARENT_TENANT,
        },
      });
      mocks.create.mockResolvedValueOnce({ ...TEST_FLAG, tenantId: ORG_2 });
      await POST(
        makePostRequest({
          key: 'shared',
          organizationId: ORG_2,
          enabled: true,
        }),
        mockContext,
      );

      const [firstCallInput] = mocks.create.mock.calls[0] as [
        { tenantId: string },
      ];
      const [secondCallInput] = mocks.create.mock.calls[1] as [
        { tenantId: string },
      ];
      expect(firstCallInput.tenantId).toBe(ORG_1);
      expect(secondCallInput.tenantId).toBe(ORG_2);
      expect(firstCallInput.tenantId).not.toBe(secondCallInput.tenantId);
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
          organizationId: 'org_does_not_map',
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

    it('creates an explicit intentional_global flag for a platform admin with organizationId: null, legacy tenant_id stays null', async () => {
      mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.resolveCanonical.mockResolvedValue({
        outcome: 'resolved',
        facts: { kind: 'global' },
      });
      mocks.create.mockResolvedValue(TEST_FLAG);

      const { POST } = await import('./route');
      const res = await POST(
        makePostRequest({ key: 'k', organizationId: null, enabled: true }),
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
        makePostRequest({ key: 'k', organizationId: null, enabled: true }),
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
          organizationId: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0',
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
