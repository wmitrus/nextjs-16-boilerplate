import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db';
import { organizationsReferenceTable } from '@/core/db/schema/references';

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

export type AuditEffectiveSettingScope = Extract<
  DataScope,
  { kind: 'organization' | 'platform-global' }
>;

function taxonomyDefault(category: AuditCategory): EffectiveAuditSetting {
  const def = getAuditCategoryDefault(category);
  return {
    enabled: def.enabled,
    retentionDays: def.retentionDays,
    sampleRate: def.sampleRate,
    captureInputOnSuccess: def.captureInputOnSuccess,
  };
}

function firstRawRow<T>(raw: unknown): T | undefined {
  const rows = (
    Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])
  ) as T[];

  return rows[0];
}

/**
 * OZI-71 AUD·D canonical effective-settings resolver.
 *
 * Organization scope:
 * - proves the full `(organizationId, tenantId)` tuple in the SAME query;
 * - an invalid tuple returns `null` and MUST NOT inherit global/taxonomy;
 * - valid scope resolves organization override -> intentional-global row ->
 *   taxonomy default;
 * - unresolved_legacy / quarantined never participate.
 *
 * Platform-global scope:
 * - resolves intentional-global only -> taxonomy default;
 * - canonical organization, unresolved and quarantined rows never participate.
 */
export async function resolveCanonicalEffectiveAuditSetting(
  db: DrizzleDb,
  category: AuditCategory,
  scope: AuditEffectiveSettingScope,
): Promise<EffectiveAuditSetting | null> {
  if (scope.kind === 'platform-global') {
    const raw = await db.execute(sql`
      SELECT
        enabled,
        retention_days AS "retentionDays",
        sample_rate AS "sampleRate",
        capture_input_on_success AS "captureInputOnSuccess"
      FROM ${auditLogSettingsTable}
      WHERE category = ${category}
        AND ownership_state = 'intentional_global'
      LIMIT 1
    `);

    const row = firstRawRow<EffectiveAuditSetting>(raw);
    return row ?? taxonomyDefault(category);
  }

  const raw = await db.execute(sql`
    WITH valid_scope AS (
      SELECT 1
      FROM ${organizationsReferenceTable}
      WHERE id = ${scope.organizationId}
        AND tenant_id = ${scope.tenantId}
    )
    SELECT
      EXISTS (SELECT 1 FROM valid_scope) AS "validScope",
      (selected.id IS NOT NULL) AS "settingFound",
      selected.enabled,
      selected.retention_days AS "retentionDays",
      selected.sample_rate AS "sampleRate",
      selected.capture_input_on_success AS "captureInputOnSuccess"
    FROM (SELECT 1) singleton
    LEFT JOIN LATERAL (
      SELECT
        s.id,
        s.enabled,
        s.retention_days,
        s.sample_rate,
        s.capture_input_on_success,
        s.organization_id
      FROM ${auditLogSettingsTable} s
      WHERE EXISTS (SELECT 1 FROM valid_scope)
        AND s.category = ${category}
        AND (
          (
            s.ownership_state = 'canonical_organization'
            AND s.organization_id = ${scope.organizationId}
          )
          OR s.ownership_state = 'intentional_global'
        )
      ORDER BY (s.organization_id IS NULL) ASC
      LIMIT 1
    ) selected ON TRUE
  `);

  const row = firstRawRow<{
    validScope: boolean;
    settingFound: boolean;
    enabled: boolean | null;
    retentionDays: number | null;
    sampleRate: number | null;
    captureInputOnSuccess: boolean | null;
  }>(raw);

  if (!row?.validScope) {
    return null;
  }

  if (!row.settingFound) {
    return taxonomyDefault(category);
  }

  if (
    row.enabled === null ||
    row.retentionDays === null ||
    row.captureInputOnSuccess === null
  ) {
    throw new Error('Canonical audit setting row is structurally incomplete.');
  }

  return {
    enabled: row.enabled,
    retentionDays: row.retentionDays,
    sampleRate: row.sampleRate,
    captureInputOnSuccess: row.captureInputOnSuccess,
  };
}

/**
 * OZI-71 AUD·D bounded legacy-retention compatibility resolver.
 *
 * DATA-MIGRATION COMPATIBILITY ONLY. Never use this function for
 * authorization, DataScope derivation, canonical settings evaluation, or
 * ordinary audit visibility.
 *
 * It intentionally reproduces the pre-cutover retention lookup for
 * unresolved/quarantined historical audit events:
 * 1. exact (category, legacy tenant_id) setting;
 * 2. legacy global (category, tenant_id IS NULL) setting;
 * 3. taxonomy default.
 *
 * This path may therefore observe unresolved/quarantined historical settings
 * rows. That does not make those rows canonically active. The contract exists
 * only until R4b-1 removes the legacy retention compatibility path.
 */
export async function resolveLegacyAuditRetentionCompat(
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

  return taxonomyDefault(category);
}
