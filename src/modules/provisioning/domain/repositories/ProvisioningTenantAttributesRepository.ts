export interface TenantAttributesDefaults {
  readonly plan: string;
  readonly contractType: 'standard' | 'enterprise';
  readonly maxUsers: number;
  readonly features: string[];
}

/**
 * Write-path tenant attributes repository for provisioning.
 * Upserts default tenant configuration on first provisioning.
 */
export interface ProvisioningTenantAttributesRepository {
  upsertDefaults(
    tenantId: string,
    defaults: TenantAttributesDefaults,
  ): Promise<void>;
}
