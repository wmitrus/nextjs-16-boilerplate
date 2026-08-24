import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
const resolveNodeProvisioningAccessMock = vi.hoisted(() => vi.fn());
const connectionMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const isEnvAdminMock = vi.hoisted(() => vi.fn(() => false));
const recordAdminAuditEventMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const containerMocks = vi.hoisted(() => ({
  registry: new Map<symbol, unknown>(),
  identity: { get: vi.fn() },
  mfa: { getStatus: vi.fn() },
  authorization: { can: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    connection: connectionMock,
  };
});

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: () => ({
    resolve: (token: symbol) => containerMocks.registry.get(token),
  }),
}));

vi.mock('@/security/actions/record-admin-audit-event', () => ({
  recordAdminAuditEvent: recordAdminAuditEventMock,
}));

vi.mock('@/shared/lib/observability/server-request-log-context', () => ({
  getServerRequestLogContext: vi.fn().mockResolvedValue({
    correlationId: 'corr-1',
  }),
}));

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: resolveNodeProvisioningAccessMock,
}));

vi.mock('@/security/core/platform-admin', () => ({
  isEnvBasedPlatformAdmin: isEnvAdminMock,
}));

import { AUTH, AUTHORIZATION } from '@/core/contracts';

import { AdminLayoutGuard } from './layout';

import { makeAllowedProvisioningAccess } from '@/testing/factories/provisioning';

describe('AdminLayoutGuard', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resolveNodeProvisioningAccessMock.mockReset();
    isEnvAdminMock.mockReset();
    isEnvAdminMock.mockReturnValue(false);
    recordAdminAuditEventMock.mockClear();

    containerMocks.identity.get.mockClear();
    containerMocks.mfa.getStatus.mockClear();
    containerMocks.authorization.can.mockClear();

    containerMocks.identity.get.mockResolvedValue({ userId: 'external_1' });
    containerMocks.mfa.getStatus.mockResolvedValue({
      enrolled: true,
      enrollmentSurface: 'application',
      enrollmentUrl: '/account/security/mfa',
    });
    containerMocks.authorization.can.mockResolvedValue(true);

    containerMocks.registry.set(AUTH.IDENTITY_SOURCE, containerMocks.identity);
    containerMocks.registry.set(AUTH.MFA_SERVICE, containerMocks.mfa);
    containerMocks.registry.set(
      AUTHORIZATION.SERVICE,
      containerMocks.authorization,
    );
  });

  it('preserves /admin intent when bootstrap is still required', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'BOOTSTRAP_REQUIRED',
    });

    await expect(
      AdminLayoutGuard({ children: <div>admin</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap/start?redirect_url=%2Fadmin');
  });

  it('preserves /admin intent when onboarding is still required', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ONBOARDING_REQUIRED',
    });

    await expect(
      AdminLayoutGuard({ children: <div>admin</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap/start?redirect_url=%2Fadmin');
  });

  describe('MFA enrollment requirement (SEC-48)', () => {
    beforeEach(() => {
      resolveNodeProvisioningAccessMock.mockResolvedValue(
        makeAllowedProvisioningAccess(),
      );
    });

    it('sends an env-bootstrapped admin without a second factor to enrollment', async () => {
      // ADMIN_USER_EMAILS is the emergency access path -- exactly the account
      // most worth protecting, and the one most likely never to have enrolled.
      isEnvAdminMock.mockReturnValue(true);
      containerMocks.mfa.getStatus.mockResolvedValue({
        enrolled: false,
        enrollmentSurface: 'application',
        enrollmentUrl: '/account/security/mfa',
      });

      await expect(
        AdminLayoutGuard({ children: <div>admin</div> }),
      ).rejects.toThrow('REDIRECT:/account/security/mfa?reason=admin');
    });

    it('sends an ABAC-granted admin without a second factor to enrollment', async () => {
      containerMocks.mfa.getStatus.mockResolvedValue({
        enrolled: false,
        enrollmentSurface: 'application',
        enrollmentUrl: '/account/security/mfa',
      });

      await expect(
        AdminLayoutGuard({ children: <div>admin</div> }),
      ).rejects.toThrow('REDIRECT:/account/security/mfa?reason=admin');
    });

    it('lets an enrolled admin through', async () => {
      isEnvAdminMock.mockReturnValue(true);

      await expect(
        AdminLayoutGuard({ children: <div>admin</div> }),
      ).resolves.toBeDefined();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('checks enrollment only after the admin grant is established', async () => {
      // Order matters: enrollment is a requirement placed on administrators,
      // so a non-admin must be turned away by the authorization check and
      // never be asked about their second factor at all.
      containerMocks.authorization.can.mockResolvedValue(false);

      await expect(
        AdminLayoutGuard({ children: <div>admin</div> }),
      ).rejects.toThrow('REDIRECT:/');
      expect(containerMocks.mfa.getStatus).not.toHaveBeenCalled();
    });
  });
});
