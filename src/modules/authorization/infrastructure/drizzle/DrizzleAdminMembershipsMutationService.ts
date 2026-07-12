import { and, eq, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

import {
  MembershipNotFoundError,
  ProtectedMembershipMutationError,
  RoleNotFoundError,
} from '../../domain/errors';

import { membershipsTable, rolesTable } from './schema';

type MembershipRoleRow = {
  userId: string;
  organizationId: string;
  roleId: string;
  createdAt: Date;
  roleName: string;
  roleIsSystem: boolean;
};

export interface OrganizationMemberRoleDto {
  userId: string;
  organizationId: string;
  roleId: string;
  roleName: string;
  roleIsSystem: boolean;
  createdAt: string;
}

function mapMembershipRow(row: MembershipRoleRow): OrganizationMemberRoleDto {
  return {
    userId: row.userId,
    organizationId: row.organizationId,
    roleId: row.roleId,
    roleName: row.roleName,
    roleIsSystem: row.roleIsSystem,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleAdminMembershipsMutationService {
  constructor(private readonly db: DrizzleDb) {}

  async updateMemberRole(input: {
    organizationId: string;
    userId: string;
    roleId: string;
  }): Promise<OrganizationMemberRoleDto> {
    const existingMembershipRows = await this.db
      .select({
        userId: membershipsTable.userId,
        organizationId: membershipsTable.organizationId,
        roleId: membershipsTable.roleId,
        createdAt: membershipsTable.createdAt,
        roleName: rolesTable.name,
        roleIsSystem: rolesTable.isSystem,
      })
      .from(membershipsTable)
      .innerJoin(rolesTable, eq(rolesTable.id, membershipsTable.roleId))
      .where(
        and(
          eq(membershipsTable.organizationId, input.organizationId),
          eq(membershipsTable.userId, input.userId),
        ),
      )
      .limit(1);

    const existingMembership = existingMembershipRows[0];
    if (!existingMembership) {
      throw new MembershipNotFoundError();
    }

    const targetRoleRows = await this.db
      .select({
        id: rolesTable.id,
        name: rolesTable.name,
        isSystem: rolesTable.isSystem,
      })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.id, input.roleId),
          eq(rolesTable.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    const targetRole = targetRoleRows[0];
    if (!targetRole) {
      throw new RoleNotFoundError();
    }

    if (existingMembership.roleId === targetRole.id) {
      return {
        userId: existingMembership.userId,
        organizationId: existingMembership.organizationId,
        roleId: existingMembership.roleId,
        roleName: existingMembership.roleName,
        roleIsSystem: existingMembership.roleIsSystem,
        createdAt: existingMembership.createdAt.toISOString(),
      };
    }

    const isOwnerMembership =
      existingMembership.roleIsSystem &&
      existingMembership.roleName.toLowerCase() === 'owner';

    if (isOwnerMembership) {
      const ownerCountRows = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(membershipsTable)
        .where(
          and(
            eq(membershipsTable.organizationId, input.organizationId),
            eq(membershipsTable.roleId, existingMembership.roleId),
          ),
        );

      const ownerCount = ownerCountRows[0]?.count ?? 0;
      if (ownerCount <= 1) {
        throw new ProtectedMembershipMutationError(
          'The last owner membership cannot be reassigned',
        );
      }
    }

    const updatedRows = await this.db
      .update(membershipsTable)
      .set({ roleId: targetRole.id })
      .where(
        and(
          eq(membershipsTable.organizationId, input.organizationId),
          eq(membershipsTable.userId, input.userId),
        ),
      )
      .returning();

    const updatedMembership = updatedRows[0];
    if (!updatedMembership) {
      throw new MembershipNotFoundError();
    }

    return mapMembershipRow({
      ...updatedMembership,
      roleName: targetRole.name,
      roleIsSystem: targetRole.isSystem,
    });
  }
}
