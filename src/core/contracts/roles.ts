/**
 * Security-Layer Application Role Definitions
 *
 * Defines the application-level role set used by the security layer (middleware,
 * request-scoped context, floor-check comparisons).
 *
 * NOTE — Two distinct role systems exist in this repository:
 *
 * 1. Security-layer roles (this file): `guest | user | admin`
 *    Used for request-context floor checks and middleware authorization decisions.
 *    Not stored in the tenant database.
 *
 * 2. Tenant DB roles: `owner | member`
 *    Stored in the `roles` table, scoped per tenant, used by DefaultAuthorizationService
 *    and the PolicyEngine for policy evaluation.
 *    Defined by provisioning — see docs/features/22 - RBAC Baseline.md.
 *
 * These two sets are intentionally separate. RoleId (from RoleRepository) is an
 * opaque string carrying tenant DB role names — it is NOT constrained to UserRole values.
 *
 * Allowed imports: none (pure type/constant file)
 */

/**
 * Security-layer role type for authenticated principals.
 *
 * - `'guest'`  → unauthenticated principal (conceptual; context.user is undefined in practice)
 * - `'user'`   → authenticated, standard access
 * - `'admin'`  → full elevated access
 */
export type UserRole = 'guest' | 'user' | 'admin';

/**
 * Typed role constants for security-layer floor checks.
 *
 * Use instead of raw string literals:
 *   ROLES.ADMIN  instead of  'admin'
 *   ROLES.USER   instead of  'user'
 *   ROLES.GUEST  instead of  'guest'
 */
export const ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
} as const satisfies Record<string, UserRole>;

/**
 * Numeric ordering of roles for floor-check comparisons.
 *
 * A principal with level N can perform actions requiring level <= N.
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
};
