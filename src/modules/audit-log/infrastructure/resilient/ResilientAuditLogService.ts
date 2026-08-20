import type {
  AuditEventInput,
  AuditLogService,
} from '@/core/contracts/audit-log';
import { resolveServerLogger } from '@/core/logger/di';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'audit',
  module: 'audit-log-resilient',
});

/**
 * Fail-open wrapper satisfying `AuditLogService`'s "never reject" guarantee.
 * Mirrors `ResilientFeatureFlagService`: any infrastructure error from the
 * delegate is caught, logged, and swallowed rather than propagated to the
 * caller's mutation path.
 */
export class ResilientAuditLogService implements AuditLogService {
  constructor(private readonly delegate: AuditLogService) {}

  async record(event: AuditEventInput): Promise<void> {
    try {
      await this.delegate.record(event);
    } catch (error) {
      logger.warn(
        {
          event: 'audit-log:record-error',
          category: event.category,
          action: event.action,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Audit log write failed; event was not persisted (fail-open)',
      );
    }
  }
}
