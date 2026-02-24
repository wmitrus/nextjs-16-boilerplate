import type { Identity } from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

export class ClerkTenantResolver implements TenantResolver {
  async resolve(identity: Identity): Promise<TenantContext> {
    const tenantId =
      (identity.attributes?.tenantId as string) ||
      (identity.attributes?.orgId as string) ||
      'default';

    return {
      tenantId,
      userId: identity.id,
    };
  }
}
