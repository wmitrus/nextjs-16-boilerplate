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
  createRolePolicy: vi.fn(),
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
  '@/modules/authorization/infrastructure/drizzle/DrizzleAdminPoliciesMutationService',
  () => ({
    DrizzleAdminPoliciesMutationService: class {
      createRolePolicy(...args: unknown[]) {
        return mocks.createRolePolicy(...args);
      }
    },
  }),
);

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

function makeContext(organizationId: string = ORG_ID) {
  return { params: Promise.resolve({ organizationId }) };
}

function makePostRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/organizations/${ORG_ID}/policies`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

const VALID_BODY = {
  roleId: ROLE_ID,
  effect: 'allow',
  resource: 'security',
  actions: ['security:manage_policies'],
};

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

describe('POST /api/admin/organizations/[organizationId]/policies', () => {
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

  it('returns 409 when the organization is archived', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new NextRequest(
        `http://localhost/api/admin/organizations/${ORG_ID}/policies`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleId: ROLE_ID,
            effect: 'allow',
            resource: 'security',
            actions: ['security:manage_policies'],
          }),
        },
      ),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.createRolePolicy).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not an organizations admin', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { POST } = await import('./route');
    const response = await POST(makePostRequest(VALID_BODY), makeContext());

    expect(response.status).toBe(403);
    expect(mocks.createRolePolicy).not.toHaveBeenCalled();
  });

  it('creates a policy for an active organization and records the audit event', async () => {
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
    const createdPolicy = {
      id: '40000000-0000-4000-8000-000000000001',
      organizationId: ORG_ID,
      roleId: ROLE_ID,
      effect: 'allow',
      resource: 'security',
      actions: ['security:manage_policies'],
    };
    mocks.createRolePolicy.mockResolvedValue(createdPolicy);

    const { POST } = await import('./route');
    const response = await POST(makePostRequest(VALID_BODY), makeContext());

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { policy: unknown } };
    expect(body.data.policy).toEqual(createdPolicy);
    expect(mocks.createRolePolicy).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      roleId: ROLE_ID,
      effect: 'allow',
      resource: 'security',
      actions: ['security:manage_policies'],
    });
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'rbac_policy.create',
        outcome: 'success',
        tenantId: 'tenant-acme',
        actorUserId: 'admin-1',
        targetType: 'policy',
        targetId: createdPolicy.id,
      }),
    );
  });

  it('returns 409 when the mutation service reports a duplicate policy', async () => {
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
    const { DuplicatePolicyError } =
      await import('@/modules/authorization/domain/errors');
    mocks.createRolePolicy.mockRejectedValue(new DuplicatePolicyError());

    const { POST } = await import('./route');
    const response = await POST(makePostRequest(VALID_BODY), makeContext());

    expect(response.status).toBe(409);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});
