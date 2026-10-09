import 'server-only';

import type { AccessContext, DataScope } from '@/core/contracts/access-context';
import { CanonicalIdRepresentationError } from '@/core/contracts/canonical-ids.provenance';
import type { ExternalAuthProvider } from '@/core/contracts/identity';
import type { DrizzleDb } from '@/core/db/types';

import { resolveCanonicalAuditWriteScope } from '@/app/_lib/resolve-canonical-audit-write-scope';
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
 * OZI-71 AUD·D — canonical per-operation scope for Audit Log Settings.
 *
 * Ordinary actors may only receive scope for their server-resolved active
 * organization, with membership and authoritative organization -> tenant
 * evidence proven independently.
 *
 * Platform admins may explicitly operate on:
 * - the platform-global settings row; or
 * - a specifically targeted organization, resolved authoritatively from an
 *   internal organization id or provider organization alias.
 *
 * No legacy TenantContext / tenant_id value becomes canonical authority.
 */
export type AuditLogSettingsDataScope = Extract<
  DataScope,
  { kind: 'organization' | 'platform-global' }
>;

export type AuditLogSettingsScopeResolution =
  | {
      readonly outcome: 'resolved';
      readonly scope: AuditLogSettingsDataScope;
    }
  | {
      readonly outcome: 'denied';
    }
  | {
      readonly outcome: 'unresolvable-organization-target';
    };

export class AuditLogSettingsScopeInvariantError extends Error {
  constructor() {
    super('Audit log settings canonical scope invariant violated.');
    this.name = 'AuditLogSettingsScopeInvariantError';
  }
}

export interface ResolveAuditLogSettingsAdminScopeInput {
  readonly access: NodeProvisioningAccessAllowed;
  readonly db: DrizzleDb;
  readonly authProvider: ExternalAuthProvider;

  /**
   * Platform-admin target classification:
   *
   * - undefined: no organization target was requested (e.g. GET global view);
   * - null: explicit platform-global mutation;
   * - string: explicit organization target, which must be resolved
   *   authoritatively.
   *
   * Ignored for an ordinary actor: ordinary authority is always bound to the
   * server-resolved active organization.
   */
  readonly platformTargetOrganizationId?: string | null;
}

export async function resolveAuditLogSettingsAdminScope(
  input: ResolveAuditLogSettingsAdminScopeInput,
): Promise<AuditLogSettingsScopeResolution> {
  const isPlatformAdmin = isEnvBasedPlatformAdmin(input.access.identity.email);

  if (isPlatformAdmin) {
    return resolvePlatformAdminScope(input);
  }

  return resolveOrdinaryAdminScope(input.access, input.db);
}

async function resolveOrdinaryAdminScope(
  access: NodeProvisioningAccessAllowed,
  db: DrizzleDb,
): Promise<AuditLogSettingsScopeResolution> {
  const authority = new DrizzleOrganizationScopeAuthority(db);
  const activeOrganizationId = access.activeOrganization.organizationId;
  const parentTenantId = access.activeOrganization.tenantId;

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
      throw new AuditLogSettingsScopeInvariantError();
    }
    throw error;
  }

  const derivation = await deriveOrganizationScope({
    accessContext,
    requestedOrganizationId: activeOrganizationId,
    authority,
  });

  if (derivation.outcome === 'granted') {
    return {
      outcome: 'resolved',
      scope: derivation.scope,
    };
  }

  return classifyOrdinaryOrganizationScopeDenial(derivation.reason);
}

async function resolvePlatformAdminScope(
  input: ResolveAuditLogSettingsAdminScopeInput,
): Promise<AuditLogSettingsScopeResolution> {
  if (
    input.platformTargetOrganizationId === undefined ||
    input.platformTargetOrganizationId === null
  ) {
    const accessContext = buildAccessContext({
      internalUserId: input.access.user.id,
      activeOrganization: null,
      isPlatformAdmin: true,
    });

    const derivation = derivePlatformGlobalScope({
      accessContext,
      operation: { kind: 'platform-global' },
    });

    if (derivation.outcome !== 'granted') {
      throw new AuditLogSettingsScopeInvariantError();
    }

    return {
      outcome: 'resolved',
      scope: derivation.scope,
    };
  }

  const canonical = await resolveCanonicalAuditWriteScope({
    isPlatformAdmin: true,
    ordinaryActiveOrganizationId:
      input.access.activeOrganization.organizationId,
    platformTargetOrganizationId: input.platformTargetOrganizationId,
    db: input.db,
    authProvider: input.authProvider,
  });

  if (canonical.outcome === 'unresolvable-organization-target') {
    return canonical;
  }

  if (canonical.writeScope.kind !== 'organization') {
    throw new AuditLogSettingsScopeInvariantError();
  }

  return {
    outcome: 'resolved',
    scope: {
      kind: 'organization',
      organizationId: canonical.writeScope.organizationId,
      tenantId: canonical.writeScope.tenantId,
    },
  };
}

function classifyOrdinaryOrganizationScopeDenial(
  reason: ScopeDenialReason,
): AuditLogSettingsScopeResolution {
  switch (reason) {
    case 'organization-membership-required':
      return { outcome: 'denied' };

    case 'not-an-internal-organization':
    case 'not-an-internal-tenant':
    case 'platform-admin-capability-required':
    case 'explicit-platform-global-classification-required':
    case 'explicit-tenant-administration-classification-required':
      throw new AuditLogSettingsScopeInvariantError();

    default:
      return assertUnreachableDenial(reason);
  }
}

function assertUnreachableDenial(reason: never): never {
  void reason;
  throw new AuditLogSettingsScopeInvariantError();
}
