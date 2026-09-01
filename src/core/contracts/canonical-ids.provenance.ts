/**
 * OZI-71 Slice 2 — the ONE audited trust boundary that crosses from raw
 * `string` values into the canonical branded identities of `./canonical-ids`.
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §6-§7, §13 (invariant #9); `02 - Architecture Guard.md`.
 *
 * Slice 1 deliberately shipped no constructors. This module is the first and
 * intended place a cast happens — and it happens only in the small set of
 * explicit, provenance-named functions below, never as a scattered
 * `as TenantId` in consumers and never as a generic `brandId<T>()` /
 * `toTenantId(anyString)` escape hatch.
 *
 * PROVENANCE, NOT AUTHORITY. Each constructor is named for the fact the
 * caller must ALREADY have established:
 *
 * - `internalUserIdFromUsersRow`      — value read from `users.id`
 * - `internalOrganizationIdFromOrgRow`— value read/resolved from
 *                                       `organizations.id`
 * - `parentTenantIdFromOrgRow`        — value read from
 *                                       `organizations.tenant_id`
 *                                       (the authoritative 1:N owner), NEVER
 *                                       copied from legacy
 *                                       `TenantContext.tenantId`.
 * - `tenantIdFromTenantsRow`          — value proven to exist as a
 *                                       `tenants.id` row, for an explicitly
 *                                       scoped platform-admin operation only.
 *
 * The UUID-shape check here is REPRESENTATION validation only. Passing it
 * proves the string could be an internal id; it proves nothing about
 * organization/tenant existence, membership, or authorization — those are
 * the caller's job and are enforced separately (`DataScope` derivation binds
 * each read to the same requested id, and proves row existence, before it
 * brands anything).
 */

import type { OrganizationId, TenantId, UserId } from './canonical-ids';

/**
 * Thrown when a value handed to a canonical-id constructor fails
 * REPRESENTATION validation (not UUID-shaped). A construction-time
 * programming/data contradiction — never an authorization outcome.
 */
export class CanonicalIdRepresentationError extends Error {
  constructor(kind: 'UserId' | 'OrganizationId' | 'TenantId') {
    super(
      `Canonical ${kind} provenance constructor received a value that is not a UUID. ` +
        'This is a representation contradiction (the source row/column did not ' +
        'hold an internal id), not an authorization failure.',
    );
    this.name = 'CanonicalIdRepresentationError';
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * REPRESENTATION check only: is `value` UUID-shaped, i.e. could it be an
 * internal id? Passing this proves nothing about membership, ownership, or
 * authorization.
 */
export function isCanonicalIdRepresentation(value: string): boolean {
  return UUID_RE.test(value);
}

function assertUuid(
  value: string,
  kind: 'UserId' | 'OrganizationId' | 'TenantId',
): void {
  if (!UUID_RE.test(value)) {
    throw new CanonicalIdRepresentationError(kind);
  }
}

/**
 * Brand a value the caller has read from `users.id` (an internal application
 * user record) as a canonical {@link UserId}.
 *
 * Caller contract: `value` came from a Node/DB security path that resolved
 * the authenticated principal to an internal `users.id` row (e.g. via
 * `InternalIdentityLookup.findInternalUserId` followed by a successful
 * `UserRepository.findById`). MUST NOT be called with an external provider
 * user id (an Edge presence-only `identity.id`).
 */
export function internalUserIdFromUsersRow(value: string): UserId {
  assertUuid(value, 'UserId');
  return value as UserId;
}

/**
 * Brand a value the caller has read or resolved from `organizations.id` (an
 * internal organization record) as a canonical {@link OrganizationId}.
 *
 * Caller contract: `value` is a proven `organizations.id` — e.g. a
 * membership-verified active organization (`memberships.organization_id`), a
 * provider mapping (`auth_organization_identities.organization_id`), or a
 * personal-organization lookup. MUST NOT be called with a raw cookie/header/
 * route param or an external provider org id.
 */
export function internalOrganizationIdFromOrgRow(
  value: string,
): OrganizationId {
  assertUuid(value, 'OrganizationId');
  return value as OrganizationId;
}

/**
 * Brand a value the caller has read from `organizations.tenant_id` — the
 * authoritative parent-tenant owner of a specific organization row (strict
 * 1:N, `NOT NULL` FK to `tenants.id`) — as a canonical {@link TenantId}.
 *
 * Caller contract: `value` was obtained by an INDEPENDENT authoritative read
 * of `organizations.tenant_id` for a known `organizations.id`. It MUST NEVER
 * be `legacy TenantContext.tenantId`, which currently carries the
 * organization UUID (OZI-67/OZI-71 identity collapse).
 */
export function parentTenantIdFromOrgRow(value: string): TenantId {
  assertUuid(value, 'TenantId');
  return value as TenantId;
}

/**
 * Brand a value the caller has read from `tenants.id` as a canonical
 * {@link TenantId}.
 *
 * Caller contract: `value` is a `tenants.id` row that an EXPLICITLY SCOPED
 * platform-admin operation is targeting. This is the only tenant-id
 * provenance that is not derived from a specific organization's
 * `organizations.tenant_id`, and it is legitimate only behind a
 * server-verified platform-admin capability plus an explicit operation
 * classification (see `deriveTenantScopeAsPlatformAdmin`). Ordinary
 * organization membership MUST NEVER reach this constructor.
 */
export function tenantIdFromTenantsRow(value: string): TenantId {
  assertUuid(value, 'TenantId');
  return value as TenantId;
}
