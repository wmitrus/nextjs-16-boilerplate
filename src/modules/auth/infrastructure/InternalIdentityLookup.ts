import type { ExternalAuthProvider } from './ExternalIdentityMapper';

/**
 * Read-only lookup: resolves external provider IDs to internal database UUIDs.
 *
 * INVARIANT: Pure read-path — zero write side-effects (no INSERT/UPDATE/UPSERT).
 * Returns null when no mapping exists. Never auto-creates records.
 *
 * Write-path (create/link user, tenant, membership, role) belongs exclusively
 * to ProvisioningService.ensureProvisioned().
 */
export interface InternalIdentityLookup {
  /**
   * Looks up the internal user UUID for a given provider + external user ID pair.
   * Returns null if no mapping exists (user not yet provisioned).
   */
  findInternalUserId(
    provider: ExternalAuthProvider,
    externalUserId: string,
  ): Promise<string | null>;

  /**
   * Looks up the internal tenant UUID for a given provider + external tenant ID pair.
   * Returns null if no mapping exists (tenant not yet provisioned).
   */
  findInternalTenantId(
    provider: ExternalAuthProvider,
    externalTenantId: string,
  ): Promise<string | null>;
}
