import { and, eq, isNull, or } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import {
  AUDIT_CATEGORIES,
  AUDIT_RETENTION_DAYS_MAX,
  AUDIT_RETENTION_DAYS_MIN,
  AUDIT_SAMPLE_RATE_MAX,
  AUDIT_SAMPLE_RATE_MIN,
  type AuditCategory,
  getAuditCategoryDefault,
} from '../../domain/category';
import {
  AuditSettingNotFoundError,
  AuditSettingScopeError,
  InvalidAuditRetentionDaysError,
  InvalidAuditSampleRateError,
} from '../../domain/errors';

import { auditLogSettingsTable } from './schema';

export type AuditSettingSource =
  | 'tenant-override'
  | 'global'
  | 'taxonomy-default';

export type AuditSettingDto = {
  id: string | null;
  category: AuditCategory;
  /** The tenant this row belongs to, or `null` for the global row. */
  tenantId: string | null;
  /** Where the effective value came from — for UI display, not for authz. */
  source: AuditSettingSource;
  enabled: boolean;
  retentionDays: number;
  sampleRate: number | null;
  captureInputOnSuccess: boolean;
  updatedByUserId: string | null;
  updatedAt: string | null;
};

export type UpsertAuditSettingInput = {
  category: AuditCategory;
  /** `null` = global row. Only a platform admin may target `null`. */
  tenantId: string | null;
  enabled: boolean;
  retentionDays: number;
  sampleRate?: number | null;
  captureInputOnSuccess: boolean;
  updatedByUserId: string | null;
};

/**
 * The tenant scope a caller is authorized to mutate within.
 *
 * `null` means "no additional scope restriction" and must only be passed
 * for an unscoped platform admin (`isEnvBasedPlatformAdmin`). An
 * ABAC-authorized caller (ordinary tenant owner) must always pass
 * `{ tenantId }` so mutations are constrained to their own tenant's rows —
 * never global (`tenantId: null`) rows and never another tenant's rows.
 * See SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
export type MutationScope = { tenantId: string } | null;

type SettingRow = {
  id: string;
  category: AuditCategory;
  tenantId: string | null;
  enabled: boolean;
  retentionDays: number;
  sampleRate: number | null;
  captureInputOnSuccess: boolean;
  updatedByUserId: string | null;
  updatedAt: Date;
};

function toStoredDto(
  row: SettingRow,
  source: Exclude<AuditSettingSource, 'taxonomy-default'>,
): AuditSettingDto {
  return {
    id: row.id,
    category: row.category,
    tenantId: row.tenantId,
    source,
    enabled: row.enabled,
    retentionDays: row.retentionDays,
    sampleRate: row.sampleRate,
    captureInputOnSuccess: row.captureInputOnSuccess,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDefaultDto(
  category: AuditCategory,
  tenantId: string | null,
): AuditSettingDto {
  const def = getAuditCategoryDefault(category);
  return {
    id: null,
    category,
    tenantId,
    source: 'taxonomy-default',
    enabled: def.enabled,
    retentionDays: def.retentionDays,
    sampleRate: def.sampleRate,
    captureInputOnSuccess: def.captureInputOnSuccess,
    updatedByUserId: null,
    updatedAt: null,
  };
}

function assertValidRetentionDays(retentionDays: number): void {
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < AUDIT_RETENTION_DAYS_MIN ||
    retentionDays > AUDIT_RETENTION_DAYS_MAX
  ) {
    throw new InvalidAuditRetentionDaysError(
      `retentionDays must be an integer between ${AUDIT_RETENTION_DAYS_MIN} and ${AUDIT_RETENTION_DAYS_MAX}`,
    );
  }
}

function assertValidSampleRate(sampleRate: number | null | undefined): void {
  if (sampleRate === null || sampleRate === undefined) return;
  if (
    sampleRate < AUDIT_SAMPLE_RATE_MIN ||
    sampleRate > AUDIT_SAMPLE_RATE_MAX
  ) {
    throw new InvalidAuditSampleRateError(
      `sampleRate must be between ${AUDIT_SAMPLE_RATE_MIN} and ${AUDIT_SAMPLE_RATE_MAX}`,
    );
  }
}

/** Defense in depth — see `AuditSettingScopeError`'s doc comment. */
function assertScopeAllows(
  targetTenantId: string | null,
  scope: MutationScope,
): void {
  if (scope === null) return;
  if (targetTenantId !== scope.tenantId) {
    throw new AuditSettingScopeError();
  }
}

function tenantPredicate(tenantId: string | null) {
  return tenantId === null
    ? isNull(auditLogSettingsTable.tenantId)
    : eq(auditLogSettingsTable.tenantId, tenantId);
}

/**
 * Admin-only CRUD service for `audit_log_settings` rows.
 *
 * Deliberately NOT registered in the DI container — operator-only,
 * low-frequency, directly instantiated at the route-handler call site.
 * Mirrors `DrizzleFeatureFlagAdminService` exactly for the same reasons
 * (see that class's doc comment and
 * `.copilot/tasks/2026-08-20-audit-logs-design-plan/01 - Architecture Guard - Summary.md`).
 */
export class DrizzleAuditLogSettingsAdminService {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * Unscoped, platform-admin-only view: every category's global
   * (`tenantId: null`) row, falling back to the taxonomy default when no
   * row exists yet.
   */
  async listGlobalEffective(): Promise<AuditSettingDto[]> {
    const rows = await this.db
      .select()
      .from(auditLogSettingsTable)
      .where(isNull(auditLogSettingsTable.tenantId));

    const byCategory = new Map(rows.map((row) => [row.category, row]));

    return AUDIT_CATEGORIES.map((category) => {
      const row = byCategory.get(category);
      return row ? toStoredDto(row, 'global') : toDefaultDto(category, null);
    });
  }

  /**
   * Tenant-scoped view: for each category, the tenant's own override row if
   * present, else the global row, else the taxonomy default. Never surfaces
   * another tenant's override (SEC-26).
   */
  async listEffectiveForTenant(tenantId: string): Promise<AuditSettingDto[]> {
    const rows = await this.db
      .select()
      .from(auditLogSettingsTable)
      .where(
        or(
          isNull(auditLogSettingsTable.tenantId),
          eq(auditLogSettingsTable.tenantId, tenantId),
        ),
      );

    const globalByCategory = new Map(
      rows.filter((r) => r.tenantId === null).map((row) => [row.category, row]),
    );
    const tenantByCategory = new Map(
      rows
        .filter((r) => r.tenantId === tenantId)
        .map((row) => [row.category, row]),
    );

    return AUDIT_CATEGORIES.map((category) => {
      const tenantRow = tenantByCategory.get(category);
      if (tenantRow) return toStoredDto(tenantRow, 'tenant-override');

      const globalRow = globalByCategory.get(category);
      if (globalRow) return toStoredDto(globalRow, 'global');

      return toDefaultDto(category, tenantId);
    });
  }

  /**
   * Creates or updates the (category, tenantId) row. Categories are a
   * fixed, curated taxonomy (not user-created keys like feature-flag
   * `key`), so upsert-by-natural-key is the right shape here — there is no
   * meaningful "duplicate" error case to report back to the caller, unlike
   * `DrizzleFeatureFlagAdminService.create()`.
   */
  async upsert(
    input: UpsertAuditSettingInput,
    scope: MutationScope,
  ): Promise<AuditSettingDto> {
    assertScopeAllows(input.tenantId, scope);
    assertValidRetentionDays(input.retentionDays);
    assertValidSampleRate(input.sampleRate);

    const sampleRate = input.sampleRate ?? null;

    const [row] = await this.db
      .insert(auditLogSettingsTable)
      .values({
        category: input.category,
        tenantId: input.tenantId,
        enabled: input.enabled,
        retentionDays: input.retentionDays,
        sampleRate,
        captureInputOnSuccess: input.captureInputOnSuccess,
        updatedByUserId: input.updatedByUserId,
      })
      .onConflictDoUpdate({
        target: [
          auditLogSettingsTable.category,
          auditLogSettingsTable.tenantId,
        ],
        set: {
          enabled: input.enabled,
          retentionDays: input.retentionDays,
          sampleRate,
          captureInputOnSuccess: input.captureInputOnSuccess,
          updatedByUserId: input.updatedByUserId,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error('Failed to upsert audit log setting');
    }

    return toStoredDto(
      row,
      row.tenantId === null ? 'global' : 'tenant-override',
    );
  }

  /**
   * Deletes the (category, tenantId) override row, reverting the effective
   * value back to the global row (or the taxonomy default if there is no
   * global row either). Throws if no override row exists to delete.
   */
  async resetToDefault(
    category: AuditCategory,
    tenantId: string | null,
    scope: MutationScope,
  ): Promise<void> {
    assertScopeAllows(tenantId, scope);

    const predicate = and(
      eq(auditLogSettingsTable.category, category),
      tenantPredicate(tenantId),
    );

    const deleted = await this.db
      .delete(auditLogSettingsTable)
      .where(predicate)
      .returning();

    if (deleted.length === 0) {
      throw new AuditSettingNotFoundError();
    }
  }
}
