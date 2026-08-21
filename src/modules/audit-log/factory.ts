import type { AuditLogService } from '@/core/contracts/audit-log';
import type { DrizzleDb } from '@/core/db';

import { DrizzleAuditLogService } from './infrastructure/drizzle/DrizzleAuditLogService';
import { ResilientAuditLogService } from './infrastructure/resilient/ResilientAuditLogService';

/**
 * Composition-root entry point for the audit-log writer. Always returns the
 * fail-open (`ResilientAuditLogService`) wrapper -- callers must never
 * receive the raw `DrizzleAuditLogService`, which is allowed to throw.
 */
export function createAuditLogService(db: DrizzleDb): AuditLogService {
  return new ResilientAuditLogService(new DrizzleAuditLogService(db));
}
