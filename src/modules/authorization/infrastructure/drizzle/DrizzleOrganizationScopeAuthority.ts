import { eq } from 'drizzle-orm';

import type { OrganizationScopeAuthority } from '@/core/contracts/access-scope-authority';
import type { DrizzleDb } from '@/core/db/types';

import { DrizzleMembershipRepository } from './DrizzleMembershipRepository';
import { organizationsTable } from './schema';

/**
 * OZI-71 Slice 2 — Drizzle implementation of the neutral
 * {@link OrganizationScopeAuthority} port (`@/core/contracts/access-scope-authority`).
 *
 * `deriveOrganizationScope` calls both methods with the SAME requested
 * organization id (and `isMember` with the caller's `AccessContext.userId`),
 * so the two authoritative facts an `organization` scope needs are always
 * about that one organization — a consumer cannot pair membership for one
 * organization with the parent tenant (or requested id) of another.
 *
 * The `organizations.id -> tenant_id` read is otherwise only inlined
 * privately in `DrizzleAdminOrganizations{Mutation,Read}Service`; membership
 * reuses `DrizzleMembershipRepository` rather than duplicating the SQL. No
 * write, no cache (never cache an organization -> tenant ownership), no
 * schema change.
 *
 * NOT wired into any runtime path in this slice.
 */
export class DrizzleOrganizationScopeAuthority implements OrganizationScopeAuthority {
  private readonly memberships: DrizzleMembershipRepository;

  constructor(private readonly db: DrizzleDb) {
    this.memberships = new DrizzleMembershipRepository(db);
  }

  async readParentTenantId(organizationId: string): Promise<string | null> {
    const rows = await this.db
      .select({ tenantId: organizationsTable.tenantId })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);

    return rows[0]?.tenantId ?? null;
  }

  isMember(userId: string, organizationId: string): Promise<boolean> {
    return this.memberships.isMember(userId, organizationId);
  }
}
