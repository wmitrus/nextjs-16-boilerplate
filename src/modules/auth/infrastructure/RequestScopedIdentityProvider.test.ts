/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

import type { RequestIdentitySource } from '@/core/contracts/identity';

import { RequestScopedIdentityProvider } from './RequestScopedIdentityProvider';

function makeSource(data: {
  userId?: string;
  orgId?: string;
  email?: string;
}): RequestIdentitySource {
  return { get: vi.fn().mockResolvedValue(data) };
}

describe('RequestScopedIdentityProvider', () => {
  it('should return null when userId is absent', async () => {
    const provider = new RequestScopedIdentityProvider(makeSource({}));
    expect(await provider.getCurrentIdentity()).toBeNull();
  });

  it('should return null when userId is undefined', async () => {
    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: undefined }),
    );
    expect(await provider.getCurrentIdentity()).toBeNull();
  });

  it('should return identity with id and email when userId is present', async () => {
    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_123', email: 'test@example.com' }),
    );
    const identity = await provider.getCurrentIdentity();

    expect(identity).toEqual({ id: 'user_123', email: 'test@example.com' });
  });

  it('should return identity without email when email is absent', async () => {
    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_456' }),
    );
    const identity = await provider.getCurrentIdentity();

    expect(identity).toEqual({ id: 'user_456', email: undefined });
  });
});
