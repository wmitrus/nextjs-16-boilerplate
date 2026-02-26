/**
 * RBAC Role Definitions — Single Source of Truth
 *
 * This file is the ONLY place where roles are defined.
 * Adding a new role requires changing ONLY this file.
 * All other files import from here — no raw strings allowed.
 *
 * Hierarchy: guest < user < admin
 *
 * Allowed imports: none (pure type/constant file)
 */

/**
 * Normalized role type used in the security layer.
 *
 * Represents the effective role of an authenticated principal
 * after mapping raw RoleIds from the repository.
 *
 * - `'guest'`  → unauthenticated principal (conceptual; context.user is undefined in practice)
 * - `'user'`   → authenticated, standard access
 * - `'admin'`  → full elevated access
 */
export type UserRole = 'guest' | 'user' | 'admin';

/**
 * Typed role constants.
 *
 * Use instead of raw string literals everywhere:
 *   ROLES.ADMIN  instead of  'admin'
 *   ROLES.USER   instead of  'user'
 *   ROLES.GUEST  instead of  'guest'
 *
 * Also serves as the recognized RoleId values returned by RoleRepository
 * (database role names must match these values for the mapping to work).
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
