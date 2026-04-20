import { describe, expect, it, vi } from 'vitest';

import { TenantNotProvisionedError } from '@/core/contracts/identity';

import { PersonalOrganizationResolver } from './PersonalOrganizationResolver';

const makeLookup = (personalTenantId: string | null) => ({
  findInternalUserId: vi.fn(),
  findInternalOrganizationId: vi.fn(),
  findPersonalOrganizationId: vi.fn().mockResolvedValue(personalTenantId),
});

describe('PersonalOrganizationResolver', () => {
  const identity = { id: '00000000-0000-0000-0000-000000000999' };

  it('returns the personal tenant for the given user', async () => {
    const lookup = makeLookup('10000000-0000-4000-8000-000000000001');
    const resolver = new PersonalOrganizationResolver(lookup);

    const context = await resolver.resolve(identity);

    expect(lookup.findPersonalOrganizationId).toHaveBeenCalledWith(identity.id);
    expect(context.organizationId).toBe('10000000-0000-4000-8000-000000000001');
    expect(context.userId).toBe(identity.id);
  });

  it('throws TenantNotProvisionedError when personal tenant is not found', async () => {
    const lookup = makeLookup(null);
    const resolver = new PersonalOrganizationResolver(lookup);

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      TenantNotProvisionedError,
    );
  });

  it('does not call findInternalOrganizationId or findInternalUserId', async () => {
    const lookup = makeLookup('10000000-0000-4000-8000-000000000001');
    const resolver = new PersonalOrganizationResolver(lookup);

    await resolver.resolve(identity);

    expect(lookup.findInternalOrganizationId).not.toHaveBeenCalled();
    expect(lookup.findInternalUserId).not.toHaveBeenCalled();
  });
});
