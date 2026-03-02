import { and, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import type {
  ExternalAuthProvider,
  ExternalIdentityMapper,
} from '../ExternalIdentityMapper';

import { authTenantIdentitiesTable, authUserIdentitiesTable } from './schema';

import { tenantsTable } from '@/modules/authorization/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

function sanitizeForEmailLocalPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .slice(0, 64);
}

function buildFallbackEmail(
  provider: ExternalAuthProvider,
  externalId: string,
) {
  const safeProvider = sanitizeForEmailLocalPart(provider);
  const safeId = sanitizeForEmailLocalPart(externalId);
  return `external+${safeProvider}-${safeId}@local.invalid`;
}

function buildTenantName(externalTenantId: string): string {
  return `Tenant ${externalTenantId.slice(0, 16)}`;
}

/**
 * @deprecated Write-path methods (resolveOrCreate*) are being moved to ProvisioningService (PR-2).
 * Use DrizzleInternalIdentityLookup for read-only ID resolution in the request lifecycle.
 * This class will be removed once ProvisioningService is wired.
 */
export class DrizzleExternalIdentityMapper implements ExternalIdentityMapper {
  constructor(private readonly db: DrizzleDb) {}

  async resolveOrCreateInternalUserId(args: {
    provider: ExternalAuthProvider;
    externalUserId: string;
    email?: string;
  }): Promise<string> {
    const { provider, externalUserId, email } = args;

    const existing = await this.db
      .select({ userId: authUserIdentitiesTable.userId })
      .from(authUserIdentitiesTable)
      .where(
        and(
          eq(authUserIdentitiesTable.provider, provider),
          eq(authUserIdentitiesTable.externalUserId, externalUserId),
        ),
      )
      .limit(1);

    if (existing[0]?.userId) {
      return existing[0].userId;
    }

    const userId = crypto.randomUUID();
    await this.db
      .insert(usersTable)
      .values({
        id: userId,
        email: email ?? buildFallbackEmail(provider, externalUserId),
      })
      .onConflictDoNothing();

    await this.db
      .insert(authUserIdentitiesTable)
      .values({
        provider,
        externalUserId,
        userId,
      })
      .onConflictDoNothing();

    const resolved = await this.db
      .select({ userId: authUserIdentitiesTable.userId })
      .from(authUserIdentitiesTable)
      .where(
        and(
          eq(authUserIdentitiesTable.provider, provider),
          eq(authUserIdentitiesTable.externalUserId, externalUserId),
        ),
      )
      .limit(1);

    if (!resolved[0]?.userId) {
      throw new Error(
        '[auth] Failed to resolve internal user mapping after create-or-link operation.',
      );
    }

    return resolved[0].userId;
  }

  async resolveOrCreateInternalTenantId(args: {
    provider: ExternalAuthProvider;
    externalTenantId: string;
  }): Promise<string> {
    const { provider, externalTenantId } = args;

    const existing = await this.db
      .select({ tenantId: authTenantIdentitiesTable.tenantId })
      .from(authTenantIdentitiesTable)
      .where(
        and(
          eq(authTenantIdentitiesTable.provider, provider),
          eq(authTenantIdentitiesTable.externalTenantId, externalTenantId),
        ),
      )
      .limit(1);

    if (existing[0]?.tenantId) {
      return existing[0].tenantId;
    }

    const tenantId = crypto.randomUUID();
    await this.db
      .insert(tenantsTable)
      .values({
        id: tenantId,
        name: buildTenantName(externalTenantId),
      })
      .onConflictDoNothing();

    await this.db
      .insert(authTenantIdentitiesTable)
      .values({
        provider,
        externalTenantId,
        tenantId,
      })
      .onConflictDoNothing();

    const resolved = await this.db
      .select({ tenantId: authTenantIdentitiesTable.tenantId })
      .from(authTenantIdentitiesTable)
      .where(
        and(
          eq(authTenantIdentitiesTable.provider, provider),
          eq(authTenantIdentitiesTable.externalTenantId, externalTenantId),
        ),
      )
      .limit(1);

    if (!resolved[0]?.tenantId) {
      throw new Error(
        '[auth] Failed to resolve internal tenant mapping after create-or-link operation.',
      );
    }

    return resolved[0].tenantId;
  }

  ensureTenantAccess(_args: {
    internalUserId: string;
    internalTenantId: string;
  }): Promise<void> {
    throw new Error(
      '[DrizzleExternalIdentityMapper] ensureTenantAccess has been removed. ' +
        'Membership bootstrap is handled exclusively by ProvisioningService.ensureProvisioned().',
    );
  }
}
