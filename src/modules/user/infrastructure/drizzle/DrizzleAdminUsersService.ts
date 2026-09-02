import { and, count, eq, exists, ilike, or, sql } from 'drizzle-orm';

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db';
import {
  membershipsReferenceTable,
  organizationsReferenceTable,
} from '@/core/db/schema/references';

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
 * OZI-71 Slice 4B — the canonical per-operation scope this admin surface
 * accepts. Deliberately narrowed: `organization` (ordinary ABAC admin) and
 * `platform-global` (env-based platform admin, an explicitly-classified
 * operation). `tenant` is EXCLUDED at compile time — passing one is a type
 * error — because Admin Users has no legitimate tenant-wide behaviour.
 * `null` is no longer a member: an ordinary membership denial is handled at
 * the composition seam / route layer, never forwarded here, so there is no
 * `null = unrestricted` path inside this boundary.
 */
export type AdminUsersDataScope = Extract<
  DataScope,
  { readonly kind: 'organization' | 'platform-global' }
>;

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

type OrganizationScope = Extract<AdminUsersDataScope, { kind: 'organization' }>;

/**
 * Canonical `organization`-scope containment for `users`, which has no direct
 * tenant/organization column: the target user must hold a `memberships` row in
 * `scope.organizationId` AND that organization's `organizations.tenant_id`
 * must equal `scope.tenantId`. BOTH members of the canonical tuple are
 * load-bearing (OZI-71 Slice 3 invariant, generalised): an internally
 * inconsistent scope (`organizationId` of ORG_A + `tenantId` of a different
 * tenant) matches no row. Expressed as a correlated `EXISTS` so the check
 * runs inside the very same statement as the read/mutation — never a
 * separate "check membership, then act on id" round trip (TOCTOU).
 *
 * Uses the neutral cross-module reference tables in
 * `@/core/db/schema/references` (never `authorization`'s real schema), so the
 * `user` module gains no dependency on `authorization`.
 */
function organizationScopePredicate(db: DrizzleDb, scope: OrganizationScope) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(membershipsReferenceTable)
      .innerJoin(
        organizationsReferenceTable,
        eq(
          organizationsReferenceTable.id,
          membershipsReferenceTable.organizationId,
        ),
      )
      .where(
        and(
          eq(membershipsReferenceTable.userId, usersTable.id),
          eq(membershipsReferenceTable.organizationId, scope.organizationId),
          eq(organizationsReferenceTable.tenantId, scope.tenantId),
        ),
      ),
  );
}

/**
 * The scope half of every Admin Users `WHERE` clause. Exhaustive over
 * {@link AdminUsersDataScope}:
 *
 * - `organization`    → the canonical tuple `EXISTS` predicate above;
 * - `platform-global` → `undefined` (no row containment) — legitimate ONLY
 *   because an explicitly-classified `derivePlatformGlobalScope` grant
 *   already authorised it upstream. There is no `default` branch, so a new
 *   `DataScope` variant reaching here is a compile error, never a silent
 *   "unrestricted".
 */
function adminUsersScopePredicate(db: DrizzleDb, scope: AdminUsersDataScope) {
  switch (scope.kind) {
    case 'organization':
      return organizationScopePredicate(db, scope);
    case 'platform-global':
      return undefined;
  }
}

/**
 * The WHERE clause for an admin user listing: an optional case-insensitive
 * search over email and display name, intersected with the caller's canonical
 * scope. `undefined` (no WHERE clause) is only reachable for a
 * `platform-global` scope searching for nothing.
 */
function adminUserListPredicate(
  db: DrizzleDb,
  search: string | undefined,
  scope: AdminUsersDataScope,
) {
  const searchPredicate = search
    ? or(
        ilike(usersTable.email, `%${search}%`),
        ilike(usersTable.displayName, `%${search}%`),
      )
    : undefined;

  const scopePredicate = adminUsersScopePredicate(db, scope);

  if (searchPredicate && scopePredicate) {
    return and(searchPredicate, scopePredicate);
  }

  return searchPredicate ?? scopePredicate;
}

/**
 * Admin-only surface for `/api/admin/users`.
 *
 * Deliberately NOT `UserRepository` / `DrizzleUserRepository` -- that
 * DI-registered repository is used for self-service lookups (a user
 * reading or updating their own record by their own verified id), where no
 * additional scoping is needed or correct, and stays untouched by this class.
 * This service is only for the admin panel's cross-user listing and mutation
 * surface, where the caller may only ever see or touch users reachable within
 * their canonical {@link AdminUsersDataScope}. Directly instantiated at the
 * route-handler call site, not registered in DI -- mirrors
 * `DrizzleFeatureFlagAdminService`.
 *
 * Every method takes an {@link AdminUsersDataScope}. For an `organization`
 * scope the DB predicate itself enforces the full canonical tuple
 * (`organizationId` AND `tenantId`) in the same statement as the
 * read/mutation, rather than trusting that the caller validated the target
 * user's membership. `platform-global` is unrestricted by design and reached
 * only through an explicit upstream classification. This closed a
 * cross-tenant IDOR/BOLA (SEC-26): the previous implementation reused
 * `DrizzleUserRepository`'s global, unscoped queries for every admin caller.
 */
export class DrizzleAdminUsersService {
  constructor(private readonly db: DrizzleDb) {}

  async listAll(
    options: {
      readonly limit?: number;
      readonly offset?: number;
      readonly search?: string;
    },
    scope: AdminUsersDataScope,
  ): Promise<{ users: AdminUserDto[]; total: number }> {
    const limit = Math.min(options.limit ?? 50, 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const whereClause = adminUserListPredicate(
      this.db,
      options.search?.trim(),
      scope,
    );

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
    requestedUserId: string,
    scope: AdminUsersDataScope,
  ): Promise<AdminUserDto | null> {
    const idPredicate = eq(usersTable.id, requestedUserId);
    const scopePredicate = adminUsersScopePredicate(this.db, scope);
    const whereClause = scopePredicate
      ? and(idPredicate, scopePredicate)
      : idPredicate;

    const rows = await this.db
      .select(USER_COLUMNS)
      .from(usersTable)
      .where(whereClause)
      .limit(1);

    const row = rows[0];
    return row ? mapUserRow(row) : null;
  }

  /**
   * Returns the updated row, or `null` when no row matched `requestedUserId`
   * within `scope` -- either the id doesn't exist, or it names a real user
   * outside the caller's scope. Both cases must map to the same 404 at the
   * route layer to avoid leaking cross-tenant existence.
   */
  async updateProfile(
    requestedUserId: string,
    profile: {
      readonly displayName?: string;
      readonly locale?: string;
      readonly timezone?: string;
    },
    scope: AdminUsersDataScope,
  ): Promise<AdminUserDto | null> {
    const idPredicate = eq(usersTable.id, requestedUserId);
    const scopePredicate = adminUsersScopePredicate(this.db, scope);
    const whereClause = scopePredicate
      ? and(idPredicate, scopePredicate)
      : idPredicate;

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
    requestedUserId: string,
    deactivatedAt: Date,
    scope: AdminUsersDataScope,
  ): Promise<AdminUserDto | null> {
    const idPredicate = eq(usersTable.id, requestedUserId);
    const scopePredicate = adminUsersScopePredicate(this.db, scope);
    const whereClause = scopePredicate
      ? and(idPredicate, scopePredicate)
      : idPredicate;

    const [row] = await this.db
      .update(usersTable)
      .set({ deactivatedAt, updatedAt: new Date() })
      .where(whereClause)
      .returning();

    return row ? mapUserRow(row) : null;
  }
}
