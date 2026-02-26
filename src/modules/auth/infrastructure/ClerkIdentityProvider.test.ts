/** @vitest-environment node */
import { auth } from '@clerk/nextjs/server';
import { describe, expect, it, vi } from 'vitest';

import { ClerkIdentityProvider } from './ClerkIdentityProvider';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

describe('ClerkIdentityProvider', () => {
  it('should return null when no user is logged in', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      sessionClaims: null,
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const provider = new ClerkIdentityProvider();
    const identity = await provider.getCurrentIdentity();

    expect(identity).toBeNull();
  });

  it('should return identity when user is logged in', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      sessionClaims: {
        email: 'test@example.com',
        metadata: {
          role: 'admin',
          onboardingComplete: true,
        },
      },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const provider = new ClerkIdentityProvider();
    const identity = await provider.getCurrentIdentity();

    expect(identity).toEqual({
      id: 'user_123',
      email: 'test@example.com',
    });
  });

  it('should return identity from session claims', async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: 'user_123',
      sessionClaims: {
        email: 'test@example.com',
      },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const provider = new ClerkIdentityProvider();
    const identity = await provider.getCurrentIdentity();

    expect(identity?.id).toBe('user_123');
    expect(identity?.email).toBe('test@example.com');
  });
});
