export interface ExistingMembership {
  readonly roleId: string;
  readonly roleName: string;
}

/**
 * Write-path membership repository for provisioning.
 * Handles idempotent membership insertion and lookup.
 */
export interface ProvisioningMembershipRepository {
  getMembership(
    userId: string,
    tenantId: string,
  ): Promise<ExistingMembership | null>;

  /**
   * Inserts a membership record idempotently.
   * INVARIANT: Must NOT escalate an existing membership's role.
   * If a membership already exists, this is a no-op.
   */
  insertMembership(
    userId: string,
    tenantId: string,
    roleId: string,
  ): Promise<void>;
}
