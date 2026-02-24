import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';

import { env } from '@/core/env';

import { getIP } from '@/shared/lib/network/get-ip';

export type UserRole = 'admin' | 'user' | 'guest';

export interface SecurityContext {
  user?: {
    id: string;
    role: UserRole;
    tenantId?: string;
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
 */
export async function getSecurityContext(): Promise<SecurityContext> {
  const { userId, sessionClaims } = await auth();
  const headerList = await headers();

  const ip = await getIP(headerList);
  const userAgent = headerList.get('user-agent') ?? undefined;
  const correlationId =
    headerList.get('x-correlation-id') ?? crypto.randomUUID();
  const requestId = headerList.get('x-request-id') ?? crypto.randomUUID();

  // Extract role from Clerk metadata (mapping to our UserRole)
  const rawRole = (sessionClaims?.metadata as { role?: string })?.role;
  let role: UserRole = 'guest';

  if (userId) {
    if (rawRole === 'admin') role = 'admin';
    else role = 'user';
  }

  const tenantId = (sessionClaims?.metadata as { tenantId?: string })?.tenantId;

  return {
    user: userId
      ? {
          id: userId,
          role,
          tenantId,
        }
      : undefined,
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
