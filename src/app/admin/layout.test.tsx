import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
const resolveNodeProvisioningAccessMock = vi.hoisted(() => vi.fn());
const connectionMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

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
    resolve: vi.fn(),
  }),
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
  isEnvBasedPlatformAdmin: vi.fn(() => false),
}));

import { AdminLayoutGuard } from './layout';

describe('AdminLayoutGuard', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    resolveNodeProvisioningAccessMock.mockReset();
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
});
