import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

const ORG_ID = '15000000-0000-4000-8000-000000000001';
const POLICY_ID = '30000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  resolveOrganizationsAdminScope: vi.fn(),
  isEnvAdmin: vi.fn(),
  authzService: { can: vi.fn() },
  readService: { getDetailInActiveScope: vi.fn() },
  updateRolePolicy: vi.fn(),
  deleteRolePolicy: vi.fn(),
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
      updateRolePolicy(...args: unknown[]) {
        return mocks.updateRolePolicy(...args);
      }

      deleteRolePolicy(...args: unknown[]) {
        return mocks.deleteRolePolicy(...args);
      }
    },
  }),
);

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

function makeContext(
  organizationId: string = ORG_ID,
  policyId: string = POLICY_ID,
) {
  return { params: Promise.resolve({ organizationId, policyId }) };
}

function makePatchRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/organizations/${ORG_ID}/policies/${POLICY_ID}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function makeDeleteRequest() {
  return new NextRequest(
    `http://localhost/api/admin/organizations/${ORG_ID}/policies/${POLICY_ID}`,
    { method: 'DELETE' },
  );
}

const VALID_PATCH_BODY = {
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

describe('policy mutation routes reject archived organizations', () => {
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
    mocks.resolveOrganizationsAdminScope.mockResolvedValue({
      kind: 'organization',
      organizationId: ORG_ID,
      tenantId: '10000000-0000-4000-8000-000000000001',
    });
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
        `http://localhost/api/admin/organizations/${ORG_ID}/policies/${POLICY_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            effect: 'allow',
            resource: 'security',
            actions: ['security:manage_policies'],
          }),
        },
      ),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.updateRolePolicy).not.toHaveBeenCalled();
  });

  it('returns 409 for DELETE', async () => {
    const { DELETE } = await import('./route');
    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/admin/organizations/${ORG_ID}/policies/${POLICY_ID}`,
        { method: 'DELETE' },
      ),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.deleteRolePolicy).not.toHaveBeenCalled();
  });

  it('returns 404 and never reaches the policies mutation service when the canonical scope gate denies', async () => {
    mocks.resolveOrganizationsAdminScope.mockResolvedValue(null);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/admin/organizations/${ORG_ID}/policies/${POLICY_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            effect: 'allow',
            resource: 'security',
            actions: ['security:manage_policies'],
          }),
        },
      ),
      makeContext(),
    );

    expect(response.status).toBe(404);
    expect(mocks.readService.getDetailInActiveScope).not.toHaveBeenCalled();
    expect(mocks.updateRolePolicy).not.toHaveBeenCalled();
    expect(mocks.deleteRolePolicy).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/organizations/[organizationId]/policies/[policyId]', () => {
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
    mocks.resolveOrganizationsAdminScope.mockResolvedValue({
      kind: 'organization',
      organizationId: ORG_ID,
      tenantId: '10000000-0000-4000-8000-000000000001',
    });
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
  });

  it('returns 403 when the caller is not an organizations admin', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest(VALID_PATCH_BODY),
      makeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.updateRolePolicy).not.toHaveBeenCalled();
  });

  it('updates a policy for an active organization and records the audit event', async () => {
    const updatedPolicy = {
      id: POLICY_ID,
      organizationId: ORG_ID,
      effect: 'allow',
      resource: 'security',
      actions: ['security:manage_policies'],
    };
    mocks.updateRolePolicy.mockResolvedValue(updatedPolicy);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest(VALID_PATCH_BODY),
      makeContext(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { policy: unknown } };
    expect(body.data.policy).toEqual(updatedPolicy);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'rbac_policy.update',
        outcome: 'success',
        targetType: 'policy',
        targetId: POLICY_ID,
      }),
    );
  });

  // The resource/action vocabulary check had no test before this refactor
  // moved it into `checkPolicyVocabulary`. It is the guard that stops a policy
  // being written against a resource or action no code path evaluates, or one
  // whose actions belong to a different resource than the one it names --
  // either of which reads as a grant while granting nothing, or as a scoped
  // grant while carrying another resource's actions.
  it('rejects a resource this application does not define', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({
        effect: 'allow',
        resource: 'not_a_real_resource',
        actions: ['security:manage_policies'],
      }),
      makeContext(),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateRolePolicy).not.toHaveBeenCalled();
  });

  it('rejects an action that does not belong to the named resource', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({
        effect: 'allow',
        resource: 'security',
        actions: ['user:read'],
      }),
      makeContext(),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateRolePolicy).not.toHaveBeenCalled();
  });

  it('rejects an action outside the action vocabulary', async () => {
    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest({
        effect: 'allow',
        resource: 'security',
        actions: ['security:take_over_everything'],
      }),
      makeContext(),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateRolePolicy).not.toHaveBeenCalled();
  });

  it('returns 404 when the policy does not exist', async () => {
    const { PolicyNotFoundError } =
      await import('@/modules/authorization/domain/errors');
    mocks.updateRolePolicy.mockRejectedValue(new PolicyNotFoundError());

    const { PATCH } = await import('./route');
    const response = await PATCH(
      makePatchRequest(VALID_PATCH_BODY),
      makeContext(),
    );

    expect(response.status).toBe(404);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/organizations/[organizationId]/policies/[policyId]', () => {
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
    mocks.resolveOrganizationsAdminScope.mockResolvedValue({
      kind: 'organization',
      organizationId: ORG_ID,
      tenantId: '10000000-0000-4000-8000-000000000001',
    });
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
  });

  it('returns 403 when the caller is not an organizations admin', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { DELETE } = await import('./route');
    const response = await DELETE(makeDeleteRequest(), makeContext());

    expect(response.status).toBe(403);
    expect(mocks.deleteRolePolicy).not.toHaveBeenCalled();
  });

  it('deletes a policy for an active organization and records the audit event', async () => {
    mocks.deleteRolePolicy.mockResolvedValue(undefined);

    const { DELETE } = await import('./route');
    const response = await DELETE(makeDeleteRequest(), makeContext());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { policyId: string } };
    expect(body.data.policyId).toBe(POLICY_ID);
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'rbac_policy.delete',
        outcome: 'success',
        targetType: 'policy',
        targetId: POLICY_ID,
      }),
    );
  });

  it('returns 400 when the policy is protected from deletion', async () => {
    const { ProtectedPolicyDeletionError } =
      await import('@/modules/authorization/domain/errors');
    mocks.deleteRolePolicy.mockRejectedValue(
      new ProtectedPolicyDeletionError(),
    );

    const { DELETE } = await import('./route');
    const response = await DELETE(makeDeleteRequest(), makeContext());

    expect(response.status).toBe(400);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});
