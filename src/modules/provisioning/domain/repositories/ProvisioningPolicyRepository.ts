export interface PolicyDefault {
  readonly effect: 'allow' | 'deny';
  readonly resource: string;
  readonly actions: string[];
  readonly conditions?: Record<string, unknown>;
}

/**
 * Write-path policy repository for provisioning.
 * Used by policy template versioning (PR-3) to upsert default policies for a role.
 *
 * INVARIANT: Must never insert policies with resource='*' or actions=['*'].
 */
export interface ProvisioningPolicyRepository {
  upsertPolicyDefaults(
    tenantId: string,
    roleId: string,
    policies: PolicyDefault[],
  ): Promise<void>;
}
