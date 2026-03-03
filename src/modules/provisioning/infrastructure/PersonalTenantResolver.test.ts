import { describe, expect, it, vi } from 'vitest';

import { TenantNotProvisionedError } from '@/core/contracts/identity';

import { PersonalTenantResolver } from './PersonalTenantResolver';

const makeLookup = (personalTenantId: string | null) => ({
  findInternalUserId: vi.fn(),
  findInternalTenantId: vi.fn(),
  findPersonalTenantId: vi.fn().mockResolvedValue(personalTenantId),
});

describe('PersonalTenantResolver', () => {
  const identity = { id: '00000000-0000-0000-0000-000000000999' };

  it('returns the personal tenant for the given user', async () => {
    const lookup = makeLookup('10000000-0000-0000-0000-000000000001');
    const resolver = new PersonalTenantResolver(lookup);

    const context = await resolver.resolve(identity);

    expect(lookup.findPersonalTenantId).toHaveBeenCalledWith(identity.id);
    expect(context.tenantId).toBe('10000000-0000-0000-0000-000000000001');
    expect(context.userId).toBe(identity.id);
  });

  it('throws TenantNotProvisionedError when personal tenant is not found', async () => {
    const lookup = makeLookup(null);
    const resolver = new PersonalTenantResolver(lookup);

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      TenantNotProvisionedError,
    );
  });

  it('does not call findInternalTenantId or findInternalUserId', async () => {
    const lookup = makeLookup('10000000-0000-0000-0000-000000000001');
    const resolver = new PersonalTenantResolver(lookup);

    await resolver.resolve(identity);

    expect(lookup.findInternalTenantId).not.toHaveBeenCalled();
    expect(lookup.findInternalUserId).not.toHaveBeenCalled();
  });
});
