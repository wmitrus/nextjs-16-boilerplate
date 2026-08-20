import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const ORG_ID = '15000000-0000-4000-8000-000000000001';

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
    updateOrganizationStatus: vi.fn(),
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
  '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsMutationService',
  () => ({
    DrizzleAdminOrganizationsMutationService: class {
      updateOrganizationStatus(...args: unknown[]) {
        return mocks.mutationService.updateOrganizationStatus(...args);
      }
    },
  }),
);

function makeContext(organizationId: string = ORG_ID) {
  return { params: Promise.resolve({ organizationId }) };
}

function makePatchRequest(body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/organizations/${ORG_ID}`, {
    method: 'PATCH',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('PATCH /api/admin/organizations/[organizationId]', () => {
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
    mocks.mutationService.updateOrganizationStatus.mockResolvedValue({
      id: ORG_ID,
      tenantId: ORG_ID,
      name: 'Acme HQ',
      slug: 'acme-hq',
      status: 'archived',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns 403 when the caller lacks tenant:update', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ status: 'archived' }),
      makeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.authzService.can).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ACTIONS.TENANT_UPDATE,
        resource: expect.objectContaining({ type: RESOURCES.TENANT }),
      }),
    );
  });

  it('returns 400 when the payload is invalid', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ status: 'bad' }),
      makeContext(),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 when the organization is outside the active scope', async () => {
    mocks.readService.getDetailInActiveScope.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ status: 'archived' }),
      makeContext(),
    );

    expect(response.status).toBe(404);
  });

  it('updates the organization status when authorized', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({ status: 'archived' }),
      makeContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutationService.updateOrganizationStatus).toHaveBeenCalledWith(
      {
        activeOrganizationId: 'tenant_test_1',
        organizationId: ORG_ID,
        status: 'archived',
      },
    );
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'organization',
        action: 'organization.update_status',
        outcome: 'success',
        targetType: 'organization',
        targetId: ORG_ID,
      }),
    );
  });
});
