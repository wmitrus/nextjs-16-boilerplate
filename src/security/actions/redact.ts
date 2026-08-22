/**
 * Shared redaction for audit metadata. Extracted from
 * `action-audit.ts` (Phase 2 of the audit-logging plan,
 * `.copilot/tasks/2026-08-20-audit-logs-design-plan/plan.md` Part A.4 item
 * 4) so both the Pino log path (`logActionAudit`, `logSecurityEvent`) and
 * the DB audit-trail path apply the exact same rules and never drift
 * apart. Deliberately not moved into `src/modules/audit-log` -- `modules
 * -> security` is not an allowed dependency direction (see
 * `docs/architecture/10 - Modular Monolith - File Catalog.md` §2.1), so
 * redaction must happen on the security-layer caller's side, before the
 * (already-redacted) value crosses the `AuditLogService` contract.
 */

const REDACTED_AUDIT_VALUE = '[REDACTED]';
const CIRCULAR_AUDIT_VALUE = '[Circular]';
const BINARY_AUDIT_VALUE = '[Binary]';

/**
 * Exported (not just used internally here) so any other module that needs
 * to recognize a credential-shaped field/header name reuses this exact
 * list instead of maintaining a second, driftable copy — e.g.
 * `secure-fetch.ts`'s cross-origin redirect header stripping (A.8.2).
 */
export const SENSITIVE_AUDIT_FIELD_PATTERNS = [
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

export function isSensitiveAuditField(key: string): boolean {
  return SENSITIVE_AUDIT_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactAuditInput(
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
