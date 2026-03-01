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

  it('should map external user id to internal user id when mapper is configured', async () => {
    const mapper = {
      resolveOrCreateInternalUserId: vi
        .fn()
        .mockResolvedValue('00000000-0000-0000-0000-000000000123'),
    };

    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_123', email: 'test@example.com' }),
      {
        mapper,
        provider: 'clerk',
      },
    );

    const identity = await provider.getCurrentIdentity();

    expect(mapper.resolveOrCreateInternalUserId).toHaveBeenCalledWith({
      provider: 'clerk',
      externalUserId: 'user_123',
      email: 'test@example.com',
    });
    expect(identity).toEqual({
      id: '00000000-0000-0000-0000-000000000123',
      email: 'test@example.com',
    });
  });
});
