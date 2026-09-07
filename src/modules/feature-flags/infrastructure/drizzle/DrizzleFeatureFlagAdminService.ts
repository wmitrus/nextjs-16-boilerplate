import { and, count, eq, sql, type SQL } from 'drizzle-orm';

import type { DataScope } from '@/core/contracts/access-context';
import type { OrganizationId, TenantId } from '@/core/contracts/canonical-ids';
import type { DrizzleDb } from '@/core/db';
import { organizationsReferenceTable } from '@/core/db/schema/references';

import {
  DuplicateFeatureFlagError,
  FeatureFlagCanonicalWriteInvariantError,
  FeatureFlagNotFoundError,
} from '../../domain/errors';

import { featureFlagsTable } from './schema';

/**
 * OZI-71 FF·D — the canonical scope LIST/UPDATE/DELETE operate under.
 * Structurally identical to (never imported from)
 * `src/app/api/admin/feature-flags/feature-flags-admin-scope.ts`'s
 * `FeatureFlagsDataScope` -- this module stays `modules -> core` only; the
 * composition layer (`src/app`) is the one place both this type and the
 * concrete scope-derivation seam are wired together.
 */
export type FeatureFlagAdminScope = Extract<
  DataScope,
  { kind: 'organization' | 'platform-global' }
>;

export type FeatureFlagDto = {
  id: string;
  key: string;
  tenantId: string | null;
  organizationId: string | null;
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
 * OZI-71 FF·B (rollback/compatibility history) — the canonical ownership
 * facts a create must persist ALONGSIDE the legacy `tenant_id` (still
 * written verbatim from {@link CreateFeatureFlagInput.tenantId} — a rollback
 * shadow value and the Audit subsystem's own legacy compatibility key, no
 * longer read for canonical Feature Flag authorization since FF·D).
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

/** Mirrors `AuditEventPagination` (`DrizzleAuditLogReadService.ts`) — the
 * repository's established admin-list pagination shape. Bounds are enforced
 * by the route's zod schema, not here; this type only carries already-valid
 * numbers. */
export type FeatureFlagAdminPagination = {
  readonly limit: number;
  readonly offset: number;
};

function mapFlagRow(row: {
  id: string;
  key: string;
  tenantId: string | null;
  organizationId: string | null;
  enabled: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FeatureFlagDto {
  return {
    id: row.id,
    key: row.key,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    enabled: row.enabled,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Normalize a raw `db.execute` result to its row array (driver-shape safe). */
function normalizeRawRows<T>(raw: unknown): T[] {
  return (
    Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])
  ) as T[];
}

interface RawFlagRow {
  id: string;
  key: string;
  tenantId: string | null;
  organizationId: string | null;
  enabled: boolean;
  description: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function mapRawFlagRow(row: RawFlagRow): FeatureFlagDto {
  return mapFlagRow({
    id: row.id,
    key: row.key,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    enabled: row.enabled,
    description: row.description,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });
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

/**
 * OZI-71 FF·D — the same-statement mutation predicate. For `organization`
 * scope the row must ALREADY be `canonical_organization` owned by exactly
 * `scope.organizationId`, AND the parent tuple
 * (`organizations.id = scope.organizationId AND organizations.tenant_id =
 * scope.tenantId`) is re-proven via an `EXISTS` subquery IN THE SAME
 * statement (SEC-26) -- never a separate preceding SELECT. A sibling
 * organization, a mismatched tenant, or a foreign row id all fail the
 * conjunction and affect zero rows. For `platform-global` scope the row must
 * already be `intentional_global`; a `canonical_organization` row can never
 * match this branch. Neither branch reads `tenant_id`.
 */
function scopePredicate(id: string, scope: FeatureFlagAdminScope) {
  const idPredicate = eq(featureFlagsTable.id, id);

  if (scope.kind === 'platform-global') {
    return and(
      idPredicate,
      eq(featureFlagsTable.ownershipState, 'intentional_global'),
    );
  }

  return and(
    idPredicate,
    eq(featureFlagsTable.ownershipState, 'canonical_organization'),
    eq(featureFlagsTable.organizationId, scope.organizationId),
    sql`exists (
      select 1 from ${organizationsReferenceTable}
      where id = ${scope.organizationId} and tenant_id = ${scope.tenantId}
    )`,
  );
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
 * OZI-71 FF·D — `list`/`update`/`delete` take a canonical
 * {@link FeatureFlagAdminScope} (derived server-side by
 * `feature-flags-admin-scope.ts`), never a legacy tenant id: the DB predicate
 * itself enforces containment, rather than trusting that the caller already
 * validated the target row's ownership. See SEC-26.
 */
export class DrizzleFeatureFlagAdminService {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * `organization` scope — canonical rows for exactly `scope.organizationId`
   * plus `intentional_global` as a READ-ONLY overlay, excluding
   * `unresolved_legacy`/`quarantined`. The `(organizationId, tenantId)` tuple
   * is proven valid FIRST via `EXISTS`, gating the whole predicate: an
   * invalid tuple yields ZERO rows AND `total: 0` -- never a partial/
   * global-only fallback.
   *
   * `platform-global` scope — `intentional_global` rows ONLY. Deliberately
   * NOT the legacy `listAll()` unrestricted dump: a platform admin's
   * `platform-global` scope has a literal DB meaning here (unlike Admin
   * Users, where it stands in for "unrestricted"), so this never returns
   * ANY `canonical_organization` row — signed-off verdict, see
   * `feature-flags-admin-scope.ts`.
   *
   * Pagination mirrors `DrizzleAuditLogReadService.query()`: the row page
   * and the `total` count run against the EXACT SAME containment predicate
   * (one `SQL` fragment, reused in both statements below -- never two
   * hand-written copies that could drift), in parallel, ordered by
   * `(key, id)` for a stable, deterministic page boundary (a bare `key`
   * order is not unique -- a canonical row and an `intentional_global` row
   * can share one key).
   */
  async list(
    scope: FeatureFlagAdminScope,
    pagination: FeatureFlagAdminPagination,
  ): Promise<{ flags: FeatureFlagDto[]; total: number }> {
    if (scope.kind === 'platform-global') {
      const where = eq(featureFlagsTable.ownershipState, 'intentional_global');
      const [rows, totalRows] = await Promise.all([
        this.db
          .select()
          .from(featureFlagsTable)
          .where(where)
          .orderBy(featureFlagsTable.key, featureFlagsTable.id)
          .limit(pagination.limit)
          .offset(pagination.offset),
        this.db.select({ total: count() }).from(featureFlagsTable).where(where),
      ]);
      return {
        flags: rows.map(mapFlagRow),
        total: totalRows[0]?.total ?? 0,
      };
    }

    // The ONE containment predicate, embedded verbatim into both the row
    // page and the count query below -- proving the tuple valid, then
    // admitting exactly this organization's canonical rows plus the global
    // overlay.
    const containment: SQL = sql`
      EXISTS (
        SELECT 1 FROM ${organizationsReferenceTable}
        WHERE id = ${scope.organizationId} AND tenant_id = ${scope.tenantId}
      )
      AND (
        (
          ownership_state = 'canonical_organization'
          AND organization_id = ${scope.organizationId}
        )
        OR ownership_state = 'intentional_global'
      )
    `;

    const [raw, rawTotal] = await Promise.all([
      this.db.execute(sql`
        SELECT
          id,
          key,
          tenant_id AS "tenantId",
          organization_id AS "organizationId",
          enabled,
          description,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM ${featureFlagsTable}
        WHERE ${containment}
        ORDER BY key, id
        LIMIT ${pagination.limit} OFFSET ${pagination.offset}
      `),
      this.db.execute(sql`
        SELECT count(*)::int AS total
        FROM ${featureFlagsTable}
        WHERE ${containment}
      `),
    ]);

    const totalRow = normalizeRawRows<{ total: number }>(rawTotal)[0];
    return {
      flags: normalizeRawRows<RawFlagRow>(raw).map(mapRawFlagRow),
      total: totalRow?.total ?? 0,
    };
  }

  /**
   * OZI-71 FF·B (rollback/compatibility history) — canonical dual-write.
   * `input.tenantId` is still written to `feature_flags.tenant_id` VERBATIM
   * (never normalized to the canonical id): a rollback shadow value, kept
   * for the legacy-contract Audit subsystem and for a reverted deploy, not
   * for canonical Feature Flag reads. `canonical` additionally populates
   * `organization_id` + `ownership_state`, which is what FF·D's canonical
   * runtime and admin reads now use exclusively (`DrizzleFeatureFlagService.isEnabled`,
   * `list`/`update`/`delete` above) — `feature_flags.tenant_id` is not read
   * by any of them.
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
        organization_id AS "organizationId",
        enabled,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `);

    const row = normalizeRawRows<RawFlagRow>(inserted)[0];
    if (!row) {
      // Zero rows from the tuple proof: the resolved organization no longer
      // exists / was reparented / the server-derived tuple is inconsistent.
      throw new FeatureFlagCanonicalWriteInvariantError();
    }

    return mapRawFlagRow(row);
  }

  async update(
    id: string,
    input: UpdateFeatureFlagInput,
    scope: FeatureFlagAdminScope,
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

  async delete(
    id: string,
    scope: FeatureFlagAdminScope,
  ): Promise<FeatureFlagDto> {
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
