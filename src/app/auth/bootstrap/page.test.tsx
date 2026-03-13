import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AUTH, PROVISIONING } from '@/core/contracts';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

const getAppContainerMock = vi.hoisted(() => vi.fn());

const envState = vi.hoisted(() => ({
  TENANCY_MODE: 'single' as string,
  TENANT_CONTEXT_SOURCE: undefined as string | undefined,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/core/runtime/bootstrap', () => ({
  getAppContainer: getAppContainerMock,
}));

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };

  return {
    ...actual,
    env: {
      ...actual.env,
      AUTH_PROVIDER: 'clerk',
      get TENANCY_MODE() {
        return envState.TENANCY_MODE;
      },
      get TENANT_CONTEXT_SOURCE() {
        return envState.TENANT_CONTEXT_SOURCE;
      },
      DEFAULT_TENANT_ID: '10000000-0000-4000-8000-000000000001',
      TENANT_CONTEXT_HEADER: 'x-tenant-id',
      TENANT_CONTEXT_COOKIE: 'active_tenant_id',
    },
  };
});

vi.mock('./bootstrap-error', () => ({
  BootstrapErrorUI: ({ error }: { error: string }) => (
    <div data-testid="bootstrap-error">{error}</div>
  ),
}));

vi.mock('./bootstrap-org-required', () => ({
  BootstrapOrgRequired: () => <div data-testid="bootstrap-org-required" />,
}));

import BootstrapPage from './page';

import {
  CrossProviderLinkingNotAllowedError,
  TenantUserLimitReachedError,
} from '@/modules/provisioning/domain/errors';

describe('BootstrapPage', () => {
  const identitySource = {
    get: vi.fn(),
  };

  const provisioningService = {
    ensureProvisioned: vi.fn(),
  };

  const userRepository = {
    findById: vi.fn(),
    updateOnboardingStatus: vi.fn(),
    updateProfile: vi.fn(),
  };

  const makeProps = (redirect_url?: string) => ({
    searchParams: Promise.resolve(
      redirect_url ? { redirect_url } : ({} as { redirect_url?: string }),
    ),
  });

  beforeEach(() => {
    redirectMock.mockClear();
    vi.clearAllMocks();

    envState.TENANCY_MODE = 'single';
    envState.TENANT_CONTEXT_SOURCE = undefined;

    getAppContainerMock.mockReturnValue({
      resolve: (token: symbol) => {
        if (token === AUTH.IDENTITY_SOURCE) return identitySource;
        if (token === PROVISIONING.SERVICE) return provisioningService;
        if (token === AUTH.USER_REPOSITORY) return userRepository;
        return undefined;
      },
    });

    identitySource.get.mockResolvedValue({
      userId: 'user_ext_1',
      email: 'user@example.com',
      emailVerified: true,
      tenantExternalId: undefined,
      tenantRole: undefined,
    });

    provisioningService.ensureProvisioned.mockResolvedValue({
      internalUserId: 'u-1',
      internalTenantId: 't-1',
      membershipRole: 'member',
      userCreatedNow: true,
      tenantCreatedNow: false,
    });

    userRepository.findById.mockResolvedValue({
      id: 'u-1',
      email: 'user@example.com',
      onboardingComplete: false,
    });
  });

  it('redirects to /sign-in when no external session exists', async () => {
    identitySource.get.mockResolvedValue({
      userId: undefined,
      email: undefined,
      emailVerified: undefined,
      tenantExternalId: undefined,
      tenantRole: undefined,
    });

    await expect(BootstrapPage(makeProps())).rejects.toThrow(
      'REDIRECT:/sign-in',
    );
  });

  it('provisions a new user and redirects incomplete onboarding to /onboarding with default target', async () => {
    await expect(BootstrapPage(makeProps())).rejects.toThrow(
      'REDIRECT:/onboarding?redirect_url=%2Fusers',
    );

    expect(provisioningService.ensureProvisioned).toHaveBeenCalledTimes(1);
  });

  it('preserves a valid redirect_url when redirecting incomplete onboarding to /onboarding', async () => {
    await expect(BootstrapPage(makeProps('/app/dashboard'))).rejects.toThrow(
      'REDIRECT:/onboarding?redirect_url=%2Fapp%2Fdashboard',
    );
  });

  it('redirects provisioned users with completed onboarding to /users by default', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'u-1',
      email: 'user@example.com',
      onboardingComplete: true,
    });

    await expect(BootstrapPage(makeProps())).rejects.toThrow('REDIRECT:/users');
  });

  it('redirects provisioned users with completed onboarding to a valid safeTarget', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'u-1',
      email: 'user@example.com',
      onboardingComplete: true,
    });

    await expect(BootstrapPage(makeProps('/app/dashboard'))).rejects.toThrow(
      'REDIRECT:/app/dashboard',
    );
  });

  it('renders bootstrap error UI for cross-provider linking failures', async () => {
    provisioningService.ensureProvisioned.mockRejectedValue(
      new CrossProviderLinkingNotAllowedError(),
    );

    render(await BootstrapPage(makeProps()));

    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'cross_provider_linking',
    );
  });

  it('renders bootstrap error UI for quota exceeded failures', async () => {
    provisioningService.ensureProvisioned.mockRejectedValue(
      new TenantUserLimitReachedError(),
    );

    render(await BootstrapPage(makeProps()));

    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent(
      'quota_exceeded',
    );
  });

  it('renders db_error UI when PGlite throws ENOENT during provisioning', async () => {
    const enoentError = Object.assign(
      new Error("ENOENT: no such file or directory, mkdir './data/pglite'"),
      { code: 'ENOENT' },
    );
    provisioningService.ensureProvisioned.mockRejectedValue(enoentError);

    render(await BootstrapPage(makeProps()));

    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('renders db_error UI when PGlite throws EPERM during provisioning', async () => {
    const epermError = Object.assign(
      new Error("EPERM: operation not permitted, mkdir './data/pglite'"),
      { code: 'EPERM' },
    );
    provisioningService.ensureProvisioned.mockRejectedValue(epermError);

    render(await BootstrapPage(makeProps()));

    expect(screen.getByTestId('bootstrap-error')).toHaveTextContent('db_error');
  });

  it('sanitizes external redirect_url values to /users', async () => {
    userRepository.findById.mockResolvedValue({
      id: 'u-1',
      email: 'user@example.com',
      onboardingComplete: true,
    });

    await expect(
      BootstrapPage(makeProps('https://evil.example/steal')),
    ).rejects.toThrow('REDIRECT:/users');
  });

  describe('org+provider mode — org context absent at sign-up', () => {
    beforeEach(() => {
      envState.TENANCY_MODE = 'org';
      envState.TENANT_CONTEXT_SOURCE = 'provider';
    });

    it('renders org-required interstitial when tenantExternalId is absent and does not call ensureProvisioned', async () => {
      identitySource.get.mockResolvedValue({
        userId: 'user_ext_1',
        email: 'user@example.com',
        emailVerified: true,
        tenantExternalId: undefined,
        tenantRole: undefined,
      });

      render(await BootstrapPage(makeProps()));

      expect(screen.getByTestId('bootstrap-org-required')).toBeDefined();
      expect(provisioningService.ensureProvisioned).not.toHaveBeenCalled();
    });

    it('proceeds to ensureProvisioned when tenantExternalId is present', async () => {
      identitySource.get.mockResolvedValue({
        userId: 'user_ext_1',
        email: 'user@example.com',
        emailVerified: true,
        tenantExternalId: 'org_abc',
        tenantRole: 'org:member',
      });

      await expect(BootstrapPage(makeProps())).rejects.toThrow(
        'REDIRECT:/onboarding?redirect_url=%2Fusers',
      );

      expect(provisioningService.ensureProvisioned).toHaveBeenCalledTimes(1);
    });
  });
});
