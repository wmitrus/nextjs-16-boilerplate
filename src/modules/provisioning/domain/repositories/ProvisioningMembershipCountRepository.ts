/**
 * Read-only membership count repository for provisioning.
 * Used to enforce free-tier user limits before new membership inserts.
 */
export interface ProvisioningMembershipCountRepository {
  getActiveCount(tenantId: string): Promise<number>;
}
