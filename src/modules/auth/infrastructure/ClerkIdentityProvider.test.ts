import { auth } from '@clerk/nextjs/server';
import { describe, expect, it, vi } from 'vitest';

import { ClerkIdentityProvider } from './ClerkIdentityProvider';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
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
        },
      },
    } as unknown as Awaited<ReturnType<typeof auth>>);

    const provider = new ClerkIdentityProvider();
    const identity = await provider.getCurrentIdentity();

    expect(identity).toEqual({
      id: 'user_123',
      email: 'test@example.com',
      attributes: {
        role: 'admin',
        orgId: undefined,
      },
    });
  });
});
