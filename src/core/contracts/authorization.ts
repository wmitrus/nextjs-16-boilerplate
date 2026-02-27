import type { SubjectId } from './primitives';
import type { TenantContext } from './tenancy';

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
 * Context describing the acting subject.
 * Represents user, service account, or system identity.
 */
export interface SubjectContext {
  id: SubjectId;
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
  readonly time?: Date;
  readonly [key: string]: unknown;
}

/**
 * Complete authorization decision input.
 *
 * Immutable context passed to AuthorizationService.
 *
 * Must remain framework-agnostic.
 */
export interface AuthorizationContext {
  readonly tenant: TenantContext;
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
