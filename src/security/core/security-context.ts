import { headers } from 'next/headers';

import { ROLES, ROLE_HIERARCHY } from '@/core/contracts/roles';
import type { UserRole } from '@/core/contracts/roles';
import { env } from '@/core/env';

import { getIP } from '@/shared/lib/network/get-ip';

import type { SecurityContextDependencies } from './security-dependencies';
export type { SecurityContextDependencies } from './security-dependencies';
export type { UserRole } from '@/core/contracts/roles';

export interface SecurityContext {
  user?: {
    id: string;
    role: UserRole;
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
 */
export async function createSecurityContext(
  dependencies: SecurityContextDependencies,
): Promise<SecurityContext> {
  const { identityProvider, tenantResolver, roleRepository } = dependencies;

  const identity = await identityProvider.getCurrentIdentity();
  const headerList = await headers();

  const ip = await getIP(headerList);
  const userAgent = headerList.get('user-agent') ?? undefined;
  const correlationId =
    headerList.get('x-correlation-id') ?? crypto.randomUUID();
  const requestId = headerList.get('x-request-id') ?? crypto.randomUUID();

  let userContext: SecurityContext['user'];

  if (identity) {
    const tenantContext = await tenantResolver.resolve(identity);
    const roles = await roleRepository.getRoles(
      identity.id,
      tenantContext.tenantId,
    );

    let role: UserRole = ROLES.USER;
    const highestRole = roles.reduce<UserRole>((current, r) => {
      const roleLevel = ROLE_HIERARCHY[r as UserRole] ?? -1;
      return roleLevel > ROLE_HIERARCHY[current] ? (r as UserRole) : current;
    }, ROLES.USER);
    role = highestRole;

    userContext = {
      id: identity.id,
      role,
      tenantId: tenantContext.tenantId,
    };
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
