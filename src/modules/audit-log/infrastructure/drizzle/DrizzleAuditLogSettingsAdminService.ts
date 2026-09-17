import { eq, isNull, or, sql } from 'drizzle-orm';

import type { AuditWriteScope } from '@/core/contracts/audit-log';
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

type OrganizationAuditWriteScope = Extract<
  AuditWriteScope,
  { kind: 'organization' }
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
    writeScope: AuditWriteScope,
  ): Promise<AuditSettingDto> {
    assertScopeAllows(input.tenantId, scope);
    assertValidRetentionDays(input.retentionDays);
    assertValidSampleRate(input.sampleRate);

    const sampleRate = input.sampleRate ?? null;

    // During AUD·B legacy `tenant_id` still drives effective-settings reads,
    // so its scoped/global meaning must agree with the canonical write scope.
    // The concrete identifiers deliberately need not be equal.
    const legacyIsGlobal = input.tenantId === null;
    const canonicalIsGlobal = writeScope.kind === 'platform-global';
    if (legacyIsGlobal !== canonicalIsGlobal) {
      throw new AuditCanonicalWriteInvariantError();
    }

    if (writeScope.kind === 'platform-global') {
      const [row] = await this.db
        .insert(auditLogSettingsTable)
        .values({
          category: input.category,
          tenantId: null,
          organizationId: null,
          ownershipState: 'intentional_global',
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
            organizationId: null,
            ownershipState: 'intentional_global',
            enabled: input.enabled,
            retentionDays: input.retentionDays,
            sampleRate,
            captureInputOnSuccess: input.captureInputOnSuccess,
            updatedByUserId: input.updatedByUserId,
            updatedAt: new Date(),
          },
          setWhere: or(
            eq(auditLogSettingsTable.ownershipState, 'intentional_global'),
            eq(auditLogSettingsTable.ownershipState, 'unresolved_legacy'),
          ),
        })
        .returning();

      if (!row) {
        throw new AuditSettingAliasConflictError();
      }

      return toStoredDto(row, 'global');
    }

    return this.runInTransaction((db) =>
      this.upsertOrganizationSetting(db, input, writeScope, sampleRate),
    );
  }

  /**
   * Deletes the requested override and reverts effective resolution to the
   * global row or taxonomy default.
   *
   * AUD·B organization deletes use canonical ownership, not a raw provider
   * alias. The raw compatibility key is retained only to locate a pre-AUD·B
   * legacy row when no canonical row exists yet.
   */
  async resetToDefault(
    category: AuditCategory,
    tenantId: string | null,
    scope: MutationScope,
    writeScope: AuditWriteScope,
  ): Promise<void> {
    assertScopeAllows(tenantId, scope);

    const legacyIsGlobal = tenantId === null;
    const canonicalIsGlobal = writeScope.kind === 'platform-global';

    if (legacyIsGlobal !== canonicalIsGlobal) {
      throw new AuditCanonicalWriteInvariantError();
    }

    if (writeScope.kind === 'platform-global') {
      return this.runInTransaction((db) =>
        this.resetGlobalToDefault(db, category),
      );
    }

    if (tenantId === null) {
      throw new AuditCanonicalWriteInvariantError();
    }

    return this.runInTransaction((db) =>
      this.resetOrganizationToDefault(db, category, tenantId, writeScope),
    );
  }

  private async runInTransaction<T>(
    fn: (db: DrizzleDb) => Promise<T>,
  ): Promise<T> {
    return (
      this.db as unknown as {
        transaction: (fn: (db: DrizzleDb) => Promise<T>) => Promise<T>;
      }
    ).transaction(fn);
  }

  private async resetGlobalToDefault(
    db: DrizzleDb,
    category: AuditCategory,
  ): Promise<void> {
    const raw = await db.execute(sql`
      SELECT
        id,
        ownership_state AS "ownershipState"
      FROM ${auditLogSettingsTable}
      WHERE category = ${category}
        AND tenant_id IS NULL
      FOR UPDATE
    `);

    const row = normalizeRawRows<{
      id: string;
      ownershipState: string;
    }>(raw)[0];

    if (!row) {
      throw new AuditSettingNotFoundError();
    }

    if (
      row.ownershipState !== 'intentional_global' &&
      row.ownershipState !== 'unresolved_legacy'
    ) {
      throw new AuditSettingAliasConflictError();
    }

    const deletedRaw = await db.execute(sql`
      DELETE FROM ${auditLogSettingsTable}
      WHERE id = ${row.id}
      RETURNING id
    `);

    if (normalizeRawRows<{ id: string }>(deletedRaw).length !== 1) {
      throw new AuditCanonicalWriteInvariantError();
    }
  }

  private async upsertOrganizationSetting(
    db: DrizzleDb,
    input: UpsertAuditSettingInput,
    writeScope: OrganizationAuditWriteScope,
    sampleRate: number | null,
  ): Promise<AuditSettingDto> {
    const lockedOrganizationRaw = await db.execute(sql`
      SELECT o.id
      FROM ${organizationsReferenceTable} o
      WHERE o.id = ${writeScope.organizationId}
        AND o.tenant_id = ${writeScope.tenantId}
      FOR UPDATE
    `);

    const lockedOrganization = normalizeRawRows<{ id: string }>(
      lockedOrganizationRaw,
    )[0];

    if (!lockedOrganization) {
      throw new AuditCanonicalWriteInvariantError();
    }

    const stableLegacyTenantId = writeScope.organizationId;

    const existingCanonicalRaw = await db.execute(sql`
      SELECT id
      FROM ${auditLogSettingsTable}
      WHERE category = ${input.category}
        AND organization_id = ${writeScope.organizationId}
        AND ownership_state = 'canonical_organization'
      FOR UPDATE
    `);

    const existingCanonical = normalizeRawRows<{ id: string }>(
      existingCanonicalRaw,
    )[0];

    if (existingCanonical) {
      return this.updateExistingOrganizationSetting(
        db,
        input,
        existingCanonical.id,
        stableLegacyTenantId,
        sampleRate,
      );
    }

    const raw = await db.execute(sql`
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
        ${stableLegacyTenantId},
        o.id,
        'canonical_organization',
        ${input.enabled},
        ${input.retentionDays},
        ${sampleRate},
        ${input.captureInputOnSuccess},
        ${input.updatedByUserId}
      FROM ${organizationsReferenceTable} o
      WHERE o.id = ${writeScope.organizationId}
        AND o.tenant_id = ${writeScope.tenantId}
      ON CONFLICT (category, tenant_id)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        ownership_state = EXCLUDED.ownership_state,
        enabled = EXCLUDED.enabled,
        retention_days = EXCLUDED.retention_days,
        sample_rate = EXCLUDED.sample_rate,
        capture_input_on_success = EXCLUDED.capture_input_on_success,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now()
      WHERE "audit_log_settings"."ownership_state" = 'unresolved_legacy'
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
      throw new AuditSettingAliasConflictError();
    }

    return toRawStoredDto(row, 'tenant-override');
  }

  private async updateExistingOrganizationSetting(
    db: DrizzleDb,
    input: UpsertAuditSettingInput,
    existingCanonicalId: string,
    stableLegacyTenantId: string,
    sampleRate: number | null,
  ): Promise<AuditSettingDto> {
    const conflictingAliasRaw = await db.execute(sql`
      SELECT id
      FROM ${auditLogSettingsTable}
      WHERE category = ${input.category}
        AND tenant_id = ${stableLegacyTenantId}
        AND id <> ${existingCanonicalId}
      FOR UPDATE
    `);

    if (normalizeRawRows<{ id: string }>(conflictingAliasRaw).length !== 0) {
      throw new AuditSettingAliasConflictError();
    }

    const canonicalRaw = await db.execute(sql`
      UPDATE ${auditLogSettingsTable}
      SET
        tenant_id = ${stableLegacyTenantId},
        enabled = ${input.enabled},
        retention_days = ${input.retentionDays},
        sample_rate = ${sampleRate},
        capture_input_on_success = ${input.captureInputOnSuccess},
        updated_by_user_id = ${input.updatedByUserId},
        updated_at = now()
      WHERE id = ${existingCanonicalId}
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

    const canonicalRow = normalizeRawRows<RawSettingRow>(canonicalRaw)[0];

    if (!canonicalRow) {
      throw new AuditCanonicalWriteInvariantError();
    }

    return toRawStoredDto(canonicalRow, 'tenant-override');
  }

  private async resetOrganizationToDefault(
    db: DrizzleDb,
    category: AuditCategory,
    requestedLegacyTenantId: string,
    writeScope: OrganizationAuditWriteScope,
  ): Promise<void> {
    const lockedOrganizationRaw = await db.execute(sql`
      SELECT o.id
      FROM ${organizationsReferenceTable} o
      WHERE o.id = ${writeScope.organizationId}
        AND o.tenant_id = ${writeScope.tenantId}
      FOR UPDATE
    `);

    const lockedOrganization = normalizeRawRows<{ id: string }>(
      lockedOrganizationRaw,
    )[0];

    if (!lockedOrganization) {
      throw new AuditCanonicalWriteInvariantError();
    }

    const stableLegacyTenantId = writeScope.organizationId;

    const canonicalRaw = await db.execute(sql`
      SELECT id
      FROM ${auditLogSettingsTable}
      WHERE category = ${category}
        AND organization_id = ${writeScope.organizationId}
        AND ownership_state = 'canonical_organization'
      FOR UPDATE
    `);

    const canonicalRow = normalizeRawRows<{ id: string }>(canonicalRaw)[0];

    if (canonicalRow) {
      const collisionRaw = await db.execute(sql`
        SELECT id
        FROM ${auditLogSettingsTable}
        WHERE category = ${category}
          AND id <> ${canonicalRow.id}
          AND (
            tenant_id = ${requestedLegacyTenantId}
            OR tenant_id = ${stableLegacyTenantId}
          )
        FOR UPDATE
      `);

      if (normalizeRawRows<{ id: string }>(collisionRaw).length !== 0) {
        throw new AuditSettingAliasConflictError();
      }

      const deletedRaw = await db.execute(sql`
        DELETE FROM ${auditLogSettingsTable}
        WHERE id = ${canonicalRow.id}
        RETURNING id
      `);

      if (normalizeRawRows<{ id: string }>(deletedRaw).length !== 1) {
        throw new AuditCanonicalWriteInvariantError();
      }

      return;
    }

    // Compatibility fallback for a pre-AUD·B setting that has not yet been
    // classified/backfilled. Canonical resolution above proves that the raw
    // provider alias and the stable UUID refer to the requested organization.
    const legacyRaw = await db.execute(sql`
      SELECT
        id,
        ownership_state AS "ownershipState"
      FROM ${auditLogSettingsTable}
      WHERE category = ${category}
        AND organization_id IS NULL
        AND (
          tenant_id = ${requestedLegacyTenantId}
          OR tenant_id = ${stableLegacyTenantId}
        )
      FOR UPDATE
    `);

    const legacyRows = normalizeRawRows<{
      id: string;
      ownershipState: string;
    }>(legacyRaw);

    if (legacyRows.length === 0) {
      throw new AuditSettingNotFoundError();
    }

    if (
      legacyRows.length > 1 ||
      legacyRows.some((row) => row.ownershipState !== 'unresolved_legacy')
    ) {
      throw new AuditSettingAliasConflictError();
    }

    const deletedRaw = await db.execute(sql`
      DELETE FROM ${auditLogSettingsTable}
      WHERE id = ${legacyRows[0].id}
      RETURNING id
    `);

    if (normalizeRawRows<{ id: string }>(deletedRaw).length !== 1) {
      throw new AuditCanonicalWriteInvariantError();
    }
  }
}
