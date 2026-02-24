import { logger as baseLogger } from '@/core/logger/server';

import type { SecurityContext } from '@/security/core/security-context';

const logger = baseLogger.child({
  type: 'Security',
  category: 'events',
  module: 'security-logger',
});

export interface SecurityEventOptions {
  event:
    | 'auth_failure'
    | 'tenant_violation'
    | 'ssrf_attempt'
    | 'rate_limit_bypass'
    | 'replay_attack';
  context: SecurityContext;
  metadata?: Record<string, unknown>;
}

/**
 * Centralized utility for logging high-severity security events.
 */
export async function logSecurityEvent({
  event,
  context,
  metadata,
}: SecurityEventOptions): Promise<void> {
  const payload = {
    type: 'SECURITY_EVENT',
    event,
    userId: context.user?.id,
    ip: context.ip,
    correlationId: context.correlationId,
    requestId: context.requestId,
    environment: context.environment,
    ...metadata,
  };

  logger.fatal(payload, `Critical Security Event: ${event.toUpperCase()}`);
}
