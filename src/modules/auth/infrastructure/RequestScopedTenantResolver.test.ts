/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

import type { RequestIdentitySource } from '@/core/contracts/identity';
import { MissingTenantContextError } from '@/core/contracts/tenancy';

import { RequestScopedTenantResolver } from './RequestScopedTenantResolver';

function makeSource(data: {
  userId?: string;
  orgId?: string;
  email?: string;
}): RequestIdentitySource {
  return { get: vi.fn().mockResolvedValue(data) };
}

describe('RequestScopedTenantResolver', () => {
  it('should resolve tenant from orgId', async () => {
    const resolver = new RequestScopedTenantResolver(
      makeSource({ orgId: 'org_123' }),
    );
    const context = await resolver.resolve({ id: 'user_123' });

    expect(context).toEqual({ tenantId: 'org_123', userId: 'user_123' });
  });

  it('should throw when orgId is absent', async () => {
    const resolver = new RequestScopedTenantResolver(makeSource({}));
    await expect(resolver.resolve({ id: 'user_456' })).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });

  it('should throw when orgId is undefined', async () => {
    const resolver = new RequestScopedTenantResolver(
      makeSource({ orgId: undefined }),
    );
    await expect(resolver.resolve({ id: 'user_789' })).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });

  it('should map external orgId to internal tenant id when mapper is configured', async () => {
    const mapper = {
      resolveOrCreateInternalTenantId: vi
        .fn()
        .mockResolvedValue('10000000-0000-0000-0000-000000000123'),
    };

    const resolver = new RequestScopedTenantResolver(
      makeSource({ orgId: 'org_123' }),
      {
        mapper,
        provider: 'clerk',
      },
    );
    const context = await resolver.resolve({
      id: '00000000-0000-0000-0000-000000000999',
    });

    expect(mapper.resolveOrCreateInternalTenantId).toHaveBeenCalledWith({
      provider: 'clerk',
      externalTenantId: 'org_123',
    });
    expect(context).toEqual({
      tenantId: '10000000-0000-0000-0000-000000000123',
      userId: '00000000-0000-0000-0000-000000000999',
    });
  });
});
