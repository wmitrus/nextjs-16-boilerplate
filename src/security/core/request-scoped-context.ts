import type { SecurityContext } from './security-context';

export interface RequestScopedContext {
  readonly identityId?: string;
  readonly tenantId?: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly runtime: 'edge' | 'node';
  readonly environment: 'development' | 'test' | 'production';
  /**
   * Opt-in pre-fetched feature flag values for this request.
   *
   * Defaults to {} — the auth layer does NOT populate this automatically.
   * Population is the responsibility of the specific RSC page, server action,
   * or route handler that knows which named flags are relevant.
   *
   * Use FeatureFlagService.isEnabled(flag, authorizationContext) at the point
   * of consumption. Pre-populate this field only when passing a known flag
   * map explicitly through component props or action context.
   *
   * For ABAC policy conditions, use TenantAttributes.features instead.
   */
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export function createRequestScopedContext(input: {
  identityId?: string;
  tenantId?: string;
  correlationId: string;
  requestId: string;
  runtime: 'edge' | 'node';
  environment: 'development' | 'test' | 'production';
  featureFlags?: Record<string, boolean>;
  metadata?: Record<string, unknown>;
}): RequestScopedContext {
  return {
    identityId: input.identityId,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    requestId: input.requestId,
    runtime: input.runtime,
    environment: input.environment,
    featureFlags: input.featureFlags ?? {},
    metadata: input.metadata ?? {},
  };
}

export function createRequestScopedContextFromSecurityContext(
  context: SecurityContext,
  metadata?: Record<string, unknown>,
): RequestScopedContext {
  return createRequestScopedContext({
    identityId: context.user?.id,
    tenantId: context.user?.tenantId,
    correlationId: context.correlationId,
    requestId: context.requestId,
    runtime: context.runtime,
    environment: context.environment,
    metadata,
  });
}
