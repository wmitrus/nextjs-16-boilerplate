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
        timezone: 'UTC',
      },
    });

    const repository = new ClerkUserRepository();

    await repository.updateProfile('user_1', {
      targetLanguage: 'en',
      proficiencyLevel: 'b2',
    });

    expect(updateUserMock).toHaveBeenCalledWith('user_1', {
      publicMetadata: {
        onboardingComplete: true,
        timezone: 'UTC',
        targetLanguage: 'en',
        proficiencyLevel: 'b2',
      },
    });
  });

  it('merges existing publicMetadata when updating onboarding status', async () => {
    getUserMock.mockResolvedValue({
      id: 'user_1',
      publicMetadata: {
        timezone: 'UTC',
        targetLanguage: 'en',
      },
    });

    const repository = new ClerkUserRepository();

    await repository.updateOnboardingStatus('user_1', true);

    expect(updateUserMock).toHaveBeenCalledWith('user_1', {
      publicMetadata: {
        timezone: 'UTC',
        targetLanguage: 'en',
        onboardingComplete: true,
      },
    });
  });
});
