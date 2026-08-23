import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

import '@/testing/infrastructure/logger';

const ENTRY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  resolveAccess: vi.fn(),
  isEnvAdmin: vi.fn(),
  authzService: { can: vi.fn() },
  approveEntry: vi.fn(),
  rejectEntry: vi.fn(),
  createInvitation: vi.fn(),
  sendWaitlistRejectionEmail: vi.fn(),
  db: {},
  registry: new Map<symbol, unknown>(),
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

vi.mock('@/core/env', () => ({
  env: {
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 'test',
    RESEND_FROM_EMAIL: 'noreply@test.dev',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    TENANCY_MODE: 'org',
    WAITLIST_INVITE_ORGANIZATION_ID: 'org-1',
    WAITLIST_INVITE_ROLE_ID: 'role-1',
    WAITLIST_SEND_REJECTION_EMAIL: false,
  },
}));

vi.mock('@/modules/waitlist/infrastructure/DefaultWaitlistService', () => ({
  DefaultWaitlistService: class {
    approveEntry(...args: unknown[]) {
      return mocks.approveEntry(...args);
    }
    rejectEntry(...args: unknown[]) {
      return mocks.rejectEntry(...args);
    }
  },
}));

vi.mock(
  '@/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository',
  () => ({
    DrizzleWaitlistRepository: vi.fn().mockImplementation(() => ({})),
  }),
);

vi.mock(
  '@/modules/invitations/infrastructure/DefaultInvitationService',
  () => ({
    DefaultInvitationService: class {
      createInvitation(...args: unknown[]) {
        return mocks.createInvitation(...args);
      }
    },
  }),
);

vi.mock(
  '@/modules/invitations/infrastructure/drizzle/DrizzleInvitationRepository',
  () => ({
    DrizzleInvitationRepository: vi.fn().mockImplementation(() => ({})),
  }),
);

vi.mock('@/modules/invitations/infrastructure/EmailServiceFactory', () => ({
  createEmailService: () => ({
    sendWaitlistRejectionEmail: mocks.sendWaitlistRejectionEmail,
  }),
}));

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: mocks.recordAdminAuditEvent,
}));

function makeRequest(action: string) {
  return new NextRequest(
    `http://localhost/api/admin/waitlist/${ENTRY_ID}?action=${action}`,
    { method: 'POST' },
  );
}

function makeContext(id: string = ENTRY_ID) {
  return { params: Promise.resolve({ id }) };
}

const ENTRY = {
  id: ENTRY_ID,
  email: 'waitlisted@test.dev',
  name: 'Wait Lister',
  organizationId: null,
};

describe('POST /api/admin/waitlist/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.registry.clear();
    mocks.registry.set(INFRASTRUCTURE.DB, mocks.db);
    mocks.registry.set(AUTHORIZATION.SERVICE, mocks.authzService);
    mocks.resolveAccess.mockResolvedValue(makeAllowedProvisioningAccess());
  });

  describe('authorization (security fix, 2026-08-20)', () => {
    it('returns 403 when the caller is not an admin (env or ABAC)', async () => {
      mocks.isEnvAdmin.mockReturnValue(false);
      mocks.authzService.can.mockResolvedValue(false);

      const { POST } = await import('./route');
      const res = await POST(makeRequest('approve'), makeContext());

      expect(res.status).toBe(403);
      expect(mocks.approveEntry).not.toHaveBeenCalled();
      expect(mocks.recordAdminAuditEvent).not.toHaveBeenCalled();
    });

    it('checks the SECURITY_MANAGE_POLICIES ABAC grant, same as the sibling GET route', async () => {
      mocks.isEnvAdmin.mockReturnValue(false);
      mocks.authzService.can.mockResolvedValue(true);
      mocks.approveEntry.mockResolvedValue(ENTRY);
      mocks.createInvitation.mockResolvedValue({});

      const { POST } = await import('./route');
      await POST(makeRequest('approve'), makeContext());

      expect(mocks.authzService.can).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ACTIONS.SECURITY_MANAGE_POLICIES,
          resource: expect.objectContaining({ type: RESOURCES.SECURITY }),
        }),
      );
    });

    it('allows an env-based platform admin without an ABAC check', async () => {
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.approveEntry.mockResolvedValue(ENTRY);
      mocks.createInvitation.mockResolvedValue({});

      const { POST } = await import('./route');
      const res = await POST(makeRequest('approve'), makeContext());

      expect(res.status).toBe(200);
      expect(mocks.authzService.can).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      mocks.isEnvAdmin.mockReturnValue(true);
    });

    it('returns 400 for an invalid action', async () => {
      const { POST } = await import('./route');
      const res = await POST(makeRequest('nonsense'), makeContext());
      expect(res.status).toBe(400);
    });

    // SEC-23 requires this negative test on every route with a UUID segment:
    // a mocked DB never raises Postgres's 22P02, so only an explicit
    // assertion proves a malformed id is rejected before reaching the driver.
    it('returns 400 for a malformed id and never mutates the entry', async () => {
      const { POST } = await import('./route');
      const res = await POST(makeRequest('approve'), makeContext('not-a-uuid'));

      expect(res.status).toBe(400);
      expect(mocks.approveEntry).not.toHaveBeenCalled();
      expect(mocks.rejectEntry).not.toHaveBeenCalled();
    });
  });

  describe('approve (admin, success)', () => {
    beforeEach(() => {
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.approveEntry.mockResolvedValue(ENTRY);
      mocks.createInvitation.mockResolvedValue({});
    });

    it('approves the entry and records a waitlist audit event', async () => {
      const { POST } = await import('./route');
      const res = await POST(makeRequest('approve'), makeContext());

      expect(res.status).toBe(200);
      expect(mocks.approveEntry).toHaveBeenCalledWith(ENTRY_ID);
      expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'waitlist',
          action: 'waitlist.approve',
          outcome: 'success',
          targetType: 'waitlist_entry',
          targetId: ENTRY_ID,
        }),
      );
    });
  });

  describe('reject (admin, success)', () => {
    beforeEach(() => {
      mocks.isEnvAdmin.mockReturnValue(true);
      mocks.rejectEntry.mockResolvedValue(ENTRY);
    });

    it('rejects the entry and records a waitlist audit event', async () => {
      const { POST } = await import('./route');
      const res = await POST(makeRequest('reject'), makeContext());

      expect(res.status).toBe(200);
      expect(mocks.rejectEntry).toHaveBeenCalledWith(ENTRY_ID);
      expect(mocks.recordAdminAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'waitlist',
          action: 'waitlist.reject',
          outcome: 'success',
          targetType: 'waitlist_entry',
          targetId: ENTRY_ID,
        }),
      );
    });
  });
});
