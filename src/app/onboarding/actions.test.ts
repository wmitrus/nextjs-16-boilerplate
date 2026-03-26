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

const mockCookieDelete = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    delete: mockCookieDelete,
    set: vi.fn(),
  }),
}));

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

    const services = new Map<symbol, unknown>([
      [AUTH.IDENTITY_SOURCE, identitySource],
      [PROVISIONING.SERVICE, provisioningService],
      [AUTH.USER_REPOSITORY, userRepository],
    ]);

    getAppContainerMock.mockReturnValue({
      resolve: (token: symbol) => services.get(token),
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

  it('clears __onboarding_pending cookie after successful onboarding status update', async () => {
    const formData = new FormData();
    formData.set('displayName', 'Alice');

    await expect(completeOnboarding(formData)).rejects.toThrow(
      'REDIRECT:/users',
    );

    expect(mockCookieDelete).toHaveBeenCalledWith('__onboarding_pending');
  });

  it('does not clear cookie when updateOnboardingStatus throws', async () => {
    userRepository.updateOnboardingStatus.mockRejectedValue(
      new Error('db error'),
    );

    const formData = new FormData();
    formData.set('displayName', 'Alice');

    const result = await completeOnboarding(formData);

    expect(result).toEqual({
      error: 'There was an error updating your profile.',
    });
    expect(mockCookieDelete).not.toHaveBeenCalled();
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

  it('returns database error when provisioning succeeds but the internal user row is missing', async () => {
    userRepository.findById.mockResolvedValue(null);

    const formData = new FormData();
    formData.set('displayName', 'Alice');
    formData.set('locale', 'pl-PL');
    formData.set('timezone', 'Europe/Warsaw');

    const result = await completeOnboarding(formData);

    expect(result).toEqual({
      error: 'A database error occurred. Please try again.',
    });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
    expect(userRepository.updateOnboardingStatus).not.toHaveBeenCalled();
  });

  it('returns database error when userRepository.findById throws after successful provisioning', async () => {
    userRepository.findById.mockRejectedValue(new Error('DB connection lost'));

    const formData = new FormData();
    formData.set('displayName', 'Alice');

    const result = await completeOnboarding(formData);

    expect(result).toEqual({
      error: 'A database error occurred. Please try again.',
    });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(userRepository.updateProfile).not.toHaveBeenCalled();
    expect(userRepository.updateOnboardingStatus).not.toHaveBeenCalled();
  });
});
