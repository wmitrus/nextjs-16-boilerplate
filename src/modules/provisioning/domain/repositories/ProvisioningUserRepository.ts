import type { ExternalAuthProvider } from '@/core/contracts/identity';

export interface ResolvedUser {
  readonly internalUserId: string;
  readonly created: boolean;
}

/**
 * Write-path user repository for provisioning.
 * Creates users and their provider identity mappings idempotently.
 */
export interface ProvisioningUserRepository {
  resolveOrCreateUser(
    provider: ExternalAuthProvider,
    externalUserId: string,
    email?: string,
  ): Promise<ResolvedUser>;
}
