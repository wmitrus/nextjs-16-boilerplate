import type { SubjectId, TenantId } from './primitives';

export type Permission = `${string}:${string}`;

export type Action = Permission;

export function createAction(resource: string, verb: string): Action {
  const normalizedResource = resource.trim() || 'system';
  const normalizedVerb = verb.trim() || 'execute';

  return `${normalizedResource}:${normalizedVerb}`;
}

export function isAction(value: string): value is Action {
  return /^[^:\s]+:[^:\s]+$/.test(value);
}

export function parseAction(action: Action): {
  resource: string;
  verb: string;
} {
  const [resource, verb] = action.split(':', 2);

  return {
    resource,
    verb,
  };
}

/**
 * Tenant attributes loaded from the database by the authorization layer.
 *
 * Written by billing/admin modules, read by PolicyEngine conditions.
 * SecurityContext must NEVER access or know about this — it is populated
 * by DefaultAuthorizationService before policy evaluation.
 *
 * Feature flags, plan limits, and contract types live here.
 * They are ABAC conditions on policies, NOT middleware checks.
 */
export interface TenantAttributes {
  readonly plan?: 'free' | 'pro' | 'enterprise';
  readonly subscriptionStatus?: 'active' | 'trial' | 'past_due' | 'canceled';
  readonly features?: readonly string[];
  readonly contractType?: 'standard' | 'enterprise';
  readonly userLimit?: number;
  readonly [key: string]: unknown;
}

/**
 * Context describing the acting subject.
 * Represents user, service account, or system identity.
 *
 * - `roles` carries raw role IDs from the database (tenant-scoped).
 * - `attributes` carries user metadata for ABAC conditions (plan, onboardingComplete, …).
 */
export interface SubjectContext {
  id: SubjectId;
  roles?: readonly string[];
  attributes?: Record<string, unknown>;
}

/**
 * Logical representation of a protected resource.
 *
 * Must NOT depend on persistence models.
 */
export interface ResourceContext {
  type: string;
  id?: string;
  attributes?: Record<string, unknown>;
}

/**
 * Request-level environment data for ABAC evaluation.
 *
 * Populated by enforcement layer (secure-action, middleware).
 * Contains contextual facts — NOT decisions.
 */
export interface EnvironmentContext {
  readonly ip?: string;
  readonly userAgent?: string;
  readonly time?: Date;
  readonly [key: string]: unknown;
}

/**
 * Complete authorization decision input.
 *
 * Immutable context passed to AuthorizationService.
 *
 * - `tenant.tenantId` identifies the organizational boundary.
 * - `tenantAttributes` is injected by DefaultAuthorizationService after
 *   fetching from TenantAttributesRepository — NOT set by the enforcement layer.
 *
 * Must remain framework-agnostic.
 */
export interface AuthorizationContext {
  readonly tenant: { readonly tenantId: TenantId };
  readonly tenantAttributes?: TenantAttributes;
  readonly subject: SubjectContext;
  readonly resource: ResourceContext;
  readonly action: Action;
  readonly environment?: EnvironmentContext;
  readonly attributes?: Record<string, unknown>;
}

/**
 * Application boundary for authorization decisions.
 *
 * Implementation may combine:
 * - RBAC
 * - ABAC
 * - policy-based evaluation
 * - ownership checks
 *
 * Must NOT leak infrastructure concerns.
 */
export interface AuthorizationService {
  can(context: AuthorizationContext): Promise<boolean>;
}
