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

vi.mock('@/security/core/node-provisioning-runtime', () => ({
  resolveNodeProvisioningAccess: resolveNodeProvisioningAccessMock,
}));

import UsersLayout from './layout';

describe('UsersLayout node provisioning guard', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resolveNodeProvisioningAccessMock.mockReset();
  });

  it('redirects unauthenticated user to sign-in', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'UNAUTHENTICATED',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });

    await expect(UsersLayout({ children: <div>content</div> })).rejects.toThrow(
      'REDIRECT:/sign-in?redirect_url=/users',
    );
  });

  it('redirects onboarding-required user to onboarding', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ONBOARDING_REQUIRED',
      code: 'ONBOARDING_INCOMPLETE',
      message: 'Onboarding required',
    });

    await expect(UsersLayout({ children: <div>content</div> })).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
  });

  it('redirects tenant-context-required user to onboarding reason route', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'TENANT_CONTEXT_REQUIRED',
      code: 'TENANT_CONTEXT_REQUIRED',
      message: 'Tenant context required',
    });

    await expect(UsersLayout({ children: <div>content</div> })).rejects.toThrow(
      'REDIRECT:/onboarding?reason=tenant-context-required',
    );
  });

  it('returns children when access is ALLOWED', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ALLOWED',
      identity: { id: 'u-1' },
      tenant: { tenantId: 't-1', userId: 'u-1' },
      user: {
        id: 'u-1',
        onboardingComplete: true,
      },
    });

    const result = await UsersLayout({ children: <div>content</div> });

    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
