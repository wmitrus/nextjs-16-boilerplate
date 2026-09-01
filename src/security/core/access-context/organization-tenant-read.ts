/**
 * OZI-71 Slice 2 — the read-only authority boundary for `organization`-kind
 * {@link DataScope} derivation.
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §7, §9; preflight finding C.
 *
 * Both authoritative facts an organization scope needs — the
 * `organizations.id -> organizations.tenant_id` owner and the caller's
 * membership — are read HERE, each keyed by the SAME requested organization
 * id, so a consumer cannot pair membership for one organization with the
 * parent tenant (or requested id) of another. `deriveOrganizationScope`
 * takes this port and never accepts detached caller-supplied evidence.
 *
 * The `organizations.id -> tenant_id` read is otherwise only inlined
 * privately inside `DrizzleAdminOrganizations{Mutation,Read}Service`; the
 * membership read reuses the existing `DrizzleMembershipRepository`. No
 * schema change, no write, no caching (never cache an organization -> tenant
 * ownership).
 *
 * NOT wired into any runtime path in this slice.
 */

import { eq } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

import { DrizzleMembershipRepository } from '@/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository';
import { organizationsTable } from '@/modules/authorization/infrastructure/drizzle/schema';

/**
 * Read-only authority for deriving `organization` scope against ONE requested
 * organization id. An implementation MUST key every read on the id it is
 * given — never a second, caller-chosen id.
 */
export interface OrganizationScopeAuthority {
  /**
   * `organizations.id -> organizations.tenant_id` for `organizationId`, or
   * `null` when no such organization row exists (the id was not an internal
   * `organizations.id`).
   */
  readParentTenantId(organizationId: string): Promise<string | null>;
  /**
   * Whether a `memberships` row exists for `(userId, organizationId)` — the
   * caller's verified membership in exactly that organization.
   */
  isMember(userId: string, organizationId: string): Promise<boolean>;
}

/**
 * Reads the authoritative parent `tenant_id` for a given internal
 * `organizations.id`. Returns `null` when no organization row matches.
 */
export async function readParentTenantId(
  db: DrizzleDb,
  internalOrganizationId: string,
): Promise<string | null> {
  const rows = await db
    .select({ tenantId: organizationsTable.tenantId })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, internalOrganizationId))
    .limit(1);

  return rows[0]?.tenantId ?? null;
}

/**
 * Drizzle-backed {@link OrganizationScopeAuthority}. Both reads run against
 * the single organization id passed to each method.
 */
export function createDrizzleOrganizationScopeAuthority(
  db: DrizzleDb,
): OrganizationScopeAuthority {
  const memberships = new DrizzleMembershipRepository(db);
  return {
    readParentTenantId: (organizationId) =>
      readParentTenantId(db, organizationId),
    isMember: (userId, organizationId) =>
      memberships.isMember(userId, organizationId),
  };
}
