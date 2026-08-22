import { and, count, eq, exists, ilike, or, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db';
import { membershipsReferenceTable } from '@/core/db/schema/references';

import { usersTable } from './schema';

export type AdminUserDto = {
  id: string;
  email: string;
  onboardingComplete: boolean;
  displayName?: string;
  locale?: string;
  timezone?: string;
  deactivatedAt?: Date;
  createdAt: Date;
};

/**
 * The tenant scope a caller is authorized to operate within.
 *
 * `null` means "no additional scope restriction" and must only be passed for
 * an unscoped platform admin (`isEnvBasedPlatformAdmin`). An ABAC-authorized
 * caller (ordinary tenant/organization owner) must always pass `{ tenantId }`
 * so every read and mutation is constrained -- in the same SQL predicate as
 * the read/mutation itself, never as a separate check-then-act step -- to
 * users who hold a `memberships` row in that tenant's organization. Never
 * another tenant's users.
 *
 * `tenantId` here is the organization UUID: `TenantContext.tenantId` and
 * `TenantContext.organizationId` hold the same value (see
 * `src/core/contracts/tenancy.ts`), and `memberships.organizationId` is the
 * column that actually ties a user to that scope. See SEC-26 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
export type AdminUserScope = { tenantId: string } | null;

type UserRow = {
  id: string;
  email: string;
  onboardingComplete: boolean;
  displayName: string | null;
  locale: string | null;
  timezone: string | null;
  deactivatedAt: Date | null;
  createdAt: Date;
};

function mapUserRow(row: UserRow): AdminUserDto {
  return {
    id: row.id,
    email: row.email,
    onboardingComplete: row.onboardingComplete,
    displayName: row.displayName ?? undefined,
    locale: row.locale ?? undefined,
    timezone: row.timezone ?? undefined,
    deactivatedAt: row.deactivatedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

const USER_COLUMNS = {
  id: usersTable.id,
  email: usersTable.email,
  onboardingComplete: usersTable.onboardingComplete,
  displayName: usersTable.displayName,
  locale: usersTable.locale,
  timezone: usersTable.timezone,
  deactivatedAt: usersTable.deactivatedAt,
  createdAt: usersTable.createdAt,
} as const;

/**
 * `EXISTS (SELECT 1 FROM memberships WHERE memberships.user_id = users.id
 * AND memberships.organization_id = :tenantId)` -- a correlated subquery
 * against the cross-module `memberships` reference table, so tenant scoping
 * is enforced inside the very same SQL statement as the read/mutation
 * instead of a separate "check membership, then act on id" round trip
 * (TOCTOU).
 */
function membershipScopePredicate(db: DrizzleDb, tenantId: string) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(membershipsReferenceTable)
      .where(
        and(
          eq(membershipsReferenceTable.userId, usersTable.id),
          eq(membershipsReferenceTable.organizationId, tenantId),
        ),
      ),
  );
}

/**
 * Admin-only surface for `/api/admin/users`.
 *
 * Deliberately NOT `UserRepository` / `DrizzleUserRepository` -- that
 * DI-registered repository is used for self-service lookups (a user
 * reading or updating their own record by their own verified id), where no
 * additional tenant scoping is needed or correct, and stays untouched by
 * this class. This service is only for the admin panel's cross-user listing
 * and mutation surface, where the caller (unless an unscoped platform admin)
 * may only ever see or touch users who belong to their own tenant. Directly
 * instantiated at the route-handler call site, not registered in DI --
 * mirrors `DrizzleFeatureFlagAdminService`.
 *
 * Every method takes an `AdminUserScope`: callers authorized only via ABAC
 * (not an unscoped platform admin) must pass their own `tenantId` so the DB
 * predicate itself enforces tenant isolation, rather than trusting that the
 * caller already validated the target user's membership. This closed a
 * cross-tenant IDOR/BOLA: the previous implementation reused
 * `DrizzleUserRepository`'s global, unscoped queries for every admin caller
 * regardless of tenant.
 */
export class DrizzleAdminUsersService {
  constructor(private readonly db: DrizzleDb) {}

  async listAll(
    options: {
      readonly limit?: number;
      readonly offset?: number;
      readonly search?: string;
    },
    scope: AdminUserScope,
  ): Promise<{ users: AdminUserDto[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const search = options.search?.trim();

    const searchPredicate = search
      ? or(
          ilike(usersTable.email, `%${search}%`),
          ilike(usersTable.displayName, `%${search}%`),
        )
      : undefined;
    const scopePredicate =
      scope === null
        ? undefined
        : membershipScopePredicate(this.db, scope.tenantId);

    const whereClause =
      searchPredicate && scopePredicate
        ? and(searchPredicate, scopePredicate)
        : (searchPredicate ?? scopePredicate);

    const [rows, countRows] = await Promise.all([
      this.db
        .select(USER_COLUMNS)
        .from(usersTable)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(usersTable.createdAt),
      this.db.select({ total: count() }).from(usersTable).where(whereClause),
    ]);

    return {
      users: rows.map(mapUserRow),
      total: countRows[0]?.total ?? 0,
    };
  }

  async findById(
    id: string,
    scope: AdminUserScope,
  ): Promise<AdminUserDto | null> {
    const idPredicate = eq(usersTable.id, id);
    const whereClause =
      scope === null
        ? idPredicate
        : and(idPredicate, membershipScopePredicate(this.db, scope.tenantId));

    const rows = await this.db
      .select(USER_COLUMNS)
      .from(usersTable)
      .where(whereClause)
      .limit(1);

    const row = rows[0];
    return row ? mapUserRow(row) : null;
  }

  /**
   * Returns the updated row, or `null` when no row matched `id` within
   * `scope` -- either the id doesn't exist, or (for a tenant-scoped caller)
   * it names a real user outside the caller's tenant. Both cases must map to
   * the same 404 at the route layer to avoid leaking cross-tenant existence.
   */
  async updateProfile(
    id: string,
    profile: {
      readonly displayName?: string;
      readonly locale?: string;
      readonly timezone?: string;
    },
    scope: AdminUserScope,
  ): Promise<AdminUserDto | null> {
    const idPredicate = eq(usersTable.id, id);
    const whereClause =
      scope === null
        ? idPredicate
        : and(idPredicate, membershipScopePredicate(this.db, scope.tenantId));

    const updatePayload: {
      displayName?: string;
      locale?: string;
      timezone?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (profile.displayName !== undefined) {
      updatePayload.displayName = profile.displayName;
    }
    if (profile.locale !== undefined) {
      updatePayload.locale = profile.locale;
    }
    if (profile.timezone !== undefined) {
      updatePayload.timezone = profile.timezone;
    }

    const [row] = await this.db
      .update(usersTable)
      .set(updatePayload)
      .where(whereClause)
      .returning();

    return row ? mapUserRow(row) : null;
  }

  /** See `updateProfile` for the `null` (not found / out of scope) contract. */
  async deactivate(
    id: string,
    deactivatedAt: Date,
    scope: AdminUserScope,
  ): Promise<AdminUserDto | null> {
    const idPredicate = eq(usersTable.id, id);
    const whereClause =
      scope === null
        ? idPredicate
        : and(idPredicate, membershipScopePredicate(this.db, scope.tenantId));

    const [row] = await this.db
      .update(usersTable)
      .set({ deactivatedAt, updatedAt: new Date() })
      .where(whereClause)
      .returning();

    return row ? mapUserRow(row) : null;
  }
}
