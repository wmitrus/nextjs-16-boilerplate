import { AUDIT_LOG } from '@/core/contracts';
import type {
  AuditEventInput,
  AuditLogService,
} from '@/core/contracts/audit-log';
import { resolveServerLogger } from '@/core/logger/di';
import { getAppContainer } from '@/core/runtime/bootstrap';

const logger = resolveServerLogger().child({
  type: 'Security',
  category: 'audit',
  module: 'admin-audit-event',
});

/**
 * Shared resolve+record+catch wrapper for `/api/admin/**` route handlers.
 *
 * These routes bypass `createSecureAction` (confirmed: none of them use it
 * — see `.copilot/tasks/2026-08-20-audit-logs-design-plan/plan.md` Part
 * B.5), so they don't get `logActionAudit`'s automatic coverage from Phase
 * 2. Every mutating admin route calls this once per mutation, alongside
 * its existing Pino `logger.info({ event: 'admin:...' })` call where one
 * exists (never replacing it) — not every route already had one; where it
 * didn't, this is the only audit signal added, deliberately, per the
 * plan's scope (backfilling missing Pino observability is out of scope for
 * this phase).
 *
 * Mirrors the exact fail-open shape already proven in
 * `action-audit.ts`'s `recordAuditEvent` and `security-logger.ts`'s
 * `recordSecurityAuditEvent`: both resolution (`getAppContainer().resolve()`)
 * and `record()` itself are wrapped, not just the latter, because a
 * container that never registered `AUDIT_LOG.SERVICE` (the global unit-test
 * double in `tests/setup.tsx`) throws on `resolve()` before
 * `ResilientAuditLogService`'s own guarantee ever applies. Deliberately a
 * standalone copy rather than a further extraction shared with those two —
 * three call sites is not yet enough duplication to justify coupling
 * `action-audit.ts`/`security-logger.ts` (already shipped, already tested)
 * to a new shared module.
 */
export async function recordAdminAuditEvent(
  event: AuditEventInput,
): Promise<void> {
  try {
    const auditLogService = getAppContainer().resolve<AuditLogService>(
      AUDIT_LOG.SERVICE,
    );
    await auditLogService.record(event);
  } catch (err) {
    logger.warn(
      {
        event: 'admin-audit-event:db-write-unavailable',
        category: event.category,
        action: event.action,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : 'UnknownError',
      },
      'Audit log DB write unavailable for admin route event',
    );
  }
}
