/**
 * OZI-71 Slice 2 — neutral ports for the read-only authority evidence that
 * per-operation {@link DataScope} derivation
 * (`src/security/core/access-context/derive-data-scope.ts`) needs.
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §7, §9; `02 - Architecture Guard.md`.
 *
 * Same ports/adapters direction the repository already uses for
 * `MembershipRepository` (`./repositories.ts`): the neutral contract lives
 * here, security policy consumes it, and `src/modules/authorization`
 * infrastructure implements it with Drizzle. Security never imports the
 * concrete implementation; authorization infrastructure never imports
 * security.
 *
 * Interfaces only — no Drizzle, no schema, no `@/modules` imports, no policy
 * logic.
 */

/**
 * Read-only authority for deriving `organization`-kind scope against ONE
 * requested organization. An implementation MUST key every read on the id it
 * is given — never a second, caller-chosen id — so `organization` scope
 * evidence (parent tenant + membership) is always about the same
 * organization the operation targets.
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
 * Read-only proof that a given id is an internal `tenants.id` row. An
 * implementation MUST answer for exactly the id it is given. UUID syntax is
 * representation, not existence — a syntactically valid id that matches no
 * `tenants` row must return `false`.
 */
export interface TenantExistenceReader {
  exists(_tenantId: string): Promise<boolean>;
}
