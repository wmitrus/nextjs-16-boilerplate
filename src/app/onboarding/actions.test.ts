import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AUTH, PROVISIONING } from '@/core/contracts';

import { completeOnboarding } from './actions';

import { TenantContextRequiredError } from '@/modules/provisioning/domain/errors';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

const getAppContainerMock = vi.hoisted(() => vi.fn());

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
      AUTH_PROVIDER: 'clerk',
      TENANCY_MODE: 'single',
      DEFAULT_TENANT_ID: '10000000-0000-4000-8000-000000000001',
      TENANT_CONTEXT_SOURCE: undefined,
      TENANT_CONTEXT_HEADER: 'x-tenant-id',
      TENANT_CONTEXT_COOKIE: 'active_tenant_id',
    },
  };
});

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

describe('completeOnboarding', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();

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
    userRepository.updateProfile.mockResolvedValue(undefined);
    userRepository.updateOnboardingStatus.mockResolvedValue(undefined);
  });

  it('executes provisioning before writing profile and onboarding status, then redirects to /users', async () => {
    const formData = new FormData();
    formData.set('displayName', 'Alice');
    formData.set('locale', 'pl-PL');
    formData.set('timezone', 'Europe/Warsaw');

    await expect(completeOnboarding(formData)).rejects.toThrow(
      'REDIRECT:/users',
    );

    expect(redirectMock).toHaveBeenCalledWith('/users');
    expect(provisioningService.ensureProvisioned).toHaveBeenCalledTimes(1);
    expect(userRepository.updateProfile).toHaveBeenCalledWith('u-1', {
      displayName: 'Alice',
      locale: 'pl-PL',
      timezone: 'Europe/Warsaw',
    });
    expect(userRepository.updateOnboardingStatus).toHaveBeenCalledWith(
      'u-1',
      true,
    );

    const provisionCallOrder =
      provisioningService.ensureProvisioned.mock.invocationCallOrder[0];
    const profileCallOrder =
      userRepository.updateProfile.mock.invocationCallOrder[0];
    expect(provisionCallOrder).toBeLessThan(profileCallOrder);
  });

  it('redirects to sanitized custom redirect_url from formData on success', async () => {
    const formData = new FormData();
    formData.set('displayName', 'Alice');
    formData.set('redirect_url', '/dashboard');

    await expect(completeOnboarding(formData)).rejects.toThrow(
      'REDIRECT:/dashboard',
    );

    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });

  it('returns controlled error for tenant-context provisioning failure', async () => {
    provisioningService.ensureProvisioned.mockRejectedValue(
      new TenantContextRequiredError('missing tenant context'),
    );

    const formData = new FormData();
    formData.set('displayName', 'Alice');
    formData.set('locale', 'pl-PL');
    formData.set('timezone', 'Europe/Warsaw');

    const result = await completeOnboarding(formData);

    expect(result).toEqual({
      error:
        'Tenant context is invalid or missing. Verify tenancy configuration and try again.',
    });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
    expect(userRepository.updateOnboardingStatus).not.toHaveBeenCalled();
  });

  it('throws when provisioning succeeds but the internal user row is missing', async () => {
    userRepository.findById.mockResolvedValue(null);

    const formData = new FormData();
    formData.set('displayName', 'Alice');
    formData.set('locale', 'pl-PL');
    formData.set('timezone', 'Europe/Warsaw');

    await expect(completeOnboarding(formData)).rejects.toThrow(
      'Onboarding invariant violated: provisioned user not found in database',
    );

    expect(redirectMock).not.toHaveBeenCalled();
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
    expect(userRepository.updateOnboardingStatus).not.toHaveBeenCalled();
  });
});
