import 'server-only';

import type { AccessContext, DataScope } from '@/core/contracts/access-context';
import { CanonicalIdRepresentationError } from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db/types';

import { DrizzleOrganizationScopeAuthority } from '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority';
import { buildAccessContext } from '@/security/core/access-context/build-access-context';
import {
  deriveOrganizationScope,
  derivePlatformGlobalScope,
  type ScopeDenialReason,
} from '@/security/core/access-context/derive-data-scope';
import type { NodeProvisioningAccessAllowed } from '@/security/core/node-provisioning-access';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

/**
 * OZI-71 FF·D — the ONE shared server-only composition seam that turns an
 * already server-resolved `NodeProvisioningAccessAllowed` into a canonical
 * per-operation Feature Flags admin `DataScope`, for LIST / UPDATE / DELETE.
 *
 * Used identically by:
 * - `src/app/api/admin/feature-flags/route.ts` (GET list);
 * - `src/app/api/admin/feature-flags/[id]/route.ts` (PATCH update / DELETE).
 *
 * Does NOT cover create — `feature-flags-canonical-write.ts` stays the
 * resolver there: it answers a different question (an arbitrary
 * platform-admin-supplied candidate string might be a provider external org
 * id, which needs `DrizzleInternalIdentityLookup`; this seam only ever
 * derives scope for the caller's OWN already-established active
 * organization, or the caller's platform-admin capability).
 *
 * This lives in `src/app` — the composition layer — so it may see `@/core`,
 * `@/security` and `@/modules`. It introduces no `security -> modules` or
 * `modules -> security` import: `deriveOrganizationScope` /
 * `derivePlatformGlobalScope` consume the neutral
 * `@/core/contracts/access-scope-authority` ports, and the concrete Drizzle
 * adapter is constructed here and injected. Mirrors
 * `src/app/api/admin/users/users-admin-scope.ts`.
 *
 * OZI-71 FF·D — platform-admin scope here is deliberately `platform-global`
 * (`intentional_global` rows only), NOT an unrestricted cross-organization
 * view: unlike Admin Users (where `platform-global` stands in for "no
 * tenant restriction" because there is no analogous global-user state),
 * Feature Flags' `platform-global` has a literal DB meaning
 * (`ownership_state = 'intentional_global'`).
 *
 * SIGNED-OFF VERDICT (INTENTIONAL, not a gap): a platform admin has no
 * organization membership of their own in this model, so this is not "no
 * longer sees OTHER organizations' rows" — a platform admin cannot
 * list/update/delete ANY `canonical_organization` row through this panel,
 * for ANY organization, after FF·D. `POST` (create) is unaffected: a
 * platform admin can still create an organization-owned flag for an
 * explicitly resolved target (`feature-flags-canonical-write.ts`) — this
 * narrowing is list/update/delete only. This is an intentional, approved
 * narrowing of an already-privileged actor's reach (never a widening of
 * ordinary-actor authority), not an oversight. Restoring cross-organization
 * browse/mutate would require an explicit, separately-scoped
 * organization-targeted admin operation — not an unrestricted `listAll` or
 * an implicit platform-admin bypass.
 */

export type FeatureFlagsDataScope = Extract<
  DataScope,
  { kind: 'organization' | 'platform-global' }
>;

/**
 * A server-derived contradiction encountered while building canonical
 * Feature Flags admin scope: the active organization has no parent tenant,
 * a trusted id is not representable, or a `DataScope` derivation returned a
 * reason its inputs make impossible. Never a client authorization outcome —
 * surfaces as a generic 500 through the established error handler.
 */
export class FeatureFlagsScopeInvariantError extends Error {
  constructor() {
    super('Feature flags canonical scope invariant violated.');
    this.name = 'FeatureFlagsScopeInvariantError';
  }
}

/**
 * Resolve the canonical Feature Flags admin `DataScope` for this request.
 *
 * - platform admin  -> explicit `platform-global` scope (via the shipped
 *   `derivePlatformGlobalScope` classification) -- `intentional_global` rows
 *   only. No active-organization lookup is needed for this branch.
 * - ordinary actor  -> `organization` scope for the SERVER-RESOLVED ACTIVE
 *   organization (never a route param); `null` when membership is absent
 *   (caller maps to the existing empty list / 404).
 *
 * Throws {@link FeatureFlagsScopeInvariantError} for a server-derived
 * invariant failure.
 */
export async function resolveFeatureFlagsAdminScope(
  access: NodeProvisioningAccessAllowed,
  db: DrizzleDb,
): Promise<FeatureFlagsDataScope | null> {
  const authority = new DrizzleOrganizationScopeAuthority(db);

  if (isEnvBasedPlatformAdmin(access.identity.email)) {
    const accessContext = buildAccessContext({
      internalUserId: access.user.id,
      activeOrganization: null,
      isPlatformAdmin: true,
    });

    const derivation = derivePlatformGlobalScope({
      accessContext,
      operation: { kind: 'platform-global' },
    });

    if (derivation.outcome === 'granted') {
      return derivation.scope;
    }

    // isPlatformAdmin and the operation classification are both hardcoded
    // true/`platform-global` immediately above -- any denial here is a
    // Slice-2 contract regression, not a legitimate authorization outcome.
    throw new FeatureFlagsScopeInvariantError();
  }

  const activeOrganizationId = access.tenant.organizationId;

  // Parent tenant identity is loaded INDEPENDENTLY from authoritative
  // organization -> tenant data. Never `access.tenant.tenantId`, which legacy
  // TenantContext may collapse onto the organization id.
  const parentTenantId =
    await authority.readParentTenantId(activeOrganizationId);

  if (parentTenantId === null) {
    // Node provisioning already resolved this as the active internal
    // organization, and organizations.tenant_id is NOT NULL. A null here is a
    // contradictory DB / working-context state.
    throw new FeatureFlagsScopeInvariantError();
  }

  let accessContext: AccessContext;
  try {
    accessContext = buildAccessContext({
      internalUserId: access.user.id,
      activeOrganization: {
        internalOrganizationId: activeOrganizationId,
        parentTenantId,
      },
      isPlatformAdmin: false,
    });
  } catch (error) {
    if (error instanceof CanonicalIdRepresentationError) {
      // A trusted id (users.id / organizations.id / organizations.tenant_id)
      // that is not representable is a construction contradiction, not an
      // authorization failure.
      throw new FeatureFlagsScopeInvariantError();
    }
    throw error;
  }

  const derivation = await deriveOrganizationScope({
    accessContext,
    requestedOrganizationId: activeOrganizationId,
    authority,
  });

  if (derivation.outcome === 'granted') {
    return derivation.scope;
  }

  return classifyOrdinaryOrganizationScopeDenial(derivation.reason);
}

/**
 * Classify an ordinary-actor `deriveOrganizationScope` denial for the active
 * organization. Exhaustive over {@link ScopeDenialReason}: `membership` is a
 * legitimate fail-closed denial (`null`); everything else is impossible for
 * this input and fails closed as an internal invariant.
 */
function classifyOrdinaryOrganizationScopeDenial(
  reason: ScopeDenialReason,
): null {
  switch (reason) {
    case 'organization-membership-required':
      // Legitimate fail-closed authorization denial. Caller maps to the
      // existing empty list / 404.
      return null;
    case 'not-an-internal-organization':
      // The SAME active organization was just resolved via readParentTenantId
      // while constructing AccessContext. A contradictory "not internal" on
      // the second authoritative read is an invariant failure, not a 404.
      throw new FeatureFlagsScopeInvariantError();
    case 'not-an-internal-tenant':
    case 'platform-admin-capability-required':
    case 'explicit-platform-global-classification-required':
    case 'explicit-tenant-administration-classification-required':
      // deriveOrganizationScope cannot return these; reaching one means a
      // Slice-2 contract regression -- fail closed.
      throw new FeatureFlagsScopeInvariantError();
    default:
      return assertUnreachableDenial(reason);
  }
}

function assertUnreachableDenial(reason: never): never {
  void reason;
  throw new FeatureFlagsScopeInvariantError();
}
