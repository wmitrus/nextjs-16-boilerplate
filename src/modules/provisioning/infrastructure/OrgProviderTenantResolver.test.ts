import { describe, expect, it, vi } from 'vitest';

import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { MissingTenantContextError } from '@/core/contracts/tenancy';

import { OrgProviderTenantResolver } from './OrgProviderTenantResolver';

const makeSource = (data: { tenantExternalId?: string }) => ({
  get: vi.fn().mockResolvedValue(data),
});

const makeLookup = (internalTenantId: string | null) => ({
  findInternalUserId: vi.fn(),
  findInternalTenantId: vi.fn().mockResolvedValue(internalTenantId),
  findPersonalTenantId: vi.fn(),
});

describe('OrgProviderTenantResolver', () => {
  const identity = { id: '00000000-0000-0000-0000-000000000999' };

  it('resolves internal tenant id from provider external id', async () => {
    const source = makeSource({ tenantExternalId: 'org_ext_123' });
    const lookup = makeLookup('10000000-0000-0000-0000-000000000001');
    const resolver = new OrgProviderTenantResolver(source, lookup, 'clerk');

    const context = await resolver.resolve(identity);

    expect(lookup.findInternalTenantId).toHaveBeenCalledWith(
      'clerk',
      'org_ext_123',
    );
    expect(context.tenantId).toBe('10000000-0000-0000-0000-000000000001');
    expect(context.userId).toBe(identity.id);
  });

  it('throws MissingTenantContextError when no tenantExternalId in provider claims', async () => {
    const source = makeSource({});
    const lookup = makeLookup('10000000-0000-0000-0000-000000000001');
    const resolver = new OrgProviderTenantResolver(source, lookup, 'clerk');

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    expect(lookup.findInternalTenantId).not.toHaveBeenCalled();
  });

  it('throws TenantNotProvisionedError when external org has no internal mapping', async () => {
    const source = makeSource({ tenantExternalId: 'org_not_provisioned' });
    const lookup = makeLookup(null);
    const resolver = new OrgProviderTenantResolver(source, lookup, 'clerk');

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      TenantNotProvisionedError,
    );
  });
});
