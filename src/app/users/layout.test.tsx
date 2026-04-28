import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

const resolveNodeProvisioningAccessMock = vi.hoisted(() => vi.fn());
const getAppContainerMock = vi.hoisted(() => vi.fn(() => ({ mocked: true })));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: getAppContainerMock,
}));

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...actual,
    env: {
      ...actual.env,
      AUTH_PROVIDER: 'authjs',
    },
  };
});

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: resolveNodeProvisioningAccessMock,
}));

import { UsersLayoutGuard } from './layout';

const diagnostics = {
  tenancyMode: 'personal' as const,
  userRecordExists: null,
  tenantRecordExists: null,
  membershipExists: null,
  onboardingStateExists: null,
  onboardingComplete: null,
  provisioningRequired: false,
  reason: 'unsupported_state' as const,
};

describe('UsersLayout node provisioning guard', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resolveNodeProvisioningAccessMock.mockReset();
  });

  it('redirects unauthenticated user to the AuthJS sign-in route', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
      diagnostics: {
        ...diagnostics,
        reason: 'unauthenticated',
      },
    });

    await expect(
      UsersLayoutGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/signin?redirect_url=/users');
  });

  it('redirects bootstrap-required user to /auth/bootstrap/start with preserved target', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'BOOTSTRAP_REQUIRED',
      code: 'BOOTSTRAP_REQUIRED',
      message: 'Bootstrap required',
      diagnostics: {
        ...diagnostics,
        provisioningRequired: true,
        reason: 'provisioning_required',
      },
    });

    await expect(
      UsersLayoutGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap/start?redirect_url=/users');
  });

  it('redirects onboarding-required user to onboarding', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ONBOARDING_REQUIRED',
      code: 'ONBOARDING_INCOMPLETE',
      message: 'Onboarding required',
      diagnostics: {
        ...diagnostics,
        userRecordExists: true,
        onboardingStateExists: true,
        onboardingComplete: false,
        reason: 'missing_onboarding_state',
      },
    });

    await expect(
      UsersLayoutGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/onboarding');
  });

  it('redirects tenant-context-required user to bootstrap recovery route', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'TENANT_CONTEXT_REQUIRED',
      code: 'TENANT_CONTEXT_REQUIRED',
      message: 'Tenant context required',
      diagnostics: {
        ...diagnostics,
        userRecordExists: true,
        tenantRecordExists: false,
        onboardingStateExists: true,
        onboardingComplete: true,
        reason: 'missing_tenant',
      },
    });

    await expect(
      UsersLayoutGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap?reason=tenant-lost');
  });

  it('redirects to bootstrap db-error when resolveNodeProvisioningAccess throws', async () => {
    resolveNodeProvisioningAccessMock.mockRejectedValue(
      new Error('DB connection lost'),
    );

    await expect(
      UsersLayoutGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap?reason=db-error');
  });

  it('returns children when access is ALLOWED', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ALLOWED',
      identity: { id: 'u-1' },
      tenant: { organizationId: 't-1', tenantId: 't-1', userId: 'u-1' },
      user: {
        id: 'u-1',
        onboardingComplete: true,
      },
      diagnostics: {
        ...diagnostics,
        internalIdentityId: 'u-1',
        internalOrganizationId: 't-1',
        userRecordExists: true,
        tenantRecordExists: true,
        membershipExists: true,
        onboardingStateExists: true,
        onboardingComplete: true,
        reason: 'already_ready',
      },
    });

    const result = await UsersLayoutGuard({ children: <div>content</div> });

    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
