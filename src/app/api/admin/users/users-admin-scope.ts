import 'server-only';

import type { AccessContext } from '@/core/contracts/access-context';
import { CanonicalIdRepresentationError } from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db/types';

import { DrizzleOrganizationScopeAuthority } from '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority';
import type { AdminUsersDataScope } from '@/modules/user/infrastructure/drizzle/DrizzleAdminUsersService';
import { buildAccessContext } from '@/security/core/access-context/build-access-context';
import {
  deriveOrganizationScope,
  derivePlatformGlobalScope,
  type ScopeDenialReason,
} from '@/security/core/access-context/derive-data-scope';
import type { NodeProvisioningAccessAllowed } from '@/security/core/node-provisioning-access';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

/**
 * OZI-71 Slice 4B — the ONE shared server-only composition seam that turns an
 * already server-resolved `NodeProvisioningAccessAllowed` into a canonical
 * per-operation Admin Users `DataScope`.
 *
 * Used identically by:
 * - `src/app/api/admin/users/route.ts` (GET list);
 * - `src/app/api/admin/users/[id]/route.ts` (GET / PATCH update / PATCH deactivate).
 *
 * This lives in `src/app` — the composition layer — so it may see `@/core`,
 * `@/security` and `@/modules`. It introduces no `security -> modules` or
 * `modules -> security` import: `deriveOrganizationScope` /
 * `derivePlatformGlobalScope` consume the neutral
 * `@/core/contracts/access-scope-authority` ports, and the concrete Drizzle
 * adapter is constructed here and injected.
 *
 * There is NO fallback to the legacy `AdminUserScope` and NO fallback to
 * legacy `TenantContext` authorization. A canonical failure is either a
 * legitimate fail-closed authorization denial (`null`) or an internal
 * invariant failure (`AdminUsersScopeInvariantError` -> generic 500).
 *
 * This deliberately does NOT reuse `resolveOrganizationsAdminScope`: that seam
 * grants a platform admin `tenant` scope, which would silently NARROW Admin
 * Users' current unrestricted cross-tenant platform-admin authority.
 */

/**
 * A server-derived contradiction encountered while building canonical Admin
 * Users scope: the active organization has no parent tenant, a trusted id is
 * not representable, or a `DataScope` derivation returned a reason its inputs
 * make impossible. Never a client authorization outcome — surfaces as a
 * generic 500 through the established error handler. Its message is
 * deliberately identifier-free.
 */
export class AdminUsersScopeInvariantError extends Error {
  constructor() {
    super('Admin users canonical scope invariant violated.');
    this.name = 'AdminUsersScopeInvariantError';
  }
}

/**
 * Resolve the canonical Admin Users `DataScope` for this request.
 *
 * - ordinary actor  -> `organization` scope for the SERVER-RESOLVED ACTIVE
 *   organization (never a route param); `null` when membership is absent.
 * - platform admin  -> explicit `platform-global` scope through the shipped
 *   `derivePlatformGlobalScope` classification (preserves today's
 *   unrestricted cross-tenant reach). Never `tenant`, never `null`.
 *
 * @returns the narrowed scope, or `null` for a legitimate ordinary
 *   authorization denial (caller maps to the existing empty list / 404).
 *   Throws {@link AdminUsersScopeInvariantError} for a server-derived
 *   invariant failure.
 */
export async function resolveAdminUsersScope(
  access: NodeProvisioningAccessAllowed,
  db: DrizzleDb,
): Promise<AdminUsersDataScope | null> {
  const authority = new DrizzleOrganizationScopeAuthority(db);
  const accessContext = await buildAdminUsersAccessContext(access, authority);

  const activeOrganization = accessContext.activeOrganization;
  if (activeOrganization === null) {
    // The Admin Users surface always operates with an active organization
    // working context (guaranteed by `withNodeProvisioning`). Its absence
    // here is an internal contradiction, not a client-facing "not found".
    throw new AdminUsersScopeInvariantError();
  }

  if (accessContext.isPlatformAdmin) {
    const derivation = derivePlatformGlobalScope({
      accessContext,
      operation: { kind: 'platform-global' },
    });

    if (derivation.outcome === 'granted') {
      return derivation.scope;
    }

    // isPlatformAdmin is server-derived and the operation classification is
    // hardcoded here -- any denial is a programming/data invariant.
    throw new AdminUsersScopeInvariantError();
  }

  const derivation = await deriveOrganizationScope({
    accessContext,
    requestedOrganizationId: activeOrganization.organizationId,
    authority,
  });

  if (derivation.outcome === 'granted') {
    return derivation.scope;
  }

  return classifyOrdinaryOrganizationScopeDenial(derivation.reason);
}

async function buildAdminUsersAccessContext(
  access: NodeProvisioningAccessAllowed,
  authority: DrizzleOrganizationScopeAuthority,
): Promise<AccessContext> {
  const activeOrganizationId = access.tenant.organizationId;

  // Parent tenant identity is loaded INDEPENDENTLY from authoritative
  // organization -> tenant data. Never `access.tenant.tenantId`, which legacy
  // TenantContext still collapses onto the organization id.
  const parentTenantId =
    await authority.readParentTenantId(activeOrganizationId);

  if (parentTenantId === null) {
    // Node provisioning already resolved this as the active internal
    // organization, and organizations.tenant_id is NOT NULL. A null here is a
    // contradictory DB / working-context state.
    throw new AdminUsersScopeInvariantError();
  }

  try {
    return buildAccessContext({
      internalUserId: access.user.id,
      activeOrganization: {
        internalOrganizationId: activeOrganizationId,
        parentTenantId,
      },
      isPlatformAdmin: isEnvBasedPlatformAdmin(access.identity.email),
    });
  } catch (error) {
    if (error instanceof CanonicalIdRepresentationError) {
      // A trusted id (users.id / organizations.id / organizations.tenant_id)
      // that is not representable is a construction contradiction, not an
      // authorization failure.
      throw new AdminUsersScopeInvariantError();
    }
    throw error;
  }
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
      // Legitimate fail-closed authorization denial (expected while legacy
      // resolver modes still coexist). Caller maps to the existing empty
      // list / 404.
      return null;
    case 'not-an-internal-organization':
      // The SAME active organization was just resolved via readParentTenantId
      // while constructing AccessContext. A contradictory "not internal" on
      // the second authoritative read is an invariant failure, not a 404.
      throw new AdminUsersScopeInvariantError();
    case 'not-an-internal-tenant':
    case 'platform-admin-capability-required':
    case 'explicit-platform-global-classification-required':
    case 'explicit-tenant-administration-classification-required':
      // deriveOrganizationScope cannot return these; reaching one means a
      // Slice-2 contract regression -- fail closed.
      throw new AdminUsersScopeInvariantError();
    default:
      return assertUnreachableDenial(reason);
  }
}

function assertUnreachableDenial(reason: never): never {
  void reason;
  throw new AdminUsersScopeInvariantError();
}
