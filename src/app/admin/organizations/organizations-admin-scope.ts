import 'server-only';

import type { AccessContext } from '@/core/contracts/access-context';
import { CanonicalIdRepresentationError } from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db/types';

import type { OrganizationsAdminDataScope } from '@/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsReadService';
import { DrizzleOrganizationScopeAuthority } from '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority';
import { DrizzleTenantExistenceReader } from '@/modules/authorization/infrastructure/drizzle/DrizzleTenantExistenceReader';
import { buildAccessContext } from '@/security/core/access-context/build-access-context';
import {
  deriveOrganizationScope,
  deriveTenantScopeAsPlatformAdmin,
  type ScopeDenialReason,
} from '@/security/core/access-context/derive-data-scope';
import type { NodeProvisioningAccessAllowed } from '@/security/core/node-provisioning-access';
import { isEnvBasedPlatformAdmin } from '@/security/core/platform-admin';

/**
 * OZI-71 Slice 3 — the ONE shared server-only composition seam that turns an
 * already server-resolved `NodeProvisioningAccessAllowed` into a canonical
 * per-operation organizations-admin `DataScope`.
 *
 * Used identically by:
 * - `src/app/api/admin/organizations/**` route handlers;
 * - `src/app/admin/organizations/**` Server Components;
 * - `src/app/admin/invitations/page.tsx` (organizations-listing hub only).
 *
 * This lives in `src/app` — the composition layer — so it may see
 * `@/core`, `@/security` and `@/modules`. It never introduces a
 * `security -> modules` or `modules -> security` import: `deriveOrganizationScope`
 * / `deriveTenantScopeAsPlatformAdmin` consume the neutral
 * `@/core/contracts/access-scope-authority` ports, and the concrete Drizzle
 * adapters are constructed here and injected.
 *
 * There is NO fallback to `AdminOrganizationsScope` and NO fallback to legacy
 * `TenantContext` authorization. A canonical failure is either a legitimate
 * fail-closed authorization denial (`null`) or an internal invariant failure
 * (`OrganizationsAdminScopeInvariantError` -> generic 500).
 */

/**
 * A server-derived contradiction encountered while building canonical
 * organizations-admin scope: the active organization has no parent tenant, a
 * trusted id is not representable, or a `DataScope` derivation returned a
 * reason its inputs make impossible. Never a client authorization outcome —
 * surfaces as a generic 500 through the established error handler. Its
 * message is deliberately identifier-free.
 */
export class OrganizationsAdminScopeInvariantError extends Error {
  constructor() {
    super('Organizations admin canonical scope invariant violated.');
    this.name = 'OrganizationsAdminScopeInvariantError';
  }
}

/**
 * Resolve the canonical organizations-admin `DataScope` for this request.
 *
 * - ordinary actor  -> `organization` scope for the SERVER-RESOLVED ACTIVE
 *   organization (never a route param); `null` when membership is absent.
 * - platform admin  -> `tenant` scope for the active organization's
 *   authoritative parent tenant (preserves OZI-77 `active-tenant` semantics;
 *   cross-tenant stays denied). Never `platform-global`.
 *
 * @returns the narrowed scope, or `null` for a legitimate ordinary
 *   authorization denial (caller maps to the existing 404 / empty-list
 *   behaviour). Throws {@link OrganizationsAdminScopeInvariantError} for a
 *   server-derived invariant failure.
 */
export async function resolveOrganizationsAdminScope(
  access: NodeProvisioningAccessAllowed,
  db: DrizzleDb,
): Promise<OrganizationsAdminDataScope | null> {
  const authority = new DrizzleOrganizationScopeAuthority(db);
  const accessContext = await buildOrganizationsAdminAccessContext(
    access,
    authority,
  );

  const activeOrganization = accessContext.activeOrganization;
  if (activeOrganization === null) {
    // The organizations admin surface always operates with an active
    // organization working context. Its absence here is an internal
    // contradiction, not a client-facing "not found".
    throw new OrganizationsAdminScopeInvariantError();
  }

  if (accessContext.isPlatformAdmin) {
    const derivation = await deriveTenantScopeAsPlatformAdmin({
      accessContext,
      requestedTenantId: activeOrganization.tenantId,
      operation: { kind: 'tenant-administration' },
      tenants: new DrizzleTenantExistenceReader(db),
    });

    if (derivation.outcome === 'granted') {
      return derivation.scope;
    }

    // isPlatformAdmin is server-derived, the operation classification is
    // hardcoded here, and requestedTenantId came from authoritative
    // organizations.tenant_id — any denial is a programming/data invariant.
    throw new OrganizationsAdminScopeInvariantError();
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

async function buildOrganizationsAdminAccessContext(
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
    throw new OrganizationsAdminScopeInvariantError();
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
      throw new OrganizationsAdminScopeInvariantError();
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
      // resolver modes still coexist). Caller maps to the existing 404.
      return null;
    case 'not-an-internal-organization':
      // The SAME active organization was just resolved via readParentTenantId
      // while constructing AccessContext. A contradictory "not internal" on
      // the second authoritative read is an invariant failure, not a 404.
      throw new OrganizationsAdminScopeInvariantError();
    case 'not-an-internal-tenant':
    case 'platform-admin-capability-required':
    case 'explicit-platform-global-classification-required':
    case 'explicit-tenant-administration-classification-required':
      // deriveOrganizationScope cannot return these; reaching one means a
      // Slice-2 contract regression — fail closed.
      throw new OrganizationsAdminScopeInvariantError();
    default:
      return assertUnreachableDenial(reason);
  }
}

function assertUnreachableDenial(reason: never): never {
  void reason;
  throw new OrganizationsAdminScopeInvariantError();
}
