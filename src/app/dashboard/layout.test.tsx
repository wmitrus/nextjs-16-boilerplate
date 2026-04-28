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

vi.mock('@/shared/lib/observability/server-request-log-context', () => ({
  getServerRequestLogContext: vi.fn().mockResolvedValue({
    correlationId: 'corr-1',
    requestId: 'req-1',
  }),
}));

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

import { DashboardLayoutGuard } from './layout';

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

describe('DashboardLayoutGuard', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resolveNodeProvisioningAccessMock.mockReset();
  });

  it('redirects unauthenticated user to authjs sign-in with preserved target', async () => {
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
      DashboardLayoutGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/signin?redirect_url=/dashboard');
  });

  it('redirects bootstrap-required user to bootstrap start with the dashboard target', async () => {
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
      DashboardLayoutGuard({ children: <div>content</div> }),
    ).rejects.toThrow(
      'REDIRECT:/auth/bootstrap/start?redirect_url=%2Fdashboard',
    );
  });

  it('renders children for allowed access', async () => {
    resolveNodeProvisioningAccessMock.mockResolvedValue({
      status: 'ALLOWED',
      diagnostics: {
        ...diagnostics,
        userRecordExists: true,
        onboardingStateExists: true,
        onboardingComplete: true,
        reason: 'allowed',
      },
    });

    const result = await DashboardLayoutGuard({
      children: <div>content</div>,
    });

    expect(result).toEqual(<div>content</div>);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(getAppContainerMock).toHaveBeenCalled();
  });
});
