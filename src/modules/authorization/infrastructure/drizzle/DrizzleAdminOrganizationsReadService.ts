import { and, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import type { DataScope } from '@/core/contracts/access-context';
import type { DrizzleDb } from '@/core/db/types';

import {
  invitationsTable,
  membershipsTable,
  organizationsTable,
  policiesTable,
  rolesTable,
} from './schema';

import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

/**
 * OZI-71 Slice 3 — the organizations admin surface consumes ONLY canonical
 * `organization` / `tenant` `DataScope`. `platform-global` is deliberately
 * excluded from this union, so passing one is a COMPILE-TIME error at the
 * organizations service boundary: this surface has no legitimate
 * platform-global behaviour.
 */
export type OrganizationsAdminDataScope = Extract<
  DataScope,
  { readonly kind: 'organization' | 'tenant' }
>;

/**
 * Canonical scope predicate for the `organizations` table.
 *
 * - `organization` — binds BOTH the organization id AND its parent tenant id
 *   (defence in depth: the canonical `organization` variant deliberately
 *   carries both, so a forged `organizationId` + wrong `tenantId` pair
 *   matches no row).
 * - `tenant` — binds the parent tenant id.
 *
 * Callers AND this with the requested organization id in the SAME statement;
 * there is no unscoped branch.
 */
export function organizationsAdminScopeFilter(
  scope: OrganizationsAdminDataScope,
): SQL {
  const tenantMatch = eq(organizationsTable.tenantId, scope.tenantId);

  if (scope.kind === 'tenant') {
    return tenantMatch;
  }

  return and(eq(organizationsTable.id, scope.organizationId), tenantMatch)!;
}

export interface OrganizationSummaryDto {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  createdAt: string;
  memberCount: number;
  roleCount: number;
  pendingInvitationCount: number;
  isActive: boolean;
}

export interface OrganizationDetailDto {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
    createdAt: string;
  };
  stats: {
    memberCount: number;
    roleCount: number;
    pendingInvitationCount: number;
    policyCount: number;
  };
}

export interface OrganizationRoleSummaryDto {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
  memberCount: number;
  pendingInvitationCount: number;
}

export interface OrganizationRolesPageDto {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  roles: OrganizationRoleSummaryDto[];
}

export interface OrganizationPolicySummaryDto {
  id: string;
  roleId: string | null;
  roleName: string | null;
  roleIsSystem: boolean;
  effect: 'allow' | 'deny';
  resource: string;
  actions: string[];
  hasConditions: boolean;
  createdAt: string;
}

export interface OrganizationPoliciesPageDto {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  roles: Array<{
    id: string;
    name: string;
    isSystem: boolean;
  }>;
  policies: OrganizationPolicySummaryDto[];
}

export interface OrganizationMemberSummaryDto {
  userId: string;
  email: string;
  displayName: string | null;
  roleId: string;
  roleName: string;
  roleIsSystem: boolean;
  joinedAt: string;
  deactivatedAt: string | null;
}

export interface OrganizationMembersPageDto {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  roles: Array<{
    id: string;
    name: string;
    isSystem: boolean;
  }>;
  members: OrganizationMemberSummaryDto[];
}

export interface OrganizationInvitationSummaryDto {
  id: string;
  organizationId: string;
  invitedByUserId: string | null;
  email: string;
  roleId: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface OrganizationInvitationsPageDto {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    status: string;
  };
  roles: Array<{
    id: string;
    name: string;
  }>;
  invitations: OrganizationInvitationSummaryDto[];
}

export interface ListOrganizationsInActiveScopeInput {
  /** Canonical authorization / SQL containment. Sole determinant of the row set. */
  readonly scope: OrganizationsAdminDataScope;
  /**
   * PRESENTATION-ONLY working-context id (the caller's already server-resolved
   * `AccessContext.activeOrganization.organizationId`). It ONLY decides which
   * returned row carries `isActive: true`. It MUST NOT reach
   * `organizationsAdminScopeFilter`, any `WHERE`/`count` clause, tenant
   * derivation, or membership derivation — the returned set stays determined
   * solely by `scope`.
   */
  readonly activeOrganizationId: string;
  readonly limit: number;
  readonly offset: number;
  readonly search?: string;
  readonly status?: 'active' | 'archived';
}

export class DrizzleAdminOrganizationsReadService {
  constructor(private readonly db: DrizzleDb) {}

  async listInActiveScope(
    input: ListOrganizationsInActiveScopeInput,
  ): Promise<{ organizations: OrganizationSummaryDto[]; total: number }> {
    const searchFilter = input.search
      ? or(
          ilike(organizationsTable.name, `%${input.search}%`),
          ilike(organizationsTable.slug, `%${input.search}%`),
        )
      : undefined;

    const statusFilter = input.status
      ? eq(organizationsTable.status, input.status)
      : undefined;

    const scopeFilter = organizationsAdminScopeFilter(input.scope);

    const whereClause =
      searchFilter && statusFilter
        ? and(scopeFilter, searchFilter, statusFilter)
        : searchFilter
          ? and(scopeFilter, searchFilter)
          : statusFilter
            ? and(scopeFilter, statusFilter)
            : scopeFilter;

    const [organizationRows, countRows] = await Promise.all([
      this.db
        .select({
          id: organizationsTable.id,
          name: organizationsTable.name,
          slug: organizationsTable.slug,
          status: organizationsTable.status,
          createdAt: organizationsTable.createdAt,
        })
        .from(organizationsTable)
        .where(whereClause)
        .limit(input.limit)
        .offset(input.offset)
        .orderBy(organizationsTable.createdAt),
      this.db
        .select({ total: count() })
        .from(organizationsTable)
        .where(whereClause),
    ]);

    const organizationIds = organizationRows.map(
      (organization) => organization.id,
    );
    if (organizationIds.length === 0) {
      return {
        organizations: [],
        total: countRows[0]?.total ?? 0,
      };
    }

    const [membershipCounts, roleCounts, invitationCounts] = await Promise.all([
      this.db
        .select({
          organizationId: membershipsTable.organizationId,
          count: sql<number>`count(*)::int`,
        })
        .from(membershipsTable)
        .where(inArray(membershipsTable.organizationId, organizationIds))
        .groupBy(membershipsTable.organizationId),
      this.db
        .select({
          organizationId: rolesTable.organizationId,
          count: sql<number>`count(*)::int`,
        })
        .from(rolesTable)
        .where(inArray(rolesTable.organizationId, organizationIds))
        .groupBy(rolesTable.organizationId),
      this.db
        .select({
          organizationId: invitationsTable.organizationId,
          count: sql<number>`count(*)::int`,
        })
        .from(invitationsTable)
        .where(
          and(
            inArray(invitationsTable.organizationId, organizationIds),
            eq(invitationsTable.status, 'pending'),
          ),
        )
        .groupBy(invitationsTable.organizationId),
    ]);

    const memberCountByOrganization = new Map(
      membershipCounts.map((row) => [row.organizationId, row.count]),
    );
    const roleCountByOrganization = new Map(
      roleCounts.map((row) => [row.organizationId, row.count]),
    );
    const invitationCountByOrganization = new Map(
      invitationCounts.map((row) => [row.organizationId, row.count]),
    );

    return {
      organizations: organizationRows.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
        memberCount: memberCountByOrganization.get(organization.id) ?? 0,
        roleCount: roleCountByOrganization.get(organization.id) ?? 0,
        pendingInvitationCount:
          invitationCountByOrganization.get(organization.id) ?? 0,
        // Presentation-only: which of the scope-authorized rows is the
        // caller's working-context organization. Never a containment fact.
        isActive: organization.id === input.activeOrganizationId,
      })),
      total: countRows[0]?.total ?? 0,
    };
  }

  async getDetailInActiveScope(input: {
    scope: OrganizationsAdminDataScope;
    organizationId: string;
  }): Promise<OrganizationDetailDto | null> {
    const scopeFilter = organizationsAdminScopeFilter(input.scope);

    const organizationRows = await this.db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        status: organizationsTable.status,
        createdAt: organizationsTable.createdAt,
      })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, input.organizationId), scopeFilter))
      .limit(1);

    const organization = organizationRows[0];
    if (!organization) {
      return null;
    }

    const [membershipRows, roleRows, invitationRows, policyRows] =
      await Promise.all([
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(membershipsTable)
          .where(eq(membershipsTable.organizationId, organization.id)),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(rolesTable)
          .where(eq(rolesTable.organizationId, organization.id)),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(invitationsTable)
          .where(
            and(
              eq(invitationsTable.organizationId, organization.id),
              eq(invitationsTable.status, 'pending'),
            ),
          ),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(policiesTable)
          .where(eq(policiesTable.organizationId, organization.id)),
      ]);

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        createdAt: organization.createdAt.toISOString(),
      },
      stats: {
        memberCount: membershipRows[0]?.count ?? 0,
        roleCount: roleRows[0]?.count ?? 0,
        pendingInvitationCount: invitationRows[0]?.count ?? 0,
        policyCount: policyRows[0]?.count ?? 0,
      },
    };
  }

  async getRolesInActiveScope(input: {
    scope: OrganizationsAdminDataScope;
    organizationId: string;
  }): Promise<OrganizationRolesPageDto | null> {
    const scopeFilter = organizationsAdminScopeFilter(input.scope);

    const organizationRows = await this.db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        status: organizationsTable.status,
      })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, input.organizationId), scopeFilter))
      .limit(1);

    const organization = organizationRows[0];
    if (!organization) {
      return null;
    }

    const roles = await this.db
      .select({
        id: rolesTable.id,
        name: rolesTable.name,
        isSystem: rolesTable.isSystem,
        createdAt: rolesTable.createdAt,
      })
      .from(rolesTable)
      .where(eq(rolesTable.organizationId, organization.id))
      .orderBy(rolesTable.createdAt, rolesTable.name);

    const roleIds = roles.map((role) => role.id);
    if (roleIds.length === 0) {
      return {
        organization,
        roles: [],
      };
    }

    const [membershipCounts, invitationCounts] = await Promise.all([
      this.db
        .select({
          roleId: membershipsTable.roleId,
          count: sql<number>`count(*)::int`,
        })
        .from(membershipsTable)
        .where(inArray(membershipsTable.roleId, roleIds))
        .groupBy(membershipsTable.roleId),
      this.db
        .select({
          roleId: invitationsTable.roleId,
          count: sql<number>`count(*)::int`,
        })
        .from(invitationsTable)
        .where(
          and(
            inArray(invitationsTable.roleId, roleIds),
            eq(invitationsTable.status, 'pending'),
          ),
        )
        .groupBy(invitationsTable.roleId),
    ]);

    const memberCountByRole = new Map(
      membershipCounts.map((row) => [row.roleId, row.count]),
    );
    const invitationCountByRole = new Map(
      invitationCounts.map((row) => [row.roleId, row.count]),
    );

    return {
      organization,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        isSystem: role.isSystem,
        createdAt: role.createdAt.toISOString(),
        memberCount: memberCountByRole.get(role.id) ?? 0,
        pendingInvitationCount: invitationCountByRole.get(role.id) ?? 0,
      })),
    };
  }

  async getPoliciesInActiveScope(input: {
    scope: OrganizationsAdminDataScope;
    organizationId: string;
  }): Promise<OrganizationPoliciesPageDto | null> {
    const scopeFilter = organizationsAdminScopeFilter(input.scope);

    const organizationRows = await this.db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        status: organizationsTable.status,
      })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, input.organizationId), scopeFilter))
      .limit(1);

    const organization = organizationRows[0];
    if (!organization) {
      return null;
    }

    const [policyRows, roleRows] = await Promise.all([
      this.db
        .select({
          id: policiesTable.id,
          roleId: policiesTable.roleId,
          effect: policiesTable.effect,
          resource: policiesTable.resource,
          actions: policiesTable.actions,
          conditions: policiesTable.conditions,
          createdAt: policiesTable.createdAt,
        })
        .from(policiesTable)
        .where(eq(policiesTable.organizationId, organization.id))
        .orderBy(
          policiesTable.resource,
          policiesTable.effect,
          policiesTable.createdAt,
        ),
      this.db
        .select({
          id: rolesTable.id,
          name: rolesTable.name,
          isSystem: rolesTable.isSystem,
        })
        .from(rolesTable)
        .where(eq(rolesTable.organizationId, organization.id)),
    ]);

    const roleNameById = new Map(roleRows.map((role) => [role.id, role.name]));
    const roleIsSystemById = new Map(
      roleRows.map((role) => [role.id, role.isSystem]),
    );

    return {
      organization,
      roles: roleRows
        .map((role) => ({
          id: role.id,
          name: role.name,
          isSystem: role.isSystem,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      policies: policyRows.map((policy) => ({
        id: policy.id,
        roleId: policy.roleId,
        roleName: policy.roleId
          ? (roleNameById.get(policy.roleId) ?? null)
          : null,
        roleIsSystem: policy.roleId
          ? (roleIsSystemById.get(policy.roleId) ?? false)
          : false,
        effect: policy.effect,
        resource: policy.resource,
        actions: policy.actions,
        hasConditions:
          typeof policy.conditions === 'object' &&
          policy.conditions !== null &&
          Object.keys(policy.conditions).length > 0,
        createdAt: policy.createdAt.toISOString(),
      })),
    };
  }

  async getInvitationsInActiveScope(input: {
    scope: OrganizationsAdminDataScope;
    organizationId: string;
  }): Promise<OrganizationInvitationsPageDto | null> {
    const scopeFilter = organizationsAdminScopeFilter(input.scope);

    const organizationRows = await this.db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        status: organizationsTable.status,
      })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, input.organizationId), scopeFilter))
      .limit(1);

    const organization = organizationRows[0];
    if (!organization) {
      return null;
    }

    const [invitationRows, roleRows] = await Promise.all([
      this.db
        .select({
          id: invitationsTable.id,
          organizationId: invitationsTable.organizationId,
          invitedByUserId: invitationsTable.invitedByUserId,
          email: invitationsTable.email,
          roleId: invitationsTable.roleId,
          status: invitationsTable.status,
          expiresAt: invitationsTable.expiresAt,
          acceptedAt: invitationsTable.acceptedAt,
          createdAt: invitationsTable.createdAt,
        })
        .from(invitationsTable)
        .where(eq(invitationsTable.organizationId, organization.id)),
      this.db
        .select({
          id: rolesTable.id,
          name: rolesTable.name,
        })
        .from(rolesTable)
        .where(eq(rolesTable.organizationId, organization.id))
        .orderBy(rolesTable.name),
    ]);

    return {
      organization,
      roles: roleRows,
      invitations: invitationRows.map((invitation) => ({
        id: invitation.id,
        organizationId: invitation.organizationId,
        invitedByUserId: invitation.invitedByUserId ?? null,
        email: invitation.email,
        roleId: invitation.roleId,
        status: invitation.status as OrganizationInvitationSummaryDto['status'],
        expiresAt: invitation.expiresAt.toISOString(),
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
      })),
    };
  }

  async getMembersInActiveScope(input: {
    scope: OrganizationsAdminDataScope;
    organizationId: string;
  }): Promise<OrganizationMembersPageDto | null> {
    const scopeFilter = organizationsAdminScopeFilter(input.scope);

    const organizationRows = await this.db
      .select({
        id: organizationsTable.id,
        name: organizationsTable.name,
        slug: organizationsTable.slug,
        status: organizationsTable.status,
      })
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, input.organizationId), scopeFilter))
      .limit(1);

    const organization = organizationRows[0];
    if (!organization) {
      return null;
    }

    const [membershipRows, roleRows] = await Promise.all([
      this.db
        .select({
          userId: membershipsTable.userId,
          email: usersTable.email,
          displayName: usersTable.displayName,
          roleId: membershipsTable.roleId,
          roleName: rolesTable.name,
          roleIsSystem: rolesTable.isSystem,
          joinedAt: membershipsTable.createdAt,
          deactivatedAt: usersTable.deactivatedAt,
        })
        .from(membershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
        .innerJoin(rolesTable, eq(rolesTable.id, membershipsTable.roleId))
        .where(eq(membershipsTable.organizationId, organization.id))
        .orderBy(usersTable.email, membershipsTable.createdAt),
      this.db
        .select({
          id: rolesTable.id,
          name: rolesTable.name,
          isSystem: rolesTable.isSystem,
        })
        .from(rolesTable)
        .where(eq(rolesTable.organizationId, organization.id))
        .orderBy(rolesTable.name),
    ]);

    return {
      organization,
      roles: roleRows,
      members: membershipRows.map((membership) => ({
        userId: membership.userId,
        email: membership.email,
        displayName: membership.displayName,
        roleId: membership.roleId,
        roleName: membership.roleName,
        roleIsSystem: membership.roleIsSystem,
        joinedAt: membership.joinedAt.toISOString(),
        deactivatedAt: membership.deactivatedAt?.toISOString() ?? null,
      })),
    };
  }
}
