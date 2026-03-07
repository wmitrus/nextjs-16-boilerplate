/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: clerkClientMock,
}));

import { ClerkUserRepository } from './ClerkUserRepository';

describe('ClerkUserRepository', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    updateUserMock.mockReset();

    clerkClientMock.mockResolvedValue({
      users: {
        getUser: getUserMock,
        updateUser: updateUserMock,
      },
    });
  });

  it('merges existing publicMetadata when updating profile', async () => {
    getUserMock.mockResolvedValue({
      id: 'user_1',
      publicMetadata: {
        onboardingComplete: true,
        timezone: 'Europe/Warsaw',
      },
    });

    const repository = new ClerkUserRepository();

    await repository.updateProfile('user_1', {
      displayName: 'Alice',
      locale: 'pl-PL',
    });

    expect(updateUserMock).toHaveBeenCalledWith('user_1', {
      publicMetadata: {
        onboardingComplete: true,
        timezone: 'Europe/Warsaw',
        displayName: 'Alice',
        locale: 'pl-PL',
      },
    });
  });

  it('merges existing publicMetadata when updating onboarding status', async () => {
    getUserMock.mockResolvedValue({
      id: 'user_1',
      publicMetadata: {
        displayName: 'Alice',
        locale: 'pl-PL',
      },
    });

    const repository = new ClerkUserRepository();

    await repository.updateOnboardingStatus('user_1', true);

    expect(updateUserMock).toHaveBeenCalledWith('user_1', {
      publicMetadata: {
        displayName: 'Alice',
        locale: 'pl-PL',
        onboardingComplete: true,
      },
    });
  });
});
