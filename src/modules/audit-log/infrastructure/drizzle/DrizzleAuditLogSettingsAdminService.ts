import { eq, sql } from 'drizzle-orm';

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db';
import { organizationsReferenceTable } from '@/core/db/schema/references';

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
  AuditCanonicalWriteInvariantError,
  AuditSettingAliasConflictError,
  AuditSettingNotFoundError,
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

/**
 * OZI-71 AUD·D canonical mutation input.
 *
 * Ownership is supplied exclusively by AuditLogSettingsAdminScope. No raw
 * tenant/provider identifier is accepted by the business mutation API.
 */
export type CanonicalUpsertAuditSettingInput = {
  category: AuditCategory;
  enabled: boolean;
  retentionDays: number;
  sampleRate?: number | null;
  captureInputOnSuccess: boolean;
  updatedByUserId: string | null;
};

/**
 * OZI-71 AUD·D canonical scope accepted by Audit Log Settings reads.
 * Legacy tenant ids are not authorization inputs.
 */
export type AuditLogSettingsAdminScope = Extract<
  DataScope,
  { kind: 'organization' | 'platform-global' }
>;

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

type RawSettingRow = Omit<SettingRow, 'updatedAt'> & {
  updatedAt: Date | string;
};

function normalizeRawRows<T>(raw: unknown): T[] {
  return (
    Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])
  ) as T[];
}

function hasUniqueViolationCode(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    (value as { code?: unknown }).code === '23505'
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  if (
    error.message.includes('unique constraint') ||
    hasUniqueViolationCode(error)
  ) {
    return true;
  }

  const cause =
    'cause' in error ? (error as { cause?: unknown }).cause : undefined;

  return (
    cause instanceof Error &&
    (cause.message.includes('unique constraint') ||
      hasUniqueViolationCode(cause))
  );
}

function toRawStoredDto(
  row: RawSettingRow,
  source: Exclude<AuditSettingSource, 'taxonomy-default'>,
): AuditSettingDto {
  return toStoredDto(
    {
      ...row,
      updatedAt: new Date(row.updatedAt),
    },
    source,
  );
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
   * OZI-71 AUD·D canonical settings reader.
   *
   * platform-global:
   *   intentional_global rows only -> taxonomy fallback.
   *
   * organization:
   *   validates the complete (organizationId, tenantId) tuple in the SAME
   *   query that admits the organization override/global fallback.
   *   Invalid tuple -> [] with no global or taxonomy fallback.
   *
   * unresolved_legacy / quarantined never participate.
   */
  async list(scope: AuditLogSettingsAdminScope): Promise<AuditSettingDto[]> {
    if (scope.kind === 'platform-global') {
      const rows = await this.db
        .select()
        .from(auditLogSettingsTable)
        .where(eq(auditLogSettingsTable.ownershipState, 'intentional_global'));

      const globalByCategory = new Map(rows.map((row) => [row.category, row]));

      return AUDIT_CATEGORIES.map((category) => {
        const row = globalByCategory.get(category);
        return row ? toStoredDto(row, 'global') : toDefaultDto(category, null);
      });
    }

    const raw = await this.db.execute(sql`
      WITH valid_scope AS (
        SELECT 1
        FROM ${organizationsReferenceTable}
        WHERE id = ${scope.organizationId}
          AND tenant_id = ${scope.tenantId}
      )
      SELECT
        EXISTS (SELECT 1 FROM valid_scope) AS "validScope",
        s.id,
        s.category,
        s.tenant_id AS "tenantId",
        s.organization_id AS "organizationId",
        s.enabled,
        s.retention_days AS "retentionDays",
        s.sample_rate AS "sampleRate",
        s.capture_input_on_success AS "captureInputOnSuccess",
        s.updated_by_user_id AS "updatedByUserId",
        s.updated_at AS "updatedAt"
      FROM (SELECT 1) singleton
      LEFT JOIN ${auditLogSettingsTable} s
        ON EXISTS (SELECT 1 FROM valid_scope)
       AND (
         (
           s.ownership_state = 'canonical_organization'
           AND s.organization_id = ${scope.organizationId}
         )
         OR s.ownership_state = 'intentional_global'
       )
      ORDER BY s.category, (s.organization_id IS NULL) ASC
    `);

    const rows = normalizeRawRows<{
      validScope: boolean;
      id: string | null;
      category: AuditCategory | null;
      tenantId: string | null;
      organizationId: string | null;
      enabled: boolean | null;
      retentionDays: number | null;
      sampleRate: number | null;
      captureInputOnSuccess: boolean | null;
      updatedByUserId: string | null;
      updatedAt: Date | string | null;
    }>(raw);

    if (rows[0]?.validScope !== true) {
      return [];
    }

    const storedRows = rows.filter(
      (
        row,
      ): row is typeof row & {
        id: string;
        category: AuditCategory;
        enabled: boolean;
        retentionDays: number;
        captureInputOnSuccess: boolean;
        updatedAt: Date | string;
      } =>
        row.id !== null &&
        row.category !== null &&
        row.enabled !== null &&
        row.retentionDays !== null &&
        row.captureInputOnSuccess !== null &&
        row.updatedAt !== null,
    );

    const organizationByCategory = new Map(
      storedRows
        .filter((row) => row.organizationId === scope.organizationId)
        .map((row) => [row.category, row]),
    );

    const globalByCategory = new Map(
      storedRows
        .filter((row) => row.organizationId === null)
        .map((row) => [row.category, row]),
    );

    return AUDIT_CATEGORIES.map((category) => {
      const organizationRow = organizationByCategory.get(category);
      if (organizationRow) {
        return toRawStoredDto(organizationRow, 'tenant-override');
      }

      const globalRow = globalByCategory.get(category);
      if (globalRow) {
        return toRawStoredDto(globalRow, 'global');
      }

      // tenantId remains a rollback/compatibility DTO field only.
      return toDefaultDto(category, scope.organizationId);
    });
  }

  /**
   * OZI-71 AUD·D canonical settings UPSERT.
   *
   * The scope is the sole ownership authority. `tenant_id` remains a
   * rollback-compatible shadow write:
   * - organization -> stable internal organization id
   * - platform-global -> NULL
   *
   * Conflict inference deliberately targets the applicable semantic partial
   * unique, never the retained legacy UNIQUE(category, tenant_id).
   */
  async upsertCanonical(
    input: CanonicalUpsertAuditSettingInput,
    scope: AuditLogSettingsAdminScope,
  ): Promise<AuditSettingDto> {
    assertValidRetentionDays(input.retentionDays);
    assertValidSampleRate(input.sampleRate);

    try {
      if (scope.kind === 'platform-global') {
        return await this.upsertPlatformGlobalCanonical(input);
      }

      return await this.upsertOrganizationCanonical(input, scope);
    } catch (error) {
      // The two semantic partial uniques are handled by ON CONFLICT.
      // A remaining 23505 is therefore typically the retained legacy
      // UNIQUE(category, tenant_id) shadow collision. Preserve that row and
      // fail closed until its compatibility disposition is explicit.
      if (isUniqueViolation(error)) {
        throw new AuditSettingAliasConflictError();
      }

      throw error;
    }
  }

  private async upsertPlatformGlobalCanonical(
    input: CanonicalUpsertAuditSettingInput,
  ): Promise<AuditSettingDto> {
    const sampleRate = input.sampleRate ?? null;

    const raw = await this.db.execute(sql`
      INSERT INTO ${auditLogSettingsTable}
        (
          category,
          tenant_id,
          organization_id,
          ownership_state,
          enabled,
          retention_days,
          sample_rate,
          capture_input_on_success,
          updated_by_user_id
        )
      VALUES
        (
          ${input.category},
          NULL,
          NULL,
          'intentional_global',
          ${input.enabled},
          ${input.retentionDays},
          ${sampleRate},
          ${input.captureInputOnSuccess},
          ${input.updatedByUserId}
        )
      ON CONFLICT (category)
        WHERE ownership_state = 'intentional_global'
      DO UPDATE SET
        tenant_id = NULL,
        organization_id = NULL,
        ownership_state = 'intentional_global',
        enabled = EXCLUDED.enabled,
        retention_days = EXCLUDED.retention_days,
        sample_rate = EXCLUDED.sample_rate,
        capture_input_on_success = EXCLUDED.capture_input_on_success,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
      RETURNING
        id,
        category,
        tenant_id AS "tenantId",
        enabled,
        retention_days AS "retentionDays",
        sample_rate AS "sampleRate",
        capture_input_on_success AS "captureInputOnSuccess",
        updated_by_user_id AS "updatedByUserId",
        updated_at AS "updatedAt"
    `);

    const row = normalizeRawRows<RawSettingRow>(raw)[0];

    if (!row) {
      throw new AuditCanonicalWriteInvariantError();
    }

    return toRawStoredDto(row, 'global');
  }

  private async upsertOrganizationCanonical(
    input: CanonicalUpsertAuditSettingInput,
    scope: Extract<AuditLogSettingsAdminScope, { kind: 'organization' }>,
  ): Promise<AuditSettingDto> {
    const sampleRate = input.sampleRate ?? null;

    const raw = await this.db.execute(sql`
      INSERT INTO ${auditLogSettingsTable}
        (
          category,
          tenant_id,
          organization_id,
          ownership_state,
          enabled,
          retention_days,
          sample_rate,
          capture_input_on_success,
          updated_by_user_id
        )
      SELECT
        ${input.category},
        o.id,
        o.id,
        'canonical_organization',
        ${input.enabled},
        ${input.retentionDays},
        ${sampleRate},
        ${input.captureInputOnSuccess},
        ${input.updatedByUserId}
      FROM ${organizationsReferenceTable} o
      WHERE o.id = ${scope.organizationId}
        AND o.tenant_id = ${scope.tenantId}
      ON CONFLICT (category, organization_id)
        WHERE organization_id IS NOT NULL
          AND ownership_state = 'canonical_organization'
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        enabled = EXCLUDED.enabled,
        retention_days = EXCLUDED.retention_days,
        sample_rate = EXCLUDED.sample_rate,
        capture_input_on_success = EXCLUDED.capture_input_on_success,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
      RETURNING
        id,
        category,
        tenant_id AS "tenantId",
        enabled,
        retention_days AS "retentionDays",
        sample_rate AS "sampleRate",
        capture_input_on_success AS "captureInputOnSuccess",
        updated_by_user_id AS "updatedByUserId",
        updated_at AS "updatedAt"
    `);

    const row = normalizeRawRows<RawSettingRow>(raw)[0];

    if (!row) {
      // INSERT ... SELECT produced no candidate because the complete
      // organization -> tenant tuple could not be proven. Never retry as
      // global and never fall through to a legacy identifier.
      throw new AuditCanonicalWriteInvariantError();
    }

    return toRawStoredDto(row, 'tenant-override');
  }

  /**
   * OZI-71 AUD·D canonical reset.
   *
   * No unresolved/quarantined/legacy alias fallback exists here. The row must
   * already belong to the exact canonical organization or be explicitly
   * intentional-global.
   */
  async resetCanonical(
    category: AuditCategory,
    scope: AuditLogSettingsAdminScope,
  ): Promise<void> {
    if (scope.kind === 'platform-global') {
      const deleted = await this.db.execute(sql`
        DELETE FROM ${auditLogSettingsTable}
        WHERE category = ${category}
          AND ownership_state = 'intentional_global'
        RETURNING id
      `);

      if (normalizeRawRows<{ id: string }>(deleted).length !== 1) {
        throw new AuditSettingNotFoundError();
      }

      return;
    }

    const deleted = await this.db.execute(sql`
      DELETE FROM ${auditLogSettingsTable}
      WHERE category = ${category}
        AND ownership_state = 'canonical_organization'
        AND organization_id = ${scope.organizationId}
        AND EXISTS (
          SELECT 1
          FROM ${organizationsReferenceTable}
          WHERE id = ${scope.organizationId}
            AND tenant_id = ${scope.tenantId}
        )
      RETURNING id
    `);

    if (normalizeRawRows<{ id: string }>(deleted).length === 1) {
      return;
    }

    // Distinguish a valid scope with no override from a broken canonical
    // tuple. The DELETE itself already contained the same-statement tuple
    // proof; this secondary read only selects the correct fail-closed error.
    const validScopeRaw = await this.db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM ${organizationsReferenceTable}
        WHERE id = ${scope.organizationId}
          AND tenant_id = ${scope.tenantId}
      ) AS valid
    `);

    const validScope = normalizeRawRows<{ valid: boolean }>(validScopeRaw)[0];

    if (validScope?.valid !== true) {
      throw new AuditCanonicalWriteInvariantError();
    }

    throw new AuditSettingNotFoundError();
  }
}
