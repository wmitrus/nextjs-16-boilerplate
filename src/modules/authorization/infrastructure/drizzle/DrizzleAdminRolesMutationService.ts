import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

import {
  DuplicateRoleNameError,
  ProtectedRoleDeletionError,
  ProtectedRoleMutationError,
  ProtectedSystemRoleNameError,
  RoleNotFoundError,
} from '../../domain/errors';

import { invitationsTable, membershipsTable, rolesTable } from './schema';

const RESERVED_SYSTEM_ROLE_NAMES = new Set(['owner', 'member']);
type RoleRow = typeof rolesTable.$inferSelect;

export interface CreateCustomRoleInput {
  organizationId: string;
  name: string;
}

export interface CreatedCustomRoleDto {
  id: string;
  organizationId: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
}

export interface UpdatedRoleDto {
  id: string;
  organizationId: string;
  name: string;
  isSystem: boolean;
  createdAt: string;
}

function rowToRoleDto(row: RoleRow): CreatedCustomRoleDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleAdminRolesMutationService {
  constructor(private readonly db: DrizzleDb) {}

  async createCustomRole(
    input: CreateCustomRoleInput,
  ): Promise<CreatedCustomRoleDto> {
    const normalizedName = input.name.trim();
    const canonicalName = normalizedName.toLowerCase();

    if (RESERVED_SYSTEM_ROLE_NAMES.has(canonicalName)) {
      throw new ProtectedSystemRoleNameError(normalizedName);
    }

    const duplicateRows = await this.db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.organizationId, input.organizationId),
          sql`lower(${rolesTable.name}) = ${canonicalName}`,
        ),
      )
      .limit(1);

    if (duplicateRows.length > 0) {
      throw new DuplicateRoleNameError(normalizedName);
    }

    const createdRows = await this.db
      .insert(rolesTable)
      .values({
        id: randomUUID(),
        organizationId: input.organizationId,
        name: normalizedName,
        isSystem: false,
      })
      .returning();

    const createdRole = createdRows[0];
    if (!createdRole) {
      throw new Error('Failed to create role');
    }

    return rowToRoleDto(createdRole);
  }

  async renameCustomRole(input: {
    organizationId: string;
    roleId: string;
    name: string;
  }): Promise<UpdatedRoleDto> {
    const normalizedName = input.name.trim();
    const canonicalName = normalizedName.toLowerCase();

    if (RESERVED_SYSTEM_ROLE_NAMES.has(canonicalName)) {
      throw new ProtectedSystemRoleNameError(normalizedName);
    }

    const existingRows = await this.db
      .select({
        id: rolesTable.id,
        organizationId: rolesTable.organizationId,
        name: rolesTable.name,
        isSystem: rolesTable.isSystem,
        createdAt: rolesTable.createdAt,
      })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.id, input.roleId),
          eq(rolesTable.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    const existingRole = existingRows[0];
    if (!existingRole) {
      throw new RoleNotFoundError();
    }

    if (existingRole.isSystem) {
      throw new ProtectedRoleMutationError(existingRole.name);
    }

    const duplicateRows = await this.db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.organizationId, input.organizationId),
          sql`lower(${rolesTable.name}) = ${canonicalName}`,
        ),
      )
      .limit(1);

    if (duplicateRows[0] && duplicateRows[0].id !== input.roleId) {
      throw new DuplicateRoleNameError(normalizedName);
    }

    const updatedRows = await this.db
      .update(rolesTable)
      .set({ name: normalizedName })
      .where(
        and(
          eq(rolesTable.id, input.roleId),
          eq(rolesTable.organizationId, input.organizationId),
        ),
      )
      .returning();

    const updatedRole = updatedRows[0];
    if (!updatedRole) {
      throw new RoleNotFoundError();
    }

    return rowToRoleDto(updatedRole);
  }

  async deleteCustomRole(input: {
    organizationId: string;
    roleId: string;
  }): Promise<void> {
    const existingRows = await this.db
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

    const existingRole = existingRows[0];
    if (!existingRole) {
      throw new RoleNotFoundError();
    }

    if (existingRole.isSystem) {
      throw new ProtectedRoleMutationError(existingRole.name);
    }

    const [membershipRows, invitationRows] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(membershipsTable)
        .where(eq(membershipsTable.roleId, input.roleId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(invitationsTable)
        .where(
          and(
            eq(invitationsTable.roleId, input.roleId),
            eq(invitationsTable.status, 'pending'),
          ),
        ),
    ]);

    const memberCount = membershipRows[0]?.count ?? 0;
    const pendingInvitationCount = invitationRows[0]?.count ?? 0;

    if (memberCount > 0 || pendingInvitationCount > 0) {
      throw new ProtectedRoleDeletionError(existingRole.name);
    }

    const deletedRows = await this.db
      .delete(rolesTable)
      .where(
        and(
          eq(rolesTable.id, input.roleId),
          eq(rolesTable.organizationId, input.organizationId),
        ),
      )
      .returning();

    if (deletedRows.length === 0) {
      throw new RoleNotFoundError();
    }
  }
}
