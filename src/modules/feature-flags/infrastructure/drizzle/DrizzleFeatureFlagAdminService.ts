import { and, eq, isNull, or, sql } from 'drizzle-orm';

import type { OrganizationId, TenantId } from '@/core/contracts/canonical-ids';
import type { DrizzleDb } from '@/core/db';
import { organizationsReferenceTable } from '@/core/db/schema/references';

import {
  DuplicateFeatureFlagError,
  FeatureFlagCanonicalWriteInvariantError,
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

/**
 * OZI-71 FF·B — the canonical ownership facts a create must persist ALONGSIDE
 * the legacy `tenant_id` (which is still written verbatim from
 * {@link CreateFeatureFlagInput.tenantId} and stays authoritative for every
 * read until FF·D).
 *
 * - `organization` — an authoritatively-resolved organization override. BOTH
 *   ids are load-bearing: the INSERT proves
 *   `organizations.id = organizationId AND organizations.tenant_id = tenantId`
 *   in the same statement (invariant #11), so a server-derived tuple that is
 *   internally inconsistent, or whose organization was deleted/reparented
 *   between resolution and write, inserts zero rows and fails closed.
 * - `global` — an explicitly platform-global create: `organization_id = NULL`,
 *   `ownership_state = 'intentional_global'`. Never the fallback for a failed
 *   organization resolution.
 *
 * Branded ids: the crossing from raw string happens upstream through the
 * audited provenance constructors (`@/core/contracts/canonical-ids.provenance`)
 * in the composition seam — this type only carries the already-branded result
 * so the two ids can never be passed in the wrong order (invariant #9).
 */
export type CanonicalFeatureFlagWriteFacts =
  | {
      readonly kind: 'organization';
      readonly organizationId: OrganizationId;
      readonly tenantId: TenantId;
    }
  | { readonly kind: 'global' };

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

  /**
   * OZI-71 FF·B — canonical dual-write. `input.tenantId` is still written to
   * `feature_flags.tenant_id` VERBATIM (legacy authoritative read key,
   * unchanged rollback semantics — never normalized to the canonical id);
   * `canonical` additionally populates `organization_id` + `ownership_state`.
   * Reads are untouched and still legacy until FF·D.
   */
  async create(
    input: CreateFeatureFlagInput,
    canonical: CanonicalFeatureFlagWriteFacts,
  ): Promise<FeatureFlagDto> {
    // Defense in depth for the canonical `ownership_state` invariant: this
    // service protects its own migration-period contract rather than trusting
    // the one route caller. Until FF·D every read still uses the LEGACY
    // `tenant_id` contract, where `tenant_id IS NULL` == platform-global. So
    // the legacy scoped/global classification and the canonical
    // organization/global classification MUST agree, symmetrically:
    //
    //   canonical organization + tenant_id NON-NULL -> OK (the non-null legacy
    //     key is preserved VERBATIM and may be a legacy org id / tenant id /
    //     provider external id -- FF·B proves canonical ownership separately;
    //     this guard never requires the two identities to be equal);
    //   canonical global       + tenant_id NULL     -> OK;
    //   canonical organization + tenant_id NULL     -> contradiction (a row
    //     that legacy reads treat as global but canonical treats as org-only);
    //   canonical global       + tenant_id NON-NULL -> contradiction.
    //
    // Fail closed: never normalize the legacy key, never reclassify ownership.
    const legacyIsGlobal = input.tenantId === null;
    const canonicalIsGlobal = canonical.kind === 'global';
    if (legacyIsGlobal !== canonicalIsGlobal) {
      throw new FeatureFlagCanonicalWriteInvariantError();
    }

    try {
      return canonical.kind === 'organization'
        ? await this.createOrganizationOwned(input, canonical)
        : await this.createIntentionalGlobal(input);
    } catch (error) {
      // Relying on the DB's own unique constraints (rather than a preliminary
      // select-then-insert check) keeps duplicate detection atomic under
      // concurrent creates -- both the legacy `uq_feature_flags_key_tenant`
      // and the FF·A canonical `uq_feature_flags_key_organization_canonical`
      // partial unique surface here as `23505` (the latter catches an
      // alias/collision where two legacy identities resolve to the same
      // canonical organization for one key).
      if (isUniqueViolation(error)) {
        throw new DuplicateFeatureFlagError();
      }

      throw error;
    }
  }

  private async createIntentionalGlobal(
    input: CreateFeatureFlagInput,
  ): Promise<FeatureFlagDto> {
    const [row] = await this.db
      .insert(featureFlagsTable)
      .values({
        key: input.key,
        tenantId: input.tenantId,
        organizationId: null,
        ownershipState: 'intentional_global',
        enabled: input.enabled,
        description: input.description ?? null,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create feature flag');
    }

    return mapFlagRow(row);
  }

  /**
   * The same-statement `(organization_id, tenant_id)` tuple proof (invariant
   * #11): `organization_id` is taken from the joined `organizations` row
   * itself (`o.id`), never the parameter, and the row is selected ONLY when
   * `o.id` AND `o.tenant_id` both match the resolved canonical tuple. A
   * mismatch / deleted / reparented organization yields zero inserted rows ->
   * {@link FeatureFlagCanonicalWriteInvariantError} (fail closed; no
   * `organization_id = NULL` row, no `intentional_global` reclassification).
   * Uses the neutral `organizationsReferenceTable` (never `authorization`'s
   * real schema), so the feature-flags module gains no cross-module edge.
   */
  private async createOrganizationOwned(
    input: CreateFeatureFlagInput,
    canonical: Extract<
      CanonicalFeatureFlagWriteFacts,
      { kind: 'organization' }
    >,
  ): Promise<FeatureFlagDto> {
    const inserted = await this.db.execute(sql`
      INSERT INTO ${featureFlagsTable}
        (key, tenant_id, organization_id, ownership_state, enabled, description)
      SELECT
        ${input.key},
        ${input.tenantId},
        o.id,
        'canonical_organization',
        ${input.enabled},
        ${input.description ?? null}
      FROM ${organizationsReferenceTable} o
      WHERE o.id = ${canonical.organizationId}
        AND o.tenant_id = ${canonical.tenantId}
      RETURNING
        id,
        key,
        tenant_id AS "tenantId",
        enabled,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `);

    const rows = (
      Array.isArray(inserted)
        ? inserted
        : (inserted as { rows?: unknown[] }).rows
    ) as
      | Array<{
          id: string;
          key: string;
          tenantId: string | null;
          enabled: boolean;
          description: string | null;
          createdAt: Date | string;
          updatedAt: Date | string;
        }>
      | undefined;

    const row = rows?.[0];
    if (!row) {
      // Zero rows from the tuple proof: the resolved organization no longer
      // exists / was reparented / the server-derived tuple is inconsistent.
      throw new FeatureFlagCanonicalWriteInvariantError();
    }

    return mapFlagRow({
      id: row.id,
      key: row.key,
      tenantId: row.tenantId,
      enabled: row.enabled,
      description: row.description,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    });
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

  async delete(id: string, scope: MutationScope): Promise<FeatureFlagDto> {
    const [row] = await this.db
      .delete(featureFlagsTable)
      .where(scopePredicate(id, scope))
      .returning();

    if (!row) {
      throw new FeatureFlagNotFoundError();
    }

    return mapFlagRow(row);
  }
}
