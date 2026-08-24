import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
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

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

function makeContext(
  organizationId: string = ORG_ID,
  roleId: string = ROLE_ID,
) {
  return { params: Promise.resolve({ organizationId, roleId }) };
}

function makePatchRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/organizations/${ORG_ID}/roles/${ROLE_ID}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function makeDeleteRequest() {
  return new NextRequest(
    `http://localhost/api/admin/organizations/${ORG_ID}/roles/${ROLE_ID}`,
    { method: 'DELETE' },
  );
}

const ACTIVE_ORG = {
  organization: {
    id: ORG_ID,
    name: 'Acme HQ',
    slug: 'acme-hq',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  stats: {
    memberCount: 2,
    roleCount: 2,
    pendingInvitationCount: 0,
    policyCount: 4,
  },
};

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

describe('PATCH /api/admin/organizations/[organizationId]/roles/[roleId]', () => {
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
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
  });

  it('returns 403 when the caller is not an organizations admin', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.renameCustomRole).not.toHaveBeenCalled();
  });

  it('renames a role for an active organization and records the audit event', async () => {
    const renamedRole = {
      id: ROLE_ID,
      organizationId: ORG_ID,
      name: 'auditor',
      isSystem: false,
    };
    mocks.renameCustomRole.mockResolvedValue(renamedRole);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { role: unknown } };
    expect(body.data.role).toEqual(renamedRole);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'role.rename',
        outcome: 'success',
        targetType: 'role',
        targetId: ROLE_ID,
      }),
    );
  });

  it('returns 404 when the role does not exist', async () => {
    const { RoleNotFoundError } =
      await import('@/modules/authorization/domain/errors');
    mocks.renameCustomRole.mockRejectedValue(new RoleNotFoundError());

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(404);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/organizations/[organizationId]/roles/[roleId]', () => {
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
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
  });

  it('returns 403 when the caller is not an organizations admin', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { DELETE } = await import('./route');
    const response = await DELETE(makeDeleteRequest(), makeContext());

    expect(response.status).toBe(403);
    expect(mocks.deleteCustomRole).not.toHaveBeenCalled();
  });

  it('deletes a role for an active organization and records the audit event', async () => {
    mocks.deleteCustomRole.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const response = await DELETE(makeDeleteRequest(), makeContext());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { roleId: string } };
    expect(body.data.roleId).toBe(ROLE_ID);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'role.delete',
        outcome: 'success',
        targetType: 'role',
        targetId: ROLE_ID,
      }),
    );
  });

  it('returns 400 when the role is protected from deletion', async () => {
    const { ProtectedRoleDeletionError } =
      await import('@/modules/authorization/domain/errors');
    mocks.deleteCustomRole.mockRejectedValue(
      new ProtectedRoleDeletionError('owner'),
    );

    const { DELETE } = await import('./route');
    const response = await DELETE(makeDeleteRequest(), makeContext());

    expect(response.status).toBe(400);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});
