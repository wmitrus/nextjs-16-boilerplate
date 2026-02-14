import { logger } from '@/core/logger/server';

import type { SecurityContext } from '@/security/core/security-context';

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
    type: 'SECURITY_AUDIT',
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
    // We hash the input to avoid logging PII but still allow tracking change signatures
    // For this boilerplate, we'll log it directly but rely on Pino's redaction
    input: result === 'failure' ? input : undefined, // Log input on failure for debugging
  };

  if (result === 'failure') {
    logger.error(logPayload, `Security Audit: Action ${actionName} failed`);
  } else {
    logger.info(logPayload, `Security Audit: Action ${actionName} successful`);
  }
}
