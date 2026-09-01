/**
 * OZI-71 Slice 2 — per-operation {@link DataScope} derivation primitives
 * (contract: `src/core/contracts/access-context.ts`).
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §7 ("DataScope derivation, per kind"), §13 (invariants #3, #4, #5, #8);
 * `02 - Architecture Guard.md`.
 *
 * NOT wired into any runtime authorization decision in this slice. No route,
 * service, or repository accepts a `DataScope` yet (that is Slice 3+).
 * `TenantContext` remains authoritative for every existing consumer.
 *
 * Design rules enforced here:
 *
 * - Scope is PER-OPERATION. There is deliberately no
 *   `deriveScope(accessContext)` that guesses a scope from actor capability.
 * - Evidence is BOUND to the one requested id. `deriveOrganizationScope`
 *   takes an {@link OrganizationScopeAuthority} port and performs BOTH
 *   authoritative reads itself, each keyed on the SAME
 *   `requestedOrganizationId` (and the membership read on
 *   `accessContext.userId`). There is no detached, caller-supplied
 *   `{ isMember, tenantId }` evidence to mis-pair. Presence of the id in
 *   `AccessContext.activeOrganization` grants nothing.
 * - Ordinary organization membership can NEVER produce `tenant` scope: there
 *   is no ordinary-user tenant-scope function. The only producer of `tenant`
 *   scope is an explicitly-classified, server-verified platform-admin
 *   operation, and the target tenant must be proven to EXIST as a
 *   `tenants.id` row (UUID syntax is not existence).
 * - `isPlatformAdmin === true` alone never yields `platform-global`: an
 *   explicit operation classification is also required.
 */

import type { AccessContext, DataScope } from '@/core/contracts/access-context';
import type {
  OrganizationScopeAuthority,
  TenantExistenceReader,
} from '@/core/contracts/access-scope-authority';
import {
  internalOrganizationIdFromOrgRow,
  isCanonicalIdRepresentation,
  parentTenantIdFromOrgRow,
  tenantIdFromTenantsRow,
} from '@/core/contracts/canonical-ids.provenance';

export type ScopeDenialReason =
  | 'not-an-internal-organization'
  | 'not-an-internal-tenant'
  | 'organization-membership-required'
  | 'platform-admin-capability-required'
  | 'explicit-platform-global-classification-required'
  | 'explicit-tenant-administration-classification-required';

export type ScopeDerivation<S extends DataScope = DataScope> =
  | { readonly outcome: 'granted'; readonly scope: S }
  | { readonly outcome: 'denied'; readonly reason: ScopeDenialReason };

/**
 * The closed set of privileged, per-operation scope classifications a caller
 * may request. It is deliberately a CLOSED union local to this policy module:
 * each derivation function checks it received its own expected classification
 * and fails closed on any other legitimate member — defense-in-depth against
 * a caller wiring the wrong operation to the wrong derivation.
 */
export type PrivilegedScopeOperationClassification =
  | { readonly kind: 'tenant-administration' }
  | { readonly kind: 'platform-global' };

type OrganizationScope = Extract<DataScope, { kind: 'organization' }>;
type TenantScope = Extract<DataScope, { kind: 'tenant' }>;
type PlatformGlobalScope = Extract<DataScope, { kind: 'platform-global' }>;

function granted<S extends DataScope>(scope: S): ScopeDerivation<S> {
  return { outcome: 'granted', scope };
}

function denied<S extends DataScope>(
  reason: ScopeDenialReason,
): ScopeDerivation<S> {
  return { outcome: 'denied', reason };
}

export interface DeriveOrganizationScopeInput {
  /**
   * The authenticated actor. Its `userId` is the subject of the membership
   * read below — never a caller-supplied membership fact.
   */
  readonly accessContext: AccessContext;
  /**
   * The organization id the operation is acting on — a *requested* id
   * (e.g. a route param), never trusted as authority on its own.
   */
  readonly requestedOrganizationId: string;
  /**
   * The read-only authority boundary. `deriveOrganizationScope` calls both
   * of its reads with `requestedOrganizationId` (and the membership read
   * with `accessContext.userId`), so the parent-tenant and membership
   * evidence are always about the same organization.
   */
  readonly authority: OrganizationScopeAuthority;
}

/**
 * Derive `organization`-kind scope for one operation against one requested
 * organization.
 *
 * Grants only when ALL hold, each proven against `requestedOrganizationId`:
 *  1. it is UUID-shaped and resolves to a real `organizations` row
 *     (`authority.readParentTenantId` returns non-null);
 *  2. `authority.isMember(accessContext.userId, requestedOrganizationId)` is
 *     true;
 *  3. the parent tenant in the returned scope is the value just read from
 *     `organizations.tenant_id` for THAT organization.
 */
export async function deriveOrganizationScope(
  input: DeriveOrganizationScopeInput,
): Promise<ScopeDerivation<OrganizationScope>> {
  const { accessContext, requestedOrganizationId, authority } = input;

  if (!isCanonicalIdRepresentation(requestedOrganizationId)) {
    return denied('not-an-internal-organization');
  }

  const parentTenantId = await authority.readParentTenantId(
    requestedOrganizationId,
  );
  if (parentTenantId === null) {
    return denied('not-an-internal-organization');
  }

  const isMember = await authority.isMember(
    accessContext.userId,
    requestedOrganizationId,
  );
  if (!isMember) {
    return denied('organization-membership-required');
  }

  return granted({
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(requestedOrganizationId),
    tenantId: parentTenantIdFromOrgRow(parentTenantId),
  });
}

export interface DeriveTenantScopeAsPlatformAdminInput {
  readonly accessContext: AccessContext;
  /** The tenant id the operation targets — a *requested* id. */
  readonly requestedTenantId: string;
  /**
   * Explicit operation classification. `tenant` scope is produced ONLY when
   * this is `tenant-administration` — any other member of the closed union
   * (e.g. `platform-global`) fails closed. There is no implicit path and no
   * ordinary-user path.
   */
  readonly operation: PrivilegedScopeOperationClassification;
  /**
   * Read-only proof boundary that `requestedTenantId` is an actual internal
   * `tenants.id` row. UUID syntax alone is never sufficient.
   */
  readonly tenants: TenantExistenceReader;
}

/**
 * The ONLY producer of `tenant`-kind scope. Grants only when ALL hold:
 *  - the actor has a server-verified platform-admin capability;
 *  - the operation is explicitly classified as tenant administration;
 *  - `requestedTenantId` is proven to exist as a `tenants.id` row.
 *
 * Ordinary organization membership can never reach a grant here.
 */
export async function deriveTenantScopeAsPlatformAdmin(
  input: DeriveTenantScopeAsPlatformAdminInput,
): Promise<ScopeDerivation<TenantScope>> {
  const { accessContext, requestedTenantId, operation, tenants } = input;

  if (!accessContext.isPlatformAdmin) {
    return denied('platform-admin-capability-required');
  }

  if (operation.kind !== 'tenant-administration') {
    return denied('explicit-tenant-administration-classification-required');
  }

  if (!(await tenants.exists(requestedTenantId))) {
    return denied('not-an-internal-tenant');
  }

  return granted({
    kind: 'tenant',
    tenantId: tenantIdFromTenantsRow(requestedTenantId),
  });
}

export interface DerivePlatformGlobalScopeInput {
  readonly accessContext: AccessContext;
  /**
   * Explicit operation classification. Platform-admin capability alone does
   * NOT make a call unbounded — this must be `platform-global`; any other
   * member of the closed union (e.g. `tenant-administration`) fails closed.
   */
  readonly operation: PrivilegedScopeOperationClassification;
}

/**
 * Derive `platform-global` scope. Grants only when the actor has a
 * server-verified platform-admin capability AND the operation is explicitly
 * classified as platform-global.
 */
export function derivePlatformGlobalScope(
  input: DerivePlatformGlobalScopeInput,
): ScopeDerivation<PlatformGlobalScope> {
  if (!input.accessContext.isPlatformAdmin) {
    return denied('platform-admin-capability-required');
  }

  if (input.operation.kind !== 'platform-global') {
    return denied('explicit-platform-global-classification-required');
  }

  return granted({ kind: 'platform-global' });
}
