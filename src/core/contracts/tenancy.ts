import type { Identity } from './identity';
import type { SubjectId, TenantId } from './primitives';

export class MissingTenantContextError extends Error {
  constructor(
    message = 'Missing tenant context (orgId) for authenticated user',
  ) {
    super(message);
    this.name = 'MissingTenantContextError';
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
