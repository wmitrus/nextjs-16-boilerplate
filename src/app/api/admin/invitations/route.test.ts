import { NextRequest } from 'next/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';

import { DuplicateInvitationError } from '@/modules/invitations/domain/errors';
import { DefaultInvitationService } from '@/modules/invitations/infrastructure/DefaultInvitationService';
import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  createInvitation: vi.fn(),
  listByOrganization: vi.fn(),
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

const TEST_ORG_ID = '11111111-1111-4111-8111-111111111111';
const TEST_ROLE_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('@/core/env', () => ({
  env: {
    DEFAULT_TENANT_ID: '33333333-3333-4333-8333-333333333333',
    EMAIL_PROVIDER: 'noop',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

function makeRequest(body?: unknown) {
  return new NextRequest('http://localhost/api/admin/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const mockContext = { params: Promise.resolve({}) };

describe('POST /api/admin/invitations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.db.select.mockReturnValue(mocks.db);
    mocks.db.from.mockReturnValue(mocks.db);
    mocks.db.where.mockReturnValue(mocks.db);
    mocks.db.limit.mockResolvedValue([{ id: TEST_ROLE_ID }]);
    vi.mocked(DefaultInvitationService).mockImplementation(function () {
      return {
        createInvitation: mocks.createInvitation,
        listByOrganization: mocks.listByOrganization,
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

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ email: 'a@b.com', roleId: TEST_ROLE_ID }),
      mockContext,
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated non-admin', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ email: 'a@b.com', roleId: TEST_ROLE_ID }),
      mockContext,
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when email is invalid', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ email: 'not-an-email', roleId: TEST_ROLE_ID }),
      mockContext,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when roleId is not a uuid', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ email: 'a@b.com', roleId: 'not-a-uuid' }),
      mockContext,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when roleId does not belong to org', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.db.limit.mockResolvedValueOnce([]);

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ email: 'a@b.com', roleId: TEST_ROLE_ID }),
      mockContext,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when duplicate invitation exists', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.db.limit.mockResolvedValueOnce([{ id: TEST_ROLE_ID }]);
    mocks.createInvitation.mockRejectedValue(
      new DuplicateInvitationError('Already invited'),
    );

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ email: 'a@b.com', roleId: TEST_ROLE_ID }),
      mockContext,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DUPLICATE_INVITATION');
  });

  it('returns 201 with invitationId on success', async () => {
    const expiresAt = new Date('2026-05-01T00:00:00Z');
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.db.limit.mockResolvedValueOnce([{ id: TEST_ROLE_ID }]);
    mocks.createInvitation.mockResolvedValue({
      id: 'inv-1',
      email: 'a@b.com',
      expiresAt,
      token: 'secret-token',
    });

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest({ email: 'a@b.com', roleId: TEST_ROLE_ID }),
      mockContext,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invitationId).toBe('inv-1');
    expect(body.data.email).toBe('a@b.com');
    expect(body.data.expiresAt).toBe(expiresAt.toISOString());
  });
});

describe('GET /api/admin/invitations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.db.select.mockReturnValue(mocks.db);
    mocks.db.from.mockReturnValue(mocks.db);
    mocks.db.where.mockReturnValue(mocks.db);
    mocks.db.limit.mockResolvedValue([{ id: TEST_ROLE_ID }]);
    vi.mocked(DefaultInvitationService).mockImplementation(function () {
      return {
        createInvitation: mocks.createInvitation,
        listByOrganization: mocks.listByOrganization,
      } as unknown as DefaultInvitationService;
    });
  });

  it('returns 403 when authenticated non-admin', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(false);
    mocks.registry.set(AUTHORIZATION.SERVICE, {
      can: vi.fn().mockResolvedValue(false),
    });

    const { GET } = await import('./route');
    const res = await GET(
      new NextRequest('http://localhost/api/admin/invitations'),
      mockContext,
    );
    expect(res.status).toBe(403);
  });

  it('returns sanitized invitations without tokens on success', async () => {
    mocks.resolveAccess.mockResolvedValue(
      makeAllowedProvisioningAccess({
        tenant: {
          organizationId: TEST_ORG_ID,
          tenantId: TEST_ORG_ID,
          userId: 'u1',
        },
      }),
    );
    mocks.isEnvAdmin.mockReturnValue(true);
    mocks.listByOrganization.mockResolvedValue([
      {
        id: 'inv-1',
        organizationId: TEST_ORG_ID,
        invitedByUserId: 'u1',
        email: 'a@b.com',
        roleId: TEST_ROLE_ID,
        token: 'secret-token',
        status: 'pending',
        expiresAt: new Date('2026-05-01T00:00:00Z'),
        acceptedAt: null,
        createdAt: new Date('2026-04-24T00:00:00Z'),
      },
    ]);

    const { GET } = await import('./route');
    const res = await GET(
      new NextRequest('http://localhost/api/admin/invitations'),
      mockContext,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.invitations).toHaveLength(1);
    expect(body.data.invitations[0]).not.toHaveProperty('token');
    expect(body.data.invitations[0].email).toBe('a@b.com');
  });
});
