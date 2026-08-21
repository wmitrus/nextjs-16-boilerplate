import { and, asc, eq, isNull, or } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import {
  getAuditCategoryDefault,
  type AuditCategory,
} from '../../domain/category';

import { auditLogSettingsTable } from './schema';

export type EffectiveAuditSetting = {
  enabled: boolean;
  retentionDays: number;
  sampleRate: number | null;
  captureInputOnSuccess: boolean;
};

/**
 * Tenant override row if present, else the global row, else the taxonomy
 * default. A single query: ordering by `tenantId ASC` sorts a real tenant
 * string before `NULL` (Postgres's default `NULLS LAST` for ascending
 * order), so `LIMIT 1` naturally prefers the tenant-specific row when both
 * exist.
 *
 * Shared by every consumer that needs the currently-effective settings for
 * a (category, tenantId) pair -- the write path (`DrizzleAuditLogService`)
 * and the retention-enforcement job (`scripts/audit-log/purge-expired.ts`)
 * -- so both apply the exact same enabled/retention/sampling rules and
 * never drift apart.
 */
export async function resolveEffectiveAuditSetting(
  db: DrizzleDb,
  category: AuditCategory,
  tenantId: string | null,
): Promise<EffectiveAuditSetting> {
  const scopePredicate =
    tenantId === null
      ? isNull(auditLogSettingsTable.tenantId)
      : or(
          eq(auditLogSettingsTable.tenantId, tenantId),
          isNull(auditLogSettingsTable.tenantId),
        );

  const rows = await db
    .select({
      enabled: auditLogSettingsTable.enabled,
      retentionDays: auditLogSettingsTable.retentionDays,
      sampleRate: auditLogSettingsTable.sampleRate,
      captureInputOnSuccess: auditLogSettingsTable.captureInputOnSuccess,
    })
    .from(auditLogSettingsTable)
    .where(and(eq(auditLogSettingsTable.category, category), scopePredicate))
    .orderBy(asc(auditLogSettingsTable.tenantId))
    .limit(1);

  const row = rows[0];
  if (row) return row;

  const def = getAuditCategoryDefault(category);
  return {
    enabled: def.enabled,
    retentionDays: def.retentionDays,
    sampleRate: def.sampleRate,
    captureInputOnSuccess: def.captureInputOnSuccess,
  };
}
