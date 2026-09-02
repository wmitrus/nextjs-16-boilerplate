import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const ORG_ID = '15000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  resolveOrganizationsAdminScope: vi.fn(),
  isEnvAdmin: vi.fn(),
  authzService: { can: vi.fn() },
  listInActiveScope: vi.fn(),
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

vi.mock('@/app/admin/organizations/organizations-admin-scope', () => ({
  resolveOrganizationsAdminScope: mocks.resolveOrganizationsAdminScope,
}));

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: mocks.isEnvAdmin,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => mocks.container,
}));

vi.mock(
  '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService',
  () => ({
    DrizzleAdminOrganizationsReadService: class {
      listInActiveScope(...args: unknown[]) {
        return mocks.listInActiveScope(...args);
      }
    },
  }),
);

function makeContext() {
  return { params: Promise.resolve({}) };
}

function makeRequest(query = '') {
  return new NextRequest(
    `http://localhost/api/admin/organizations${query ? `?${query}` : ''}`,
  );
}

async function body(response: Response) {
  return (await response.json()) as {
    data: {
      organizations: unknown[];
      total: number;
      limit: number;
      offset: number;
    };
  };
}

describe('GET /api/admin/organizations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.registry.set(AUTHORIZATION.SERVICE, mocks.authzService);
    mocks.authzService.can.mockResolvedValue(true);
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'owner@test.dev' },
        tenant: {
          organizationId: ORG_ID,
          tenantId: 'legacy-collapsed',
          userId: 'admin-1',
        },
        user: {
          id: 'admin-1',
          email: 'owner@test.dev',
          onboardingComplete: true,
        },
      }),
    );
    mocks.resolveOrganizationsAdminScope.mockResolvedValue({
      kind: 'organization',
      organizationId: ORG_ID,
      tenantId: TENANT_ID,
    });
    mocks.listInActiveScope.mockResolvedValue({
      organizations: [{ id: ORG_ID, isActive: true }],
      total: 1,
    });
  });

  it('returns 403 when the caller is not an organizations admin', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { GET } = await import('./route');
    const response = await GET(makeRequest(), makeContext());

    expect(response.status).toBe(403);
    expect(mocks.listInActiveScope).not.toHaveBeenCalled();
  });

  it('(1) canonical scope denial → 200 empty list, default pagination preserved, service not called', async () => {
    mocks.resolveOrganizationsAdminScope.mockResolvedValue(null);

    const { GET } = await import('./route');
    const response = await GET(makeRequest(), makeContext());

    expect(response.status).toBe(200);
    const payload = (await body(response)).data;
    expect(payload.organizations).toEqual([]);
    expect(payload.total).toBe(0);
    expect(payload.limit).toBe(50);
    expect(payload.offset).toBe(0);
    expect(mocks.listInActiveScope).not.toHaveBeenCalled();
  });

  it('(1) canonical scope denial preserves the requested pagination', async () => {
    mocks.resolveOrganizationsAdminScope.mockResolvedValue(null);

    const { GET } = await import('./route');
    const response = await GET(
      makeRequest('limit=10&offset=20'),
      makeContext(),
    );

    expect(response.status).toBe(200);
    const payload = (await body(response)).data;
    expect(payload).toMatchObject({
      organizations: [],
      total: 0,
      limit: 10,
      offset: 20,
    });
    expect(mocks.listInActiveScope).not.toHaveBeenCalled();
  });

  it('(2) canonical organization scope is passed through with activeOrganizationId as presentation data', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      makeRequest('search=acme&status=active'),
      makeContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.listInActiveScope).toHaveBeenCalledWith({
      scope: {
        kind: 'organization',
        organizationId: ORG_ID,
        tenantId: TENANT_ID,
      },
      activeOrganizationId: ORG_ID,
      limit: 50,
      offset: 0,
      search: 'acme',
      status: 'active',
    });
  });

  it('(3) canonical tenant scope is passed through unchanged — no platform-global conversion', async () => {
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.resolveOrganizationsAdminScope.mockResolvedValue({
      kind: 'tenant',
      tenantId: TENANT_ID,
    });

    const { GET } = await import('./route');
    const response = await GET(makeRequest(), makeContext());

    expect(response.status).toBe(200);
    expect(mocks.authzService.can).not.toHaveBeenCalled();
    const call = mocks.listInActiveScope.mock.calls[0]?.[0] as {
      scope: unknown;
      activeOrganizationId: string;
    };
    expect(call.scope).toEqual({ kind: 'tenant', tenantId: TENANT_ID });
    expect(call.activeOrganizationId).toBe(ORG_ID);
  });

  it('(4) a seam invariant / infrastructure failure maps to 500 and never calls the read service', async () => {
    mocks.resolveOrganizationsAdminScope.mockRejectedValue(
      new Error('infrastructure failure'),
    );

    const { GET } = await import('./route');
    const response = await GET(makeRequest(), makeContext());

    expect(response.status).toBe(500);
    expect(mocks.listInActiveScope).not.toHaveBeenCalled();
  });
});
