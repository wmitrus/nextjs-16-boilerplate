/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

import type { RequestIdentitySource } from '@/core/contracts/identity';
import { UserNotProvisionedError } from '@/core/contracts/identity';

import { RequestScopedIdentityProvider } from './RequestScopedIdentityProvider';

function makeSource(data: {
  userId?: string;
  email?: string;
  tenantExternalId?: string;
  tenantRole?: string;
}): RequestIdentitySource {
  return { get: vi.fn().mockResolvedValue(data) };
}

describe('RequestScopedIdentityProvider', () => {
  it('returns null when userId is absent', async () => {
    const provider = new RequestScopedIdentityProvider(makeSource({}));
    expect(await provider.getCurrentIdentity()).toBeNull();
  });

  it('returns null when userId is undefined', async () => {
    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: undefined }),
    );
    expect(await provider.getCurrentIdentity()).toBeNull();
  });

  it('returns identity with id and email when userId is present (no lookup)', async () => {
    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_123', email: 'test@example.com' }),
    );
    const identity = await provider.getCurrentIdentity();

    expect(identity).toEqual({ id: 'user_123', email: 'test@example.com' });
  });

  it('returns identity without email when email is absent (no lookup)', async () => {
    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_456' }),
    );
    const identity = await provider.getCurrentIdentity();

    expect(identity).toEqual({ id: 'user_456', email: undefined });
  });

  it('maps external user id to internal user id via lookup', async () => {
    const lookup = {
      findInternalUserId: vi
        .fn()
        .mockResolvedValue('00000000-0000-0000-0000-000000000123'),
      findInternalTenantId: vi.fn(),
      findPersonalTenantId: vi.fn(),
    };

    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_123', email: 'test@example.com' }),
      { lookup, provider: 'clerk' },
    );

    const identity = await provider.getCurrentIdentity();

    expect(lookup.findInternalUserId).toHaveBeenCalledWith('clerk', 'user_123');
    expect(identity).toEqual({
      id: '00000000-0000-0000-0000-000000000123',
      email: 'test@example.com',
    });
  });

  it('throws UserNotProvisionedError when lookup returns null (user not provisioned)', async () => {
    const lookup = {
      findInternalUserId: vi.fn().mockResolvedValue(null),
      findInternalTenantId: vi.fn(),
      findPersonalTenantId: vi.fn(),
    };

    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_unprovisioned' }),
      { lookup, provider: 'clerk' },
    );

    await expect(provider.getCurrentIdentity()).rejects.toBeInstanceOf(
      UserNotProvisionedError,
    );
  });

  it('does not call any write-path methods — lookup is read-only', async () => {
    const lookup = {
      findInternalUserId: vi.fn().mockResolvedValue(null),
      findInternalTenantId: vi.fn(),
      findPersonalTenantId: vi.fn(),
    };
    const insert = vi.fn();

    const provider = new RequestScopedIdentityProvider(
      makeSource({ userId: 'user_ext' }),
      { lookup, provider: 'clerk' },
    );

    await provider.getCurrentIdentity().catch(() => {});

    expect(insert).not.toHaveBeenCalled();
    expect(lookup.findInternalTenantId).not.toHaveBeenCalled();
  });
});
