import type { Identity } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

import type { InternalIdentityLookup } from '@/modules/auth/infrastructure/InternalIdentityLookup';

/**
 * TENANCY_MODE=personal: each user has exactly one personal tenant.
 * Looks up the personal tenant via InternalIdentityLookup.findPersonalTenantId().
 * Throws TenantNotProvisionedError if no personal tenant exists yet (onboarding required).
 */
export class PersonalTenantResolver implements TenantResolver {
  constructor(private readonly lookup: InternalIdentityLookup) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const tenantId = await this.lookup.findPersonalTenantId(identity.id);

    if (!tenantId) {
      throw new TenantNotProvisionedError(
        'Personal tenant not provisioned. Complete onboarding to create your personal tenant.',
      );
    }

    return {
      tenantId,
      userId: identity.id,
    };
  }
}
