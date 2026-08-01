import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOutMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    signOut: signOutMock,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

import { useSignOut } from './useSignOut';

describe('useSignOut', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    signOutMock.mockReset();
    pushMock.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('signs out through the auth provider and redirects to sign-in', async () => {
    signOutMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSignOut());

    await act(async () => {
      await result.current();
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/sign-in');
  });

  it('falls back to hard navigation when provider sign-out fails', async () => {
    const locationStub = { href: 'http://localhost/dashboard' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: locationStub,
    });
    signOutMock.mockRejectedValue(new Error('provider unavailable'));
    const { result } = renderHook(() => useSignOut());

    await expect(
      act(async () => {
        await result.current();
      }),
    ).resolves.toBeUndefined();

    expect(pushMock).not.toHaveBeenCalled();
    expect(locationStub.href).toBe('/sign-in');
  });
});
