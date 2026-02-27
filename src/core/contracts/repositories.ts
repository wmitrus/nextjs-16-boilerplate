import type {
  Action,
  AuthorizationContext,
  Permission,
  TenantAttributes,
} from './authorization';
import type { RoleId, SubjectId, TenantId } from './primitives';

/**
 * Re-export for convenience.
 * Represents the context in which an authorization decision is evaluated.
 */
export type { AuthorizationContext };

/**
 * Domain contract for the authorization subsystem (RBAC/ABAC).
 *
 * This file defines:
 * - Formal ports for the Authorization bounded context.
 * - The semantic boundary of authorization.
 *
 * This file does NOT contain:
 * - Implementations
 * - Policy engine logic
 * - Business rules
 * - Infrastructure concerns
 *
 * Domain semantics:
 * - SubjectId: actor attempting an action (user, service account, system job).
 * - TenantId: multi-tenant organizational boundary; must be validated upstream.
 * - RoleRepository: maps subject → role within a tenant; must not know permissions or policies.
 * - PermissionRepository: maps role → permission; must not make decisions.
 * - MembershipRepository: determines tenant memberships; must not return roles or policies.
 * - Policy: atomic rule; pure, side-effect free; evaluated by PolicyEngine.
 * - PolicyRepository: supplies policies; must not resolve allow/deny.
 *
 * Forbidden additions:
 * - Framework imports (clerkClient, NextRequest, Prisma, env, ...)
 * - Domain models mixing roles and permissions
 *
 * This file defines contracts only.
 */

export type { SubjectId, TenantId, RoleId };

/**
 * Resolves roles assigned to a subject within a tenant.
 *
 * Must NOT:
 * - perform authorization decisions
 * - resolve permissions
 * - access framework APIs
 */
export interface RoleRepository {
  getRoles(subjectId: SubjectId, tenantId: TenantId): Promise<RoleId[]>;
}

/**
 * Resolves permissions associated with a role.
 *
 * Must NOT:
 * - evaluate policies
 * - check contextual conditions
 */
export interface PermissionRepository {
  getPermissions(roleId: RoleId): Promise<Permission[]>;
}

/**
 * Resolves tenant memberships for a subject.
 *
 * Used for multi-tenant boundary validation.
 */
export interface MembershipRepository {
  getTenantMemberships(subjectId: SubjectId): Promise<TenantId[]>;
}

/**
 * Atomic authorization rule.
 *
 * Evaluated by PolicyEngine.
 *
 * Must remain pure and side-effect free.
 */
export interface Policy {
  readonly effect: 'allow' | 'deny';
  readonly actions: Action[];
  readonly resource: string;
  readonly condition?: (
    context: AuthorizationContext,
  ) => Promise<boolean> | boolean;
}

/**
 * Supplies policies relevant to a given authorization context.
 *
 * Must NOT:
 * - make allow/deny decisions
 * - resolve roles directly
 */
export interface PolicyRepository {
  getPolicies(context: AuthorizationContext): Promise<Policy[]>;
}

/**
 * Resolves tenant-specific attributes (plan, features, contract type, …).
 *
 * Populated by the billing module writing to the database.
 * Authorization reads from the database — never calls Stripe directly.
 *
 * Used by DefaultAuthorizationService to enrich AuthorizationContext
 * before PolicyEngine evaluation.
 */
export interface TenantAttributesRepository {
  getTenantAttributes(tenantId: TenantId): Promise<TenantAttributes>;
}

export type { TenantAttributes };
