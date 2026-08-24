import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

const ORG_ID = '15000000-0000-4000-8000-000000000001';
const USER_ID = '25000000-0000-4000-8000-000000000001';
const ROLE_ID = '35000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  authzService: {
    can: vi.fn(),
  },
  readService: {
    getDetailInActiveScope: vi.fn(),
  },
  mutationService: {
    updateMemberRole: vi.fn(),
  },
  container: {
    resolve: vi.fn(),
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

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
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
  '@/modules/authorization/infrastructure/drizzle/DrizzleAdminMembershipsMutationService',
  () => ({
    DrizzleAdminMembershipsMutationService: class {
      updateMemberRole(...args: unknown[]) {
        return mocks.mutationService.updateMemberRole(...args);
      }
    },
  }),
);

function makeContext(
  organizationId: string = ORG_ID,
  userId: string = USER_ID,
) {
  return { params: Promise.resolve({ organizationId, userId }) };
}

function makePatchRequest(body?: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/organizations/${ORG_ID}/members/${USER_ID}`,
    {
      method: 'PATCH',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
  );
}

describe('PATCH /api/admin/organizations/[organizationId]/members/[userId]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.container.resolve.mockReturnValue(mocks.authzService);
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.authzService.can.mockResolvedValue(true);
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        identity: { id: 'admin-1', email: 'owner@test.dev' },
      }),
    );
    mocks.readService.getDetailInActiveScope.mockResolvedValue({
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
    });
    mocks.mutationService.updateMemberRole.mockResolvedValue({
      userId: USER_ID,
      organizationId: ORG_ID,
      roleId: ROLE_ID,
      roleName: 'owner',
      roleIsSystem: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns 403 when the caller lacks tenant:manage_members', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ roleId: ROLE_ID }),
      makeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.authzService.can).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ACTIONS.TENANT_MANAGE_MEMBERS,
        resource: expect.objectContaining({ type: RESOURCES.TENANT }),
      }),
    );
  });

  it('returns 409 when the organization is archived', async () => {
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

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ roleId: ROLE_ID }),
      makeContext(),
    );

    expect(response.status).toBe(409);
  });

  it('returns 404 when the organization is outside the active scope', async () => {
    mocks.readService.getDetailInActiveScope.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ roleId: ROLE_ID }),
      makeContext(),
    );

    expect(response.status).toBe(404);
  });

  it('updates the member role when authorized', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ roleId: ROLE_ID }),
      makeContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutationService.updateMemberRole).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      userId: USER_ID,
      roleId: ROLE_ID,
    });
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'membership',
        action: 'membership.update_role',
        outcome: 'success',
        targetType: 'user',
        targetId: USER_ID,
      }),
    );
  });
});
