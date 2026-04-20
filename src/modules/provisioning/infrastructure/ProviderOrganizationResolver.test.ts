import { describe, expect, it, vi } from 'vitest';

import { TenantNotProvisionedError } from '@/core/contracts/identity';
import { MissingTenantContextError } from '@/core/contracts/tenancy';

import { ProviderOrganizationResolver } from './ProviderOrganizationResolver';

const makeSource = (data: { orgExternalId?: string }) => ({
  get: vi.fn().mockResolvedValue(data),
});

const makeLookup = (organizationId: string | null) => ({
  findInternalUserId: vi.fn(),
  findInternalOrganizationId: vi.fn().mockResolvedValue(organizationId),
  findPersonalOrganizationId: vi.fn(),
});

describe('ProviderOrganizationResolver', () => {
  const identity = { id: '00000000-0000-0000-0000-000000000999' };

  it('resolves internal tenant id from provider external id', async () => {
    const source = makeSource({ orgExternalId: 'org_ext_123' });
    const lookup = makeLookup('10000000-0000-4000-8000-000000000001');
    const resolver = new ProviderOrganizationResolver(source, lookup, 'clerk');

    const context = await resolver.resolve(identity);

    expect(lookup.findInternalOrganizationId).toHaveBeenCalledWith(
      'clerk',
      'org_ext_123',
    );
    expect(context.organizationId).toBe('10000000-0000-4000-8000-000000000001');
    expect(context.userId).toBe(identity.id);
  });

  it('throws MissingTenantContextError when no orgExternalId in provider claims', async () => {
    const source = makeSource({});
    const lookup = makeLookup('10000000-0000-4000-8000-000000000001');
    const resolver = new ProviderOrganizationResolver(source, lookup, 'clerk');

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
    expect(lookup.findInternalOrganizationId).not.toHaveBeenCalled();
  });

  it('throws TenantNotProvisionedError when external org has no internal mapping', async () => {
    const source = makeSource({ orgExternalId: 'org_not_provisioned' });
    const lookup = makeLookup(null);
    const resolver = new ProviderOrganizationResolver(source, lookup, 'clerk');

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      TenantNotProvisionedError,
    );
  });
});
