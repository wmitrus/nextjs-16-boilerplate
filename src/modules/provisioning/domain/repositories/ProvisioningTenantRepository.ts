import type { ExternalAuthProvider } from '@/core/contracts/identity';

export interface ResolvedTenant {
  readonly internalOrganizationId: string;
  readonly created: boolean;
}

/**
 * Write-path tenant repository for provisioning.
 * Mode-aware: each method covers a specific tenancy mode's resolution strategy.
 */
export interface ProvisioningTenantRepository {
  resolveOrCreateTenant(
    provider: ExternalAuthProvider,
    externalOrgId: string,
  ): Promise<ResolvedTenant>;

  resolveSingleTenant(tenantId: string): Promise<ResolvedTenant>;

  resolveOrCreatePersonalTenant(
    internalUserId: string,
  ): Promise<ResolvedTenant>;

  getOrFail(tenantId: string): Promise<ResolvedTenant>;
}
