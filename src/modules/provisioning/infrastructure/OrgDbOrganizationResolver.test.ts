import { describe, expect, it, vi } from 'vitest';

import { MissingTenantContextError } from '@/core/contracts/tenancy';

import { OrgDbOrganizationResolver } from './OrgDbOrganizationResolver';

const makeActiveTenantSource = (tenantId: string | null) => ({
  getActiveTenantId: vi.fn().mockResolvedValue(tenantId),
});

describe('OrgDbOrganizationResolver', () => {
  const identity = { id: '00000000-0000-0000-0000-000000000999' };
  const tenantId = '10000000-0000-4000-8000-000000000001';

  it('returns the selected internal organization context', async () => {
    const source = makeActiveTenantSource(tenantId);
    const resolver = new OrgDbOrganizationResolver(source);

    const context = await resolver.resolve(identity);

    expect(source.getActiveTenantId).toHaveBeenCalledTimes(1);
    expect(context).toEqual({
      organizationId: tenantId,
      tenantId,
      userId: identity.id,
    });
  });

  it('throws MissingTenantContextError when no active organization is selected', async () => {
    const source = makeActiveTenantSource(null);
    const resolver = new OrgDbOrganizationResolver(source);

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });
});
