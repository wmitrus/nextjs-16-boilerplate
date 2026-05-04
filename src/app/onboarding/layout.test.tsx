import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH } from '@/core/contracts';
import { UserNotProvisionedError } from '@/core/contracts/identity';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

const getAppContainerMock = vi.hoisted(() => vi.fn());
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

    const services = new Map<symbol, unknown>([
      [AUTH.IDENTITY_PROVIDER, identityProvider],
      [AUTH.USER_REPOSITORY, userRepository],
    ]);

    getAppContainerMock.mockReturnValue({
      resolve: (token: symbol) => services.get(token),
    });
  });

  it('redirects externally-authenticated but unprovisioned users to bootstrap start', async () => {
    identityProvider.getCurrentIdentity.mockRejectedValue(
      new UserNotProvisionedError(),
    );

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow(
      'REDIRECT:/auth/bootstrap/start?redirect_url=%2Fdashboard',
    );
  });

  it('redirects to bootstrap db-error when getCurrentIdentity throws a non-UserNotProvisionedError', async () => {
    identityProvider.getCurrentIdentity.mockRejectedValue(
      new Error('DB connection lost'),
    );

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap?reason=db-error');
  });

  it('redirects to bootstrap db-error when userRepository.findById throws', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue({ id: 'u-1' });
    userRepository.findById.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/bootstrap?reason=db-error');
  });

  it('redirects unauthenticated users to the AuthJS sign-in route', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue(null);

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/signin');
  });

  it('redirects to bootstrap start when the internal user row is missing', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue({ id: 'u-1' });
    userRepository.findById.mockResolvedValue(null);

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow(
      'REDIRECT:/auth/bootstrap/start?redirect_url=%2Fdashboard',
    );
  });

  it('redirects onboarded users to /dashboard', async () => {
    identityProvider.getCurrentIdentity.mockResolvedValue({ id: 'u-1' });
    userRepository.findById.mockResolvedValue({
      id: 'u-1',
      onboardingComplete: true,
    });

    await expect(
      OnboardingGuard({ children: <div>content</div> }),
    ).rejects.toThrow('REDIRECT:/dashboard');
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
