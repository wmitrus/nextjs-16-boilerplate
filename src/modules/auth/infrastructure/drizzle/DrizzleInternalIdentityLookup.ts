import { and, eq } from 'drizzle-orm';

import type {
  ExternalAuthProvider,
  InternalIdentityLookup,
} from '@/core/contracts/identity';
import type { DrizzleDb } from '@/core/db';

import {
  authOrganizationIdentitiesTable,
  authUserIdentitiesTable,
} from './schema';

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

  async findInternalOrganizationId(
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

  async findPersonalOrganizationId(
    internalUserId: string,
  ): Promise<string | null> {
    const result = await this.db
      .select({
        organizationId: authOrganizationIdentitiesTable.organizationId,
      })
      .from(authOrganizationIdentitiesTable)
      .where(
        and(
          eq(authOrganizationIdentitiesTable.provider, 'personal'),
          eq(authOrganizationIdentitiesTable.externalOrgId, internalUserId),
        ),
      )
      .limit(1);

    return result[0]?.organizationId ?? null;
  }
}
