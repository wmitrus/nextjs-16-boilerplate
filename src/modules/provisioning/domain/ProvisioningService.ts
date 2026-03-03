import type { ExternalAuthProvider } from '@/core/contracts/identity';

import type { TenancyMode } from './tenancy-mode';
import type { TenantContextSource } from './tenant-context-source';

/**
 * Input to ProvisioningService.ensureProvisioned().
 *
 * All fields derived from external provider claims or request context.
 * Internal UUIDs are never set here — they are resolved/created by the service.
 */
export interface ProvisioningInput {
  readonly provider: ExternalAuthProvider;
  readonly externalUserId: string;
  readonly email?: string;
  /**
   * Whether the email was verified by the auth provider.
   * Gates cross-provider email-based account linking.
   * Undefined or false → treated as unverified.
   */
  readonly emailVerified?: boolean;
  readonly tenantExternalId?: string;
  readonly tenantRole?: string;
  readonly activeTenantId?: string;
  readonly tenancyMode: TenancyMode;
  readonly tenantContextSource?: TenantContextSource;
}

/**
 * Result of a successful ensureProvisioned() call.
 * All IDs are internal database UUIDs.
 */
export interface ProvisioningResult {
  readonly internalUserId: string;
  readonly internalTenantId: string;
  readonly membershipRole: 'owner' | 'member';
  readonly tenantCreatedNow: boolean;
  readonly userCreatedNow: boolean;
}

/**
 * Write-path service that idempotently provisions users, tenants, and memberships.
 *
 * INVARIANT: Must run all steps in a single atomic transaction.
 * INVARIANT: Never escalates an existing membership role.
 * INVARIANT: Never inserts wildcard policies (resource='*' or actions=['*']).
 * INVARIANT: Enforces free-tier user limits before new membership inserts.
 */
export interface ProvisioningService {
  ensureProvisioned(input: ProvisioningInput): Promise<ProvisioningResult>;
}
