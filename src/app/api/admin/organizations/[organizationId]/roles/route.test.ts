import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/security/api/with-admin-step-up.mock';
import '@/testing/infrastructure/logger';

const ORG_ID = '15000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  resolveOrganizationsAdminScope: vi.fn(),
  isEnvAdmin: vi.fn(),
  authzService: { can: vi.fn() },
  readService: { getDetailInActiveScope: vi.fn() },
  createCustomRole: vi.fn(),
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
  '@/modules/authorization/infrastructure/drizzle/DrizzleAdminRolesMutationService',
  () => ({
    DrizzleAdminRolesMutationService: class {
      createCustomRole(...args: unknown[]) {
        return mocks.createCustomRole(...args);
      }
    },
  }),
);

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

function makeRequest(body?: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/organizations/${ORG_ID}/roles`,
    {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
  );
}

function makeContext(organizationId: string = ORG_ID) {
  return { params: Promise.resolve({ organizationId }) };
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

describe('POST /api/admin/organizations/[organizationId]/roles', () => {
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
      tenantId: TENANT_ID,
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

  it('returns 409 when the organization is archived', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.createCustomRole).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not an organizations admin', async () => {
    mocks.authzService.can.mockResolvedValue(false);

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(403);
    expect(mocks.createCustomRole).not.toHaveBeenCalled();
  });

  it('returns 404 and never calls the roles mutation service when the canonical scope gate denies', async () => {
    mocks.resolveOrganizationsAdminScope.mockResolvedValue(null);

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(404);
    expect(mocks.readService.getDetailInActiveScope).not.toHaveBeenCalled();
    expect(mocks.createCustomRole).not.toHaveBeenCalled();
  });

  it('creates a role for an active organization and records the audit event', async () => {
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
    const createdRole = {
      id: '25000000-0000-4000-8000-000000000001',
      organizationId: ORG_ID,
      name: 'auditor',
      isSystem: false,
    };
    mocks.createCustomRole.mockResolvedValue(createdRole);

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { role: unknown } };
    expect(body.data.role).toEqual(createdRole);
    expect(mocks.createCustomRole).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      name: 'auditor',
    });
    expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'rbac_policy',
        action: 'role.create',
        outcome: 'success',
        tenantId: 'tenant-acme',
        actorUserId: 'admin-1',
        targetType: 'role',
        targetId: createdRole.id,
      }),
    );
  });

  it('returns 409 when the mutation service reports a duplicate role name', async () => {
    mocks.readService.getDetailInActiveScope.mockResolvedValue(ACTIVE_ORG);
    const { DuplicateRoleNameError } =
      await import('@/modules/authorization/domain/errors');
    mocks.createCustomRole.mockRejectedValue(
      new DuplicateRoleNameError('auditor'),
    );

    const { POST } = await import('./route');
    const response = await POST(
      makeRequest({ name: 'auditor' }),
      makeContext(),
    );

    expect(response.status).toBe(409);
    expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
  });
});
