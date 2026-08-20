import { and, eq, isNull, or } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';

import {
  DuplicateFeatureFlagError,
  FeatureFlagNotFoundError,
} from '../../domain/errors';

import { featureFlagsTable } from './schema';

export type FeatureFlagDto = {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateFeatureFlagInput = {
  key: string;
  tenantId: string | null;
  enabled: boolean;
  description?: string | null;
};

export type UpdateFeatureFlagInput = {
  enabled?: boolean;
  description?: string | null;
};

/**
 * The tenant scope a caller is authorized to mutate within.
 *
 * `null` means "no additional scope restriction" and must only be passed for
 * an unscoped platform admin (`isEnvBasedPlatformAdmin`). An ABAC-authorized
 * caller (ordinary tenant owner) must always pass `{ tenantId }` so mutations
 * are constrained to their own tenant's rows -- never global (`tenantId:
 * null`) rows and never another tenant's rows. See SEC-26 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
export type MutationScope = { tenantId: string } | null;

function mapFlagRow(row: {
  id: string;
  key: string;
  tenantId: string | null;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FeatureFlagDto {
  return {
    id: row.id,
    key: row.key,
    tenantId: row.tenantId,
    enabled: row.enabled,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
  if (!(error instanceof Error)) {
    return false;
  }

  if (
    error.message.includes('unique constraint') ||
    hasUniqueViolationCode(error)
  ) {
    return true;
  }

  // Drizzle wraps the driver's raw Postgres error in `DrizzleQueryError`; the
  // top-level error's own `message` is a generic "Failed query: ..." and it
  // carries no `code`. The actual `23505` unique-violation code and message
  // live on `.cause` (confirmed against PGlite; node-postgres wraps the same
  // way). Checking only the top-level error, as similar helpers elsewhere in
  // this repo do, misses this entirely.
  const cause =
    'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  if (cause instanceof Error) {
    return (
      cause.message.includes('unique constraint') ||
      hasUniqueViolationCode(cause)
    );
  }

  return false;
}

function scopePredicate(id: string, scope: MutationScope) {
  const idPredicate = eq(featureFlagsTable.id, id);

  if (scope === null) {
    return idPredicate;
  }

  // Deliberately `eq`, not `tenantScopePredicate`'s null-aware form: an
  // ABAC-authorized (non-platform-admin) caller may mutate only rows that
  // belong to their own tenant, never global (`tenantId: null`) rows.
  return and(idPredicate, eq(featureFlagsTable.tenantId, scope.tenantId));
}

/**
 * Admin-only CRUD service for `feature_flags` rows.
 *
 * Deliberately NOT an implementation of `FeatureFlagService` (the runtime
 * evaluation contract) and NOT registered in the DI container. Admin CRUD
 * only makes sense against the `db` provider, is operator-only, low-frequency,
 * and directly instantiated at the route-handler call site -- mirrors
 * `DrizzleAdminOrganizationsMutationService`, not `UserRepository`. See
 * `.copilot/tasks/2026-08-20-admin-feature-flags-gui/01 - Architecture Guard - Summary.md`.
 *
 * Every mutation method takes a `MutationScope`: callers authorized only via
 * ABAC (not an unscoped platform admin) must pass their own `tenantId` so the
 * DB predicate itself enforces tenant isolation, rather than trusting that
 * the caller already validated the target row's ownership. See SEC-26.
 */
export class DrizzleFeatureFlagAdminService {
  constructor(private readonly db: DrizzleDb) {}

  /** Full, unscoped list. Only for an unscoped platform admin. */
  async listAll(): Promise<FeatureFlagDto[]> {
    const rows = await this.db
      .select()
      .from(featureFlagsTable)
      .orderBy(featureFlagsTable.key, featureFlagsTable.tenantId);

    return rows.map(mapFlagRow);
  }

  /**
   * Global (`tenantId: null`) rows plus the given tenant's own rows.
   * For an ABAC-authorized (non-platform-admin) caller -- never surfaces
   * another tenant's rows.
   */
  async listForTenant(tenantId: string): Promise<FeatureFlagDto[]> {
    const rows = await this.db
      .select()
      .from(featureFlagsTable)
      .where(
        or(
          isNull(featureFlagsTable.tenantId),
          eq(featureFlagsTable.tenantId, tenantId),
        ),
      )
      .orderBy(featureFlagsTable.key, featureFlagsTable.tenantId);

    return rows.map(mapFlagRow);
  }

  async create(input: CreateFeatureFlagInput): Promise<FeatureFlagDto> {
    try {
      const [row] = await this.db
        .insert(featureFlagsTable)
        .values({
          key: input.key,
          tenantId: input.tenantId,
          enabled: input.enabled,
          description: input.description ?? null,
        })
        .returning();

      if (!row) {
        throw new Error('Failed to create feature flag');
      }

      return mapFlagRow(row);
    } catch (error) {
      // Relying on the DB's own `uq_feature_flags_key_tenant` unique
      // constraint (rather than a preliminary select-then-insert check)
      // keeps duplicate detection atomic under concurrent creates for the
      // same (key, tenantId) pair.
      if (isUniqueViolation(error)) {
        throw new DuplicateFeatureFlagError();
      }

      throw error;
    }
  }

  async update(
    id: string,
    input: UpdateFeatureFlagInput,
    scope: MutationScope,
  ): Promise<FeatureFlagDto> {
    const [row] = await this.db
      .update(featureFlagsTable)
      .set({
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        updatedAt: new Date(),
      })
      .where(scopePredicate(id, scope))
      .returning();

    if (!row) {
      throw new FeatureFlagNotFoundError();
    }

    return mapFlagRow(row);
  }

  async delete(id: string, scope: MutationScope): Promise<void> {
    const deleted = await this.db
      .delete(featureFlagsTable)
      .where(scopePredicate(id, scope))
      .returning();

    if (deleted.length === 0) {
      throw new FeatureFlagNotFoundError();
    }
  }
}
