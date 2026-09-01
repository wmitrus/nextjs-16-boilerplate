/**
 * OZI-71 Slice 2 — trustworthy, in-memory construction of the canonical
 * {@link AccessContext} (contract: `src/core/contracts/access-context.ts`).
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §7 ("AccessContext derivation").
 *
 * This runs ALONGSIDE the legacy `TenantContext` path and is NOT wired into
 * any runtime authorization decision in this slice (plan §16 Slice 2:
 * "read-only, in-memory"; "TenantContext remains authoritative for every
 * existing consumer"). No route, service, repository, resolver, or
 * `createSecurityContext` call depends on it.
 *
 * It is a PURE ASSEMBLER. Every fact it needs must already have been
 * established server-side by the caller:
 *
 * - `internalUserId`   — resolved from `users.id` on a Node/DB path.
 * - `activeOrganization` (or `null`) — a verified working-context selection:
 *     - `internalOrganizationId` — a proven `organizations.id`
 *       (membership-verified / provider-mapped / personal-org lookup);
 *     - `parentTenantId` — obtained by an INDEPENDENT authoritative read of
 *       `organizations.tenant_id` for that organization (see
 *       `readParentTenantId` in `./organization-tenant-read`). NEVER the
 *       legacy `TenantContext.tenantId`.
 * - `isPlatformAdmin`  — a server-verified capability (`isEnvBasedPlatformAdmin`
 *   today). A capability, not a scope.
 *
 * The crossing from raw `string` into branded ids happens only through the
 * audited provenance constructors in
 * `src/core/contracts/canonical-ids.provenance.ts`.
 */

import type { AccessContext } from '@/core/contracts/access-context';
import {
  internalOrganizationIdFromOrgRow,
  internalUserIdFromUsersRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';

export interface BuildAccessContextInput {
  /** Proven internal `users.id` (Node/DB path). Never an external provider id. */
  readonly internalUserId: string;
  /**
   * The verified working-context organization selection, or `null` when the
   * request has no active organization. Both ids travel together.
   */
  readonly activeOrganization: {
    /** Proven `organizations.id`. */
    readonly internalOrganizationId: string;
    /**
     * `organizations.tenant_id` for `internalOrganizationId`, read
     * independently from authoritative DB data — NOT legacy
     * `TenantContext.tenantId`.
     */
    readonly parentTenantId: string;
  } | null;
  /** Server-verified platform-admin capability. Never client-derived. */
  readonly isPlatformAdmin: boolean;
}

/**
 * Assemble a canonical {@link AccessContext} from already-verified inputs.
 *
 * Throws {@link CanonicalIdRepresentationError} if any supplied id is not
 * UUID-shaped — a construction contradiction (the source row did not hold an
 * internal id), surfaced rather than silently branded.
 */
export function buildAccessContext(
  input: BuildAccessContextInput,
): AccessContext {
  return {
    userId: internalUserIdFromUsersRow(input.internalUserId),
    activeOrganization:
      input.activeOrganization === null
        ? null
        : {
            organizationId: internalOrganizationIdFromOrgRow(
              input.activeOrganization.internalOrganizationId,
            ),
            tenantId: parentTenantIdFromOrgRow(
              input.activeOrganization.parentTenantId,
            ),
          },
    isPlatformAdmin: input.isPlatformAdmin,
  };
}
