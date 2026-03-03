import { describe, expect, it } from 'vitest';

import { SingleTenantResolver } from './SingleTenantResolver';

describe('SingleTenantResolver', () => {
  const defaultTenantId = '00000000-0000-0000-0000-000000000001';
  const identity = { id: '00000000-0000-0000-0000-000000000999' };

  it('always returns the fixed default tenant for any identity', async () => {
    const resolver = new SingleTenantResolver(defaultTenantId);
    const context = await resolver.resolve(identity);
    expect(context.tenantId).toBe(defaultTenantId);
    expect(context.userId).toBe(identity.id);
  });

  it('does not require provider claims', async () => {
    const resolver = new SingleTenantResolver(defaultTenantId);
    const context = await resolver.resolve({ id: 'some-user-uuid' });
    expect(context.tenantId).toBe(defaultTenantId);
  });
});
