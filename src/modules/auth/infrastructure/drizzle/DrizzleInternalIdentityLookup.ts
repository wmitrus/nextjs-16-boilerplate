import { and, eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import type { ExternalAuthProvider } from '../ExternalIdentityMapper';
import type { InternalIdentityLookup } from '../InternalIdentityLookup';

import { authTenantIdentitiesTable, authUserIdentitiesTable } from './schema';

/**
 * SELECT-only implementation of InternalIdentityLookup.
 * No write side-effects — never inserts, updates, or creates records.
 */
export class DrizzleInternalIdentityLookup implements InternalIdentityLookup {
  constructor(private readonly db: DrizzleDb) {}

  async findInternalUserId(
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

  async findInternalTenantId(
    provider: ExternalAuthProvider,
    externalTenantId: string,
  ): Promise<string | null> {
    const result = await this.db
      .select({ tenantId: authTenantIdentitiesTable.tenantId })
      .from(authTenantIdentitiesTable)
      .where(
        and(
          eq(authTenantIdentitiesTable.provider, provider),
          eq(authTenantIdentitiesTable.externalTenantId, externalTenantId),
        ),
      )
      .limit(1);

    return result[0]?.tenantId ?? null;
  }
}
