import { resolveServerLogger } from '@/core/logger/di';

import type { SecurityContext } from '@/security/core/security-context';

const logger = resolveServerLogger().child({
  type: 'Security',
  category: 'audit',
  module: 'action-audit',
});

const REDACTED_AUDIT_VALUE = '[REDACTED]';
const CIRCULAR_AUDIT_VALUE = '[Circular]';
const BINARY_AUDIT_VALUE = '[Binary]';
const SENSITIVE_AUDIT_FIELD_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
  /session/i,
  /^key$/i,
  /api[-_]?key/i,
];

export interface AuditLogOptions {
  actionName: string;
  input: unknown;
  result: 'success' | 'failure';
  error?: string;
  context: SecurityContext;
}

function isSensitiveAuditField(key: string): boolean {
  return SENSITIVE_AUDIT_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

function redactAuditInput(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    const entries: Array<[string, unknown]> = [];
    for (const [key, entryValue] of value.entries()) {
      entries.push([
        key,
        isSensitiveAuditField(key)
          ? REDACTED_AUDIT_VALUE
          : typeof entryValue === 'string'
            ? entryValue
            : BINARY_AUDIT_VALUE,
      ]);
    }
    return Object.fromEntries(entries);
  }

  if (
    typeof URLSearchParams !== 'undefined' &&
    value instanceof URLSearchParams
  ) {
    return Object.fromEntries(
      [...value.entries()].map(([key, entryValue]) => [
        key,
        isSensitiveAuditField(key) ? REDACTED_AUDIT_VALUE : entryValue,
      ]),
    );
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactAuditInput(entry, seen));
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return CIRCULAR_AUDIT_VALUE;
  }

  seen.add(value);

  const redactedEntries: Array<[string, unknown]> = [];
  for (const [key, entryValue] of Object.entries(value)) {
    redactedEntries.push([
      key,
      isSensitiveAuditField(key)
        ? REDACTED_AUDIT_VALUE
        : redactAuditInput(entryValue, seen),
    ]);
  }

  return Object.fromEntries(redactedEntries);
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
    tenantId: context.user?.tenantId,
    ip: context.ip,
    userAgent: context.userAgent,
    correlationId: context.correlationId,
    requestId: context.requestId,
    result,
    error,
    input: result === 'failure' ? redactAuditInput(input) : undefined,
  };

  if (result === 'failure') {
    logger.error(logPayload, `Action ${actionName} failed`);
  } else {
    logger.debug(logPayload, `Action ${actionName} successful`);
  }
}
