import type { Identity } from './identity';
import type { SubjectId, TenantId } from './primitives';

export class MissingTenantContextError extends Error {
  constructor(
    message = 'Missing tenant context (tenantExternalId) for authenticated user',
  ) {
    super(message);
    this.name = 'MissingTenantContextError';
  }
}

/**
 * Thrown when a user is authenticated and the tenant exists in DB, but the user
 * has no membership record for that tenant.
 * Applies to TENANCY_MODE=org + TENANT_CONTEXT_SOURCE=db.
 * User must be invited or explicitly enrolled before accessing the tenant.
 */
export class TenantMembershipRequiredError extends Error {
  constructor(
    message = 'User is not a member of the requested tenant. An invitation or explicit enrollment is required.',
  ) {
    super(message);
    this.name = 'TenantMembershipRequiredError';
  }
}

/**
 * TenantContext represents a specific tenant in a multi-tenant system.
 */
export interface TenantContext {
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
