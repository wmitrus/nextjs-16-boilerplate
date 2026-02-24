import { logger as baseLogger } from '@/core/logger/server';

import type { SecurityContext } from '@/security/core/security-context';

const logger = baseLogger.child({
  type: 'Security',
  category: 'audit',
  module: 'action-audit',
});

export interface AuditLogOptions {
  actionName: string;
  input: unknown;
  result: 'success' | 'failure';
  error?: string;
  context: SecurityContext;
}

/**
 * Logs a mutation action for security auditing.
 */
export async function logActionAudit({
  actionName,
  input,
  result,
  error,
  context,
}: AuditLogOptions): Promise<void> {
  // In a real production app, you might send this to a dedicated audit database
  // or a specialized security monitoring tool.
  const logPayload = {
    event: 'server_action_mutation',
    actionName,
    userId: context.user?.id,
    role: context.user?.role,
    tenantId: context.user?.tenantId,
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId,
    requestId: context.requestId,
    result,
    error,
    input: result === 'failure' ? input : undefined,
  };

  if (result === 'failure') {
    logger.error(logPayload, `Action ${actionName} failed`);
  } else {
    logger.debug(logPayload, `Action ${actionName} successful`);
  }
}
