import { headers } from 'next/headers';

import { MissingTenantContextError } from '@/core/contracts/tenancy';
import { env } from '@/core/env';

import { getIP } from '@/shared/lib/network/get-ip';

import type { SecurityContextDependencies } from './security-dependencies';
export type { SecurityContextDependencies } from './security-dependencies';

export interface SecurityContext {
  user?: {
    id: string;
    tenantId: string;
    attributes?: Record<string, unknown>;
  };
  ip: string;
  userAgent?: string;
  correlationId: string;
  runtime: 'edge' | 'node';
  environment: 'development' | 'test' | 'production';
  requestId: string;
}

/**
 * Builds the security context from the current request and session.
 * Designed to be used in Server Components, Server Actions, and Route Handlers.
 * Decoupled from direct Auth providers via the DI Container.
 *
 * SecurityContext captures technical request facts only:
 * - who is asking (identity id, tenant id)
 * - from where (ip, userAgent, correlationId, requestId)
 * - runtime metadata
 *
 * Role resolution and authorization precomputation belong in AuthorizationService.
 */
export async function createSecurityContext(
  dependencies: SecurityContextDependencies,
): Promise<SecurityContext> {
  const { identityProvider, tenantResolver } = dependencies;

  const identity = await identityProvider.getCurrentIdentity();
  const headerList = await headers();

  const ip = await getIP(headerList);
  const userAgent = headerList.get('user-agent') ?? undefined;
  const correlationId =
    headerList.get('x-correlation-id') ?? crypto.randomUUID();
  const requestId = headerList.get('x-request-id') ?? crypto.randomUUID();

  let userContext: SecurityContext['user'];

  if (identity) {
    try {
      const tenantContext = await tenantResolver.resolve(identity);

      userContext = {
        id: identity.id,
        tenantId: tenantContext.tenantId,
      };
    } catch (error) {
      if (!(error instanceof MissingTenantContextError)) {
        throw error;
      }
    }
  }

  return {
    user: userContext,
    ip,
    userAgent,
    correlationId,
    requestId,
    runtime:
      typeof process !== 'undefined' && process.release?.name === 'node'
        ? 'node'
        : 'edge',
    environment: env.NODE_ENV as 'development' | 'test' | 'production',
  };
}

export const getSecurityContext = createSecurityContext;
