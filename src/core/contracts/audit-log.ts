/**
 * Contract for the audit-log write path.
 *
 * Deliberately decoupled from the `audit-log` module's domain taxonomy
 * (`AuditCategory` in `src/modules/audit-log/domain/category.ts`): `core`
 * must not depend on `modules` (see
 * `docs/architecture/10 - Modular Monolith - File Catalog.md` §2.1), so
 * `category`/`outcome` are plain strings here. The concrete implementation
 * (`DrizzleAuditLogService`) is free to validate/narrow them internally.
 *
 * FAIL-SAFE GUARANTEE:
 * The implementation registered via the factory is wrapped in
 * `ResilientAuditLogService`. `record()` MUST NEVER reject — any
 * infrastructure error (DB unreachable, table missing, redaction bug,
 * etc.) is caught and logged, never thrown back to the caller.
 *
 * Callers must NOT wrap `record()` calls in try/catch for that reason —
 * but callers that resolve the service from the DI container themselves
 * (rather than receiving it as an injected dependency) still need their
 * own try/catch around *resolution*, since a container that never
 * registered `AUDIT_LOG.SERVICE` (e.g. a test double) throws on
 * `resolve()` before `record()` is ever reached. See
 * `src/security/actions/action-audit.ts` for the reference pattern.
 */
export interface AuditEventInput {
  /** e.g. 'auth', 'server_action', 'security_event' — see the taxonomy. */
  category: string;
  /** e.g. 'org.update', 'policy.delete', 'auth.signin_failed'. */
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  tenantId?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  /**
   * Caller-redacted metadata. The audit-log module does not redact —
   * redaction happens on the caller's side (`src/security/actions/redact.ts`)
   * because `modules -> security` is not an allowed dependency direction.
   * The service decides only whether to *persist* this value (based on the
   * category's `captureInputOnSuccess` setting and `outcome`) and applies
   * its own generic size cap.
   */
  metadata?: unknown;
}

export interface AuditLogService {
  record(event: AuditEventInput): Promise<void>;
}
