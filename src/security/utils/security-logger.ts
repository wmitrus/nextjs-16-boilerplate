import { AUDIT_LOG } from '@/core/contracts';
import type { AuditLogService } from '@/core/contracts/audit-log';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { redactAuditInput } from '@/security/actions/redact';
import type { SecurityContext } from '@/security/core/security-context';

const logger = resolveServerLogger().child({
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
 * Best-effort DB persistence, alongside the always-on Pino `fatal` log
 * below. See the doc comment on `recordAuditEvent` in
 * `src/security/actions/action-audit.ts` for why resolution and
 * `record()` are both wrapped here rather than trusted to
 * `AuditLogService`'s own fail-open guarantee alone.
 */
async function recordSecurityAuditEvent(
  event: SecurityEventOptions['event'],
  context: SecurityContext,
  metadata: Record<string, unknown> | undefined,
): Promise<void> {
  try {
    const auditLogService = getAppContainer().resolve<AuditLogService>(
      AUDIT_LOG.SERVICE,
    );
    await auditLogService.record({
      category: 'security_event',
      action: event,
      // Every event this utility logs represents a blocked or flagged
      // attempt, never a completed action -- 'failure' fits the shared
      // outcome vocabulary better than stretching 'success'/'denied' to
      // cover cases like auth_failure that aren't strictly authorization
      // denials.
      outcome: 'failure',
      tenantId: context.user?.tenantId ?? null,
      actorUserId: context.user?.id ?? null,
      ip: context.ip,
      correlationId: context.correlationId,
      requestId: context.requestId,
      metadata: metadata ? redactAuditInput(metadata) : undefined,
    });
  } catch (err) {
    logger.warn(
      {
        event: 'security-logger:db-write-unavailable',
        securityEvent: event,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : 'UnknownError',
      },
      'Audit log DB write unavailable; Pino security log still recorded',
    );
  }
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

  await recordSecurityAuditEvent(event, context, metadata);
}
