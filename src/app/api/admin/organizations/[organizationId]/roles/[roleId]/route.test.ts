import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const ORG_ID = '15000000-0000-4000-8000-000000000001';
const ROLE_ID = '20000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  authzService: { can: vi.fn() },
  readService: { getDetailInActiveScope: vi.fn() },
  renameCustomRole: vi.fn(),
  deleteCustomRole: vi.fn(),
  registry: new Map<symbol, unknown>(),
  db: {},
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
  '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService',
  () => ({
    DrizzleAdminOrganizationsReadService: class {
      getDetailInActiveScope(...args: unknown[]) {
        return mocks.readService.getDetailInActiveScope(...args);
      }
    },
  }),
);

vi.mock(
  '@/modules/authorization/infrastructure/drizzle/DrizzleAdminRolesMutationService',
  () => ({
    DrizzleAdminRolesMutationService: class {
      renameCustomRole(...args: unknown[]) {
        return mocks.renameCustomRole(...args);
      }

      deleteCustomRole(...args: unknown[]) {
        return mocks.deleteCustomRole(...args);
      }
    },
  }),
);

function makeContext(
  organizationId: string = ORG_ID,
  roleId: string = ROLE_ID,
) {
  return { params: Promise.resolve({ organizationId, roleId }) };
}

describe('role mutation routes reject archived organizations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.registry.set(AUTHORIZATION.SERVICE, mocks.authzService);
    mocks.authzService.can.mockResolvedValue(true);
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'owner@test.dev' },
        tenant: {
          organizationId: ORG_ID,
          tenantId: 'tenant-acme',
          userId: 'admin-1',
        },
        user: {
          id: 'admin-1',
          email: 'owner@test.dev',
          onboardingComplete: true,
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.readService.getDetailInActiveScope.mockResolvedValue({
      organization: {
        id: ORG_ID,
        name: 'Acme HQ',
        slug: 'acme-hq',
        status: 'archived',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      stats: {
        memberCount: 2,
        roleCount: 2,
        pendingInvitationCount: 0,
        policyCount: 4,
      },
    });
  });

  it('returns 409 for PATCH', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/admin/organizations/${ORG_ID}/roles/${ROLE_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'auditor' }),
        },
      ),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.renameCustomRole).not.toHaveBeenCalled();
  });

  it('returns 409 for DELETE', async () => {
    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/admin/organizations/${ORG_ID}/roles/${ROLE_ID}`,
        { method: 'DELETE' },
      ),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.deleteCustomRole).not.toHaveBeenCalled();
  });
});
