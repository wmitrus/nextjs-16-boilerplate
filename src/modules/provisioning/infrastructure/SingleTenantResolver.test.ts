import { describe, expect, it } from 'vitest';

import { SingleTenantResolver } from './SingleTenantResolver';

describe('SingleTenantResolver', () => {
  const defaultTenantId = '00000000-0000-0000-0000-000000000001';
  const identity = { id: '00000000-0000-0000-0000-000000000999' };

  it('always returns the fixed default tenant for any identity', async () => {
    const resolver = new SingleTenantResolver(defaultTenantId);
    const context = await resolver.resolve(identity);
    expect(context.organizationId).toBe(defaultTenantId);
    expect(context.userId).toBe(identity.id);
  });

  it('prefers the resolved default organization when lookup is available', async () => {
    const resolver = new SingleTenantResolver(
      defaultTenantId,
      async () => '15000000-0000-4000-8000-000000000001',
    );

    const context = await resolver.resolve(identity);

    expect(context.organizationId).toBe('15000000-0000-4000-8000-000000000001');
    expect(context.tenantId).toBe('15000000-0000-4000-8000-000000000001');
  });

  it('falls back to the configured tenant id when no organization can be resolved', async () => {
    const resolver = new SingleTenantResolver(
      defaultTenantId,
      async () => null,
    );

    const context = await resolver.resolve(identity);

    expect(context.organizationId).toBe(defaultTenantId);
    expect(context.tenantId).toBe(defaultTenantId);
  });

  it('does not require provider claims', async () => {
    const resolver = new SingleTenantResolver(defaultTenantId);
    const context = await resolver.resolve({ id: 'some-user-uuid' });
    expect(context.organizationId).toBe(defaultTenantId);
  });
});
