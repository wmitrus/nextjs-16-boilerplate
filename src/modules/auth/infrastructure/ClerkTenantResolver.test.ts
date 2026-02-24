import { describe, expect, it } from 'vitest';

import { ClerkTenantResolver } from './ClerkTenantResolver';

describe('ClerkTenantResolver', () => {
  it('should resolve tenant from metadata tenantId', async () => {
    const resolver = new ClerkTenantResolver();
    const identity = {
      id: 'user_123',
      attributes: {
        tenantId: 'tenant_abc',
      },
    };

    const context = await resolver.resolve(identity);

    expect(context).toEqual({
      tenantId: 'tenant_abc',
      userId: 'user_123',
    });
  });

  it('should resolve tenant from orgId if tenantId is missing', async () => {
    const resolver = new ClerkTenantResolver();
    const identity = {
      id: 'user_123',
      attributes: {
        orgId: 'org_123',
      },
    };

    const context = await resolver.resolve(identity);

    expect(context).toEqual({
      tenantId: 'org_123',
      userId: 'user_123',
    });
  });

  it('should return default tenant if no ID is found', async () => {
    const resolver = new ClerkTenantResolver();
    const identity = {
      id: 'user_123',
      attributes: {},
    };

    const context = await resolver.resolve(identity);

    expect(context.tenantId).toBe('default');
  });
});
