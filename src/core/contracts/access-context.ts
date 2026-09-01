/**
 * OZI-71 canonical actor/request context and per-operation data scope
 * (Phase 1, Slice 1 — additive types only).
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md` §7.
 *
 * `AccessContext` and `DataScope` are deliberately SEPARATE concepts. An
 * actor does not permanently "own" an authorization scope:
 *
 * - `AccessContext` — the authenticated, server-verified actor plus their
 *   verified working-context selection and platform-admin capability. It
 *   does NOT contain a `DataScope`, and it does NOT carry a
 *   `membershipOrganizationIds` collection.
 * - `DataScope` — the authoritative scope for ONE operation against ONE
 *   resource class, derived server-side from `AccessContext` + authoritative
 *   DB relationships + explicit authority checks. Slice 1 defines the type
 *   only — no derivation logic lives here.
 *
 * Slice 1 is additive types only: no runtime behavior, no resolver wiring,
 * no scope derivation, no authorization logic, no constructors. The existing
 * `TenantContext` (`./tenancy.ts`) and every existing runtime consumer are
 * untouched and remain authoritative.
 */

import type { OrganizationId, TenantId, UserId } from './canonical-ids';

/**
 * The authenticated, server-verified actor and request context.
 *
 * - `userId` — internal application user id, resolved server-side; never
 *   sourced from a client-supplied field.
 * - `activeOrganization` — a verified working-context selection. When
 *   present it carries BOTH the `organizationId` and its authoritative
 *   parent `tenantId` (`organizations.tenant_id`, strict 1:N): the two ids
 *   always travel together, never one without the other. Selecting an
 *   organization is a working-context choice only — it grants no
 *   tenant-level authority.
 * - `isPlatformAdmin` — server-verified actor capability, never
 *   client-derived. It is a capability, not a scope.
 *
 * There is intentionally no `scope` / `DataScope` property: scope is derived
 * per operation (a later slice), not owned by the actor.
 */
export interface AccessContext {
  readonly userId: UserId;
  readonly activeOrganization: {
    readonly organizationId: OrganizationId;
    readonly tenantId: TenantId;
  } | null;
  readonly isPlatformAdmin: boolean;
}

/**
 * The authoritative scope for one operation against one resource class,
 * derived server-side (a later slice). Never accepted as input.
 *
 * - `organization` — carries both `organizationId` and its parent
 *   `tenantId`. Organization-owned SQL binds the organization predicate
 *   (optionally AND the tenant relation, for defense in depth) in the same
 *   statement as the requested resource id.
 * - `tenant` — carries only `tenantId`. Never inferred from organization
 *   membership alone; requires an explicit tenant-level authority or an
 *   explicitly scoped platform-admin operation.
 * - `platform-global` — carries no tenant or organization id; only for
 *   operations explicitly classified as platform-global.
 *
 * The forbidden ids are pinned to `?: never` (not merely omitted) so the
 * invariant holds structurally — an already-built value that carries an
 * extra `organizationId` / `tenantId` cannot be assigned to the narrower
 * variant, not just a fresh object literal caught by excess-property
 * checking.
 */
export type DataScope =
  | {
      readonly kind: 'organization';
      readonly organizationId: OrganizationId;
      readonly tenantId: TenantId;
    }
  | {
      readonly kind: 'tenant';
      readonly tenantId: TenantId;
      readonly organizationId?: never;
    }
  | {
      readonly kind: 'platform-global';
      readonly tenantId?: never;
      readonly organizationId?: never;
    };
