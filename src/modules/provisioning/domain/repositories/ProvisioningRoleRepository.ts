/**
 * Write-path role repository for provisioning.
 * Ensures canonical system roles exist for a tenant.
 */
export interface ProvisioningRoleRepository {
  /**
   * Upserts the specified roles for a tenant.
   * Returns a map of role name → internal role UUID.
   * Safe to call multiple times (idempotent).
   */
  ensureRoles(
    tenantId: string,
    roleNames: ReadonlyArray<'owner' | 'member'>,
  ): Promise<Map<string, string>>;
}
