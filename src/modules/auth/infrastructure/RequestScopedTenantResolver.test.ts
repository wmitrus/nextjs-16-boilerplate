/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';

import type { RequestIdentitySource } from '@/core/contracts/identity';

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

  it('should fall back to identity.id when orgId is absent (personal workspace)', async () => {
    const resolver = new RequestScopedTenantResolver(makeSource({}));
    const context = await resolver.resolve({ id: 'user_456' });

    expect(context.tenantId).toBe('user_456');
    expect(context.userId).toBe('user_456');
  });

  it('should fall back to identity.id when orgId is undefined (personal workspace)', async () => {
    const resolver = new RequestScopedTenantResolver(
      makeSource({ orgId: undefined }),
    );
    const context = await resolver.resolve({ id: 'user_789' });

    expect(context.tenantId).toBe('user_789');
  });
});
