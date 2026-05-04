import type { Identity } from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

/**
 * TENANCY_MODE=single: all users share one fixed tenant.
 * DEFAULT_TENANT_ID points at the parent tenant UUID, while downstream authz
 * expects the canonical organization UUID. When a lookup is provided, resolve
 * the default organization once per request and propagate that UUID.
 */
export class SingleTenantResolver implements TenantResolver {
  constructor(
    private readonly defaultTenantId: string,
    private readonly resolveOrganizationId?: (
      defaultTenantId: string,
    ) => Promise<string | null>,
  ) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const organizationId =
      (await this.resolveOrganizationId?.(this.defaultTenantId)) ??
      this.defaultTenantId;

    return {
      organizationId,
      tenantId: organizationId,
      userId: identity.id,
    };
  }
}
