import type { Identity } from './identity';
import type { OrganizationId, SubjectId, TenantId } from './primitives';

export { TenantNotProvisionedError } from './identity';

export class MissingTenantContextError extends Error {
  constructor(
    message = 'Missing tenant context (orgExternalId) for authenticated user',
  ) {
    super(message);
    this.name = 'MissingTenantContextError';
  }
}

/**
 * Thrown when a user is authenticated and the organization exists in DB, but the user
 * has no membership record for that organization.
 * Applies to TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db.
 * User must be invited or explicitly enrolled before accessing the organization.
 */
export class TenantMembershipRequiredError extends Error {
  constructor(
    message = 'User is not a member of the requested organization. An invitation or explicit enrollment is required.',
  ) {
    super(message);
    this.name = 'TenantMembershipRequiredError';
  }
}

/**
 * TenantContext represents a resolved organization (and its parent tenant) for the request.
 *
 * Phase 2+: organizationId is the canonical field.
 * tenantId is preserved for backward compatibility with downstream consumers (AuthorizationContext).
 * Both fields hold the same value: the internal organization UUID.
 */
export interface TenantContext {
  readonly organizationId: OrganizationId;
  readonly tenantId: TenantId;
  readonly userId: SubjectId;
}

/**
 * Converts a user Identity into a TenantContext.
 * This allows multi-tenant authorization and separation of user scopes.
 */
export interface TenantResolver {
  resolve(identity: Identity): Promise<TenantContext>;
}
