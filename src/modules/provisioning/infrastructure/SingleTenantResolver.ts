import type { Identity } from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

/**
 * TENANCY_MODE=single: all users share one fixed tenant.
 * The tenant ID is set via DEFAULT_TENANT_ID env var.
 * No provider claims required. No DB lookup required.
 */
export class SingleTenantResolver implements TenantResolver {
  constructor(private readonly defaultTenantId: string) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    return {
      tenantId: this.defaultTenantId,
      userId: identity.id,
    };
  }
}
