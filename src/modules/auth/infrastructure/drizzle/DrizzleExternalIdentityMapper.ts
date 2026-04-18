import { and, eq } from 'drizzle-orm';

import type { ExternalAuthProvider } from '@/core/contracts/identity';
import type { DrizzleDb } from '@/core/db';

import {
  authOrganizationIdentitiesTable,
  authUserIdentitiesTable,
} from './schema';

/**
 * @deprecated Use DrizzleInternalIdentityLookup for read-only ID resolution.
 * This class retains minimal SELECT-only methods for backward compatibility.
 * Write-path operations (resolveOrCreate*, ensureTenantAccess) have been moved to
 * ProvisioningService.ensureProvisioned() and are no longer available here.
 */
export class DrizzleExternalIdentityMapper {
  constructor(private readonly db: DrizzleDb) {}

  async resolveInternalUserId(
    provider: ExternalAuthProvider,
    externalUserId: string,
  ): Promise<string | null> {
    const result = await this.db
      .select({ userId: authUserIdentitiesTable.userId })
      .from(authUserIdentitiesTable)
      .where(
        and(
          eq(authUserIdentitiesTable.provider, provider),
          eq(authUserIdentitiesTable.externalUserId, externalUserId),
        ),
      )
      .limit(1);

    return result[0]?.userId ?? null;
  }

  async resolveInternalOrganizationId(
    provider: ExternalAuthProvider,
    externalOrgId: string,
  ): Promise<string | null> {
    const result = await this.db
      .select({
        organizationId: authOrganizationIdentitiesTable.organizationId,
      })
      .from(authOrganizationIdentitiesTable)
      .where(
        and(
          eq(authOrganizationIdentitiesTable.provider, provider),
          eq(authOrganizationIdentitiesTable.externalOrgId, externalOrgId),
        ),
      )
      .limit(1);

    return result[0]?.organizationId ?? null;
  }
}
