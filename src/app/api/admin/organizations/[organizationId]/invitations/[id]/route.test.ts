import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const ORG_ID = '15000000-0000-4000-8000-000000000001';
const INVITATION_ID = '35000000-0000-4000-8000-000000000001';

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
  revokeInvitation: vi.fn(),
  db: {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  },
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
  '@/modules/invitations/infrastructure/DefaultInvitationService',
  () => ({
    DefaultInvitationService: vi.fn(),
  }),
);

vi.mock(
  '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository',
  () => ({
    DrizzleInvitationRepository: vi.fn().mockImplementation(() => ({})),
  }),
);

vi.mock('@/modules/invitations/infrastructure/EmailServiceFactory', () => ({
  createEmailService: vi.fn().mockReturnValue({}),
}));

vi.mock('@/core/env', () => ({
  env: {
    EMAIL_PROVIDER: 'noop',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

function makeContext(
  organizationId: string = ORG_ID,
  id: string = INVITATION_ID,
) {
  return { params: Promise.resolve({ organizationId, id }) };
}

describe('DELETE /api/admin/organizations/[organizationId]/invitations/[id]', () => {
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
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      stats: {
        memberCount: 2,
        roleCount: 2,
        pendingInvitationCount: 1,
        policyCount: 4,
      },
    });
    mocks.db.select.mockReturnValue(mocks.db);
    mocks.db.from.mockReturnValue(mocks.db);
    mocks.db.where.mockReturnValue(mocks.db);
    mocks.db.limit.mockResolvedValue([{ id: INVITATION_ID }]);
    vi.mocked(DefaultInvitationService).mockImplementation(function () {
      return {
        revokeInvitation: mocks.revokeInvitation,
      } as unknown as DefaultInvitationService;
    });
  });

  it('returns 403 when the caller lacks organizations admin access', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/admin/organizations/acme/invitations/inv-1',
      ),
      makeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.authzService.can).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ACTIONS.SECURITY_MANAGE_POLICIES,
        resource: expect.objectContaining({ type: RESOURCES.SECURITY }),
      }),
    );
  });

  it('returns 404 when the organization is outside the active scope', async () => {
    mocks.readService.getDetailInActiveScope.mockResolvedValue(null);

    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/admin/organizations/acme/invitations/inv-1',
      ),
      makeContext(),
    );

    expect(response.status).toBe(404);
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
        pendingInvitationCount: 1,
        policyCount: 4,
      },
    });

    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/admin/organizations/acme/invitations/inv-1',
      ),
      makeContext(),
    );

    expect(response.status).toBe(409);
  });

  it('returns 404 when the invitation does not belong to the organization', async () => {
    mocks.db.limit.mockResolvedValue([]);

    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/admin/organizations/acme/invitations/inv-1',
      ),
      makeContext(),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for malformed invitation ids before querying UUID columns', async () => {
    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/admin/organizations/acme/invitations/not-a-uuid',
      ),
      makeContext(ORG_ID, 'not-a-uuid'),
    );

    expect(response.status).toBe(400);
    expect(mocks.readService.getDetailInActiveScope).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });

  it('revokes the invitation on the canonical nested route', async () => {
    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/admin/organizations/acme/invitations/inv-1',
      ),
      makeContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.revokeInvitation).toHaveBeenCalledWith(INVITATION_ID);
    const body = await response.json();
    expect(body.data.id).toBe(INVITATION_ID);
  });
});
