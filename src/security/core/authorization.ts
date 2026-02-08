import type { SecurityContext, UserRole } from './security-context';

export class AuthorizationError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Enforces a minimum role for the current security context.
 * Throws an AuthorizationError if the requirement is not met.
 */
export function authorize(
  context: SecurityContext,
  requiredRole: UserRole,
): void {
  if (!context.user) {
    throw new AuthorizationError('Authentication required');
  }

  const roleHierarchy: Record<UserRole, number> = {
    guest: 0,
    user: 1,
    admin: 2,
  };

  if (roleHierarchy[context.user.role] < roleHierarchy[requiredRole]) {
    throw new AuthorizationError(`Required role: ${requiredRole}`);
  }
}

/**
 * Validates that the user belongs to the specified tenant.
 */
export function enforceTenant(
  context: SecurityContext,
  tenantId: string,
): void {
  if (!context.user) {
    throw new AuthorizationError('Authentication required');
  }

  if (context.user.tenantId !== tenantId) {
    throw new AuthorizationError('Tenant access denied');
  }
}
