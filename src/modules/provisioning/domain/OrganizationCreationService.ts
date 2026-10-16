import type { OrganizationId, TenantId } from '@/core/contracts/canonical-ids';

export interface OrganizationCreationInput {
  readonly organizationId: OrganizationId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly slug?: string;
}

export interface OrganizationCreationResult {
  readonly organizationId: OrganizationId;
  readonly createdNow: boolean;
}

/**
 * Canonical application boundary for creating Organizations.
 *
 * The caller must establish the authoritative internal Tenant and ensure its
 * tenant_attributes row exists before creation.
 *
 * Implementations must enforce maxOrganizations transactionally and must not
 * derive Tenant authority from request/provider identifiers.
 */
export interface OrganizationCreationService {
  create(input: OrganizationCreationInput): Promise<OrganizationCreationResult>;
}
