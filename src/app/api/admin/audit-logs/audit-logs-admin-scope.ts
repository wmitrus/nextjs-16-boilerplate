import 'server-only';

import type { AccessContext } from '@/core/contracts/access-context';
import { CanonicalIdRepresentationError } from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db/types';

import type { AuditLogsDataScope } from '@/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogReadService';
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
 * OZI-71 AUD·D — canonical per-operation scope for the Audit Logs viewer.
 *
 * Ordinary actors receive an organization scope for their server-resolved
 * active organization. Platform admins receive an explicitly classified
 * platform-global scope, which the audit-events viewer interprets as an
 * unrestricted platform-level browse operation.
 *
 * No legacy TenantContext / tenantId fallback is allowed.
 */
export class AuditLogsScopeInvariantError extends Error {
  constructor() {
    super('Audit logs canonical scope invariant violated.');
    this.name = 'AuditLogsScopeInvariantError';
  }
}

export async function resolveAuditLogsAdminScope(
  access: NodeProvisioningAccessAllowed,
  db: DrizzleDb,
): Promise<AuditLogsDataScope | null> {
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

    throw new AuditLogsScopeInvariantError();
  }

  const activeOrganizationId = access.tenant.organizationId;
  const parentTenantId =
    await authority.readParentTenantId(activeOrganizationId);

  if (parentTenantId === null) {
    throw new AuditLogsScopeInvariantError();
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
      throw new AuditLogsScopeInvariantError();
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

function classifyOrdinaryOrganizationScopeDenial(
  reason: ScopeDenialReason,
): null {
  switch (reason) {
    case 'organization-membership-required':
      return null;

    case 'not-an-internal-organization':
    case 'not-an-internal-tenant':
    case 'platform-admin-capability-required':
    case 'explicit-platform-global-classification-required':
    case 'explicit-tenant-administration-classification-required':
      throw new AuditLogsScopeInvariantError();

    default:
      return assertUnreachableDenial(reason);
  }
}

function assertUnreachableDenial(reason: never): never {
  void reason;
  throw new AuditLogsScopeInvariantError();
}
