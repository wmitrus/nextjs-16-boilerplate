import type { SubjectId } from './primitives';
import type { TenantContext } from './tenancy';

import type { Action } from '@/modules/authorization/domain/permission';

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
