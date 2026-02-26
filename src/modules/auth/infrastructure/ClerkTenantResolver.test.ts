import { auth } from '@clerk/nextjs/server';
import { describe, expect, it, vi } from 'vitest';

import { ClerkTenantResolver } from './ClerkTenantResolver';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

describe('ClerkTenantResolver', () => {
  it('should resolve tenant from orgId', async () => {
    vi.mocked(auth).mockResolvedValue({
      orgId: 'org_123',
    } as Awaited<ReturnType<typeof auth>>);

    const resolver = new ClerkTenantResolver();
    const identity = {
      id: 'user_123',
    };

    const context = await resolver.resolve(identity);

    expect(context).toEqual({
      tenantId: 'org_123',
      userId: 'user_123',
    });
  });

  it('should return default tenant if no orgId is found', async () => {
    vi.mocked(auth).mockResolvedValue({
      orgId: null,
    } as Awaited<ReturnType<typeof auth>>);

    const resolver = new ClerkTenantResolver();
    const identity = {
      id: 'user_123',
    };

    const context = await resolver.resolve(identity);

    expect(context.tenantId).toBe('default');
  });
});
