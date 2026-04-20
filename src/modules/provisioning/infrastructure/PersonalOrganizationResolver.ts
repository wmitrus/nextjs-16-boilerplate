import type { Identity } from '@/core/contracts/identity';
import type { InternalIdentityLookup } from '@/core/contracts/identity';
import { TenantNotProvisionedError } from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

/**
 * TENANCY_MODE=personal: each user has exactly one personal organization.
 * Looks up the personal organization via InternalIdentityLookup.findPersonalOrganizationId().
 * Throws TenantNotProvisionedError if no personal organization exists yet (onboarding required).
 */
export class PersonalOrganizationResolver implements TenantResolver {
  constructor(private readonly lookup: InternalIdentityLookup) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const organizationId = await this.lookup.findPersonalOrganizationId(
      identity.id,
    );

    if (!organizationId) {
      throw new TenantNotProvisionedError(
        'Personal tenant not provisioned. Complete onboarding to create your personal tenant.',
      );
    }

    return {
      organizationId,
      tenantId: organizationId,
      userId: identity.id,
    };
  }
}
