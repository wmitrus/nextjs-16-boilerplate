import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { InvitationNotFoundError } from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  revokeInvitation: vi.fn(),
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

const TEST_TENANT_ID = '33333333-3333-4333-8333-333333333333';
const TEST_INVITATION_ID = '44444444-4444-4444-8444-444444444444';

vi.mock('@/core/env', () => ({
  env: {
    EMAIL_PROVIDER: 'noop',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

function makeRequest() {
  return new NextRequest(
    `http://localhost/api/admin/invitations/${TEST_INVITATION_ID}`,
    {
      method: 'DELETE',
    },
  );
}

describe('DELETE /api/admin/invitations/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, {});
    vi.mocked(DefaultInvitationService).mockImplementation(function () {
      return {
        revokeInvitation: mocks.revokeInvitation,
      } as unknown as DefaultInvitationService;
    });
  });

  it('returns 401 when unauthenticated', async () => {
    mocks.resolveAccess.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Auth required',
      diagnostics: {},
    });

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: TEST_INVITATION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated non-admin', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_TENANT_ID,
          tenantId: TEST_TENANT_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: TEST_INVITATION_ID }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when invitation does not exist', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_TENANT_ID,
          tenantId: TEST_TENANT_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.revokeInvitation.mockRejectedValue(new InvitationNotFoundError());

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: TEST_INVITATION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 on success', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_TENANT_ID,
          tenantId: TEST_TENANT_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.revokeInvitation.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: TEST_INVITATION_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(TEST_INVITATION_ID);
  });
});
