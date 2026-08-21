import { AUDIT_LOG } from '@/core/contracts';
import type { AuditLogService } from '@/core/contracts/audit-log';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

import { redactAuditInput } from './redact';

import type { SecurityContext } from '@/security/core/security-context';

const logger = resolveServerLogger().child({
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
 * Best-effort DB persistence, alongside the always-on Pino log below.
 *
 * Resolution AND `record()` are both wrapped here: `AuditLogService.record()`
 * itself never throws (it is always the `ResilientAuditLogService` fail-open
 * wrapper), but *resolving* the service can still throw -- most notably in
 * unit tests, where the global test double for `getAppContainer()`
 * (`tests/setup.tsx`) never registers `AUDIT_LOG.SERVICE` at all. Either
 * failure mode must never affect the caller's mutation or its Pino audit
 * log, which is why this is a fully separate try/catch from the logging
 * below rather than something threaded through `logActionAudit`'s callers.
 */
async function recordAuditEvent(
  actionName: string,
  outcome: 'success' | 'failure',
  context: SecurityContext,
  metadata: unknown,
): Promise<void> {
  try {
    const auditLogService = getAppContainer().resolve<AuditLogService>(
      AUDIT_LOG.SERVICE,
    );
    await auditLogService.record({
      category: 'server_action',
      action: actionName,
      outcome,
      tenantId: context.user?.tenantId ?? null,
      actorUserId: context.user?.id ?? null,
      ip: context.ip,
      userAgent: context.userAgent ?? null,
      correlationId: context.correlationId,
      requestId: context.requestId,
      metadata,
    });
  } catch (err) {
    logger.warn(
      {
        event: 'action-audit:db-write-unavailable',
        actionName,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : 'UnknownError',
      },
      'Audit log DB write unavailable; Pino audit log still recorded',
    );
  }
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
  // Redacted unconditionally (cheap, no I/O) so the DB path can honor a
  // category's `captureInputOnSuccess` setting independently of the Pino
  // path below, which always omits input on success regardless of that
  // per-category setting -- see recordAuditEvent's `metadata` argument.
  const redactedInput = redactAuditInput(input);

  const logPayload = {
    event: 'server_action_mutation',
    actionName,
    userId: context.user?.id,
    tenantId: context.user?.tenantId,
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId,
    requestId: context.requestId,
    result,
    error,
    input: result === 'failure' ? redactedInput : undefined,
  };

  if (result === 'failure') {
    logger.error(logPayload, `Action ${actionName} failed`);
  } else {
    logger.debug(logPayload, `Action ${actionName} successful`);
  }

  await recordAuditEvent(actionName, result, context, redactedInput);
}
