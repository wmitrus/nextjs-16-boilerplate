import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH } from '@/core/contracts';
import { UserNotProvisionedError } from '@/core/contracts/identity';

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

import { OnboardingGuard } from './layout';

describe('OnboardingGuard', () => {
  const identityProvider = {
    getCurrentIdentity: vi.fn(),
  };

  const userRepository = {
    findById: vi.fn(),
    updateOnboardingStatus: vi.fn(),
    updateProfile: vi.fn(),
  };

  beforeEach(() => {
    redirectMock.mockClear();
    vi.clearAllMocks();

    getAppContainerMock.mockReturnValue({
      resolve: (token: symbol) => {
        if (token === AUTH.IDENTITY_PROVIDER) return identityProvider;
        if (token === AUTH.USER_REPOSITORY) return userRepository;
        return undefined;
      },
    });
  });

  it('redirects externally-authenticated but unprovisioned users to bootstrap', async () => {
    identityProvider.getCurrentIdentity.mockRejectedValue(
      new UserNotProvisionedError(),
    );

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap');
  });

  it('redirects unauthenticated users to sign-in', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue(null);

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/sign-in');
  });

  it('redirects to bootstrap when the internal user row is missing', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue({ id: 'u-1' });
    userRepository.findById.mockResolvedValue(null);

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap');
  });

  it('redirects onboarded users to /users', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue({ id: 'u-1' });
    userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: true,
    });

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/users');
  });

  it('renders children for provisioned users with incomplete onboarding', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue({ id: 'u-1' });
    userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: false,
    });

    const result = await OnboardingGuard({ children: <div>content</div> });

    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
