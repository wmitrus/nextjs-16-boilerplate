import { headers } from 'next/headers';

import { UserNotProvisionedError } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
  TenantNotProvisionedError,
} from '@/core/contracts/tenancy';
import { env } from '@/core/env';

import { getIP } from '@/shared/lib/network/get-ip';

import type { NodeSecurityContextDependencies } from './security-dependencies';
export type { SecurityContextDependencies } from './security-dependencies';

export type ReadinessStatus =
  | 'ALLOWED'
  | 'BOOTSTRAP_REQUIRED'
  | 'ONBOARDING_REQUIRED'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'UNAUTHENTICATED';

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
  readinessStatus: ReadinessStatus;
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
  dependencies: NodeSecurityContextDependencies,
): Promise<SecurityContext> {
  const { identityProvider, tenantResolver, userRepository } = dependencies;

  const headerList = await headers();
  const ip = await getIP(headerList);
  const userAgent = headerList.get('user-agent') ?? undefined;
  const correlationId =
    headerList.get('x-correlation-id') ?? crypto.randomUUID();
  const requestId = headerList.get('x-request-id') ?? crypto.randomUUID();

  const baseContext = {
    ip,
    userAgent,
    correlationId,
    requestId,
    runtime:
      typeof process !== 'undefined' && process.release?.name === 'node'
        ? ('node' as const)
        : ('edge' as const),
    environment: env.NODE_ENV as 'development' | 'test' | 'production',
  };

  let identity;
  try {
    identity = await identityProvider.getCurrentIdentity();
  } catch (err) {
    if (err instanceof UserNotProvisionedError) {
      return {
        ...baseContext,
        user: undefined,
        readinessStatus: 'BOOTSTRAP_REQUIRED',
      };
    }
    throw err;
  }

  if (!identity) {
    return {
      ...baseContext,
      user: undefined,
      readinessStatus: 'UNAUTHENTICATED',
    };
  }

  const user = await userRepository.findById(identity.id);

  if (!user) {
    return {
      ...baseContext,
      user: undefined,
      readinessStatus: 'BOOTSTRAP_REQUIRED',
    };
  }

  if (!user.onboardingComplete) {
    return {
      ...baseContext,
      user: undefined,
      readinessStatus: 'ONBOARDING_REQUIRED',
    };
  }

  try {
    const tenantContext = await tenantResolver.resolve(identity);
    return {
      ...baseContext,
      user: {
        id: identity.id,
        tenantId: tenantContext.tenantId,
      },
      readinessStatus: 'ALLOWED',
    };
  } catch (err) {
    if (
      err instanceof MissingTenantContextError ||
      err instanceof TenantNotProvisionedError
    ) {
      return {
        ...baseContext,
        user: undefined,
        readinessStatus: 'TENANT_CONTEXT_REQUIRED',
      };
    }
    if (err instanceof TenantMembershipRequiredError) {
      return {
        ...baseContext,
        user: undefined,
        readinessStatus: 'TENANT_MEMBERSHIP_REQUIRED',
      };
    }
    throw err;
  }
}

export const getSecurityContext = createSecurityContext;
