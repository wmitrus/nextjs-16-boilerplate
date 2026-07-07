import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { isAction, parseAction } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db/types';

import {
  DuplicatePolicyError,
  PolicyNotFoundError,
  ProtectedPolicyDeletionError,
  RoleNotFoundError,
} from '../../domain/errors';

import { policiesTable, rolesTable } from './schema';
type PolicyRow = typeof policiesTable.$inferSelect;

export interface CreatePolicyInput {
  organizationId: string;
  roleId: string;
  effect: 'allow' | 'deny';
  resource: string;
  actions: string[];
}

export interface CreatedPolicyDto {
  id: string;
  organizationId: string | null;
  roleId: string | null;
  effect: 'allow' | 'deny';
  resource: string;
  actions: string[];
  createdAt: string;
}

function rowToPolicyDto(row: PolicyRow): CreatedPolicyDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    roleId: row.roleId,
    effect: row.effect,
    resource: row.resource,
    actions: row.actions,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleAdminPoliciesMutationService {
  constructor(private readonly db: DrizzleDb) {}

  async createRolePolicy(input: CreatePolicyInput): Promise<CreatedPolicyDto> {
    const roleRows = await this.db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(
        and(
          eq(rolesTable.id, input.roleId),
          eq(rolesTable.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (roleRows.length === 0) {
      throw new RoleNotFoundError();
    }

    const canonicalActions = [...new Set(input.actions)].sort((left, right) =>
      left.localeCompare(right),
    );

    for (const action of canonicalActions) {
      if (!isAction(action)) {
        throw new Error('Policy actions must use resource:verb format');
      }

      const parsedAction = parseAction(action);
      if (parsedAction.resource !== input.resource) {
        throw new Error('Policy actions must belong to the selected resource');
      }
    }

    const createdRows = await this.db
      .insert(policiesTable)
      .values({
        id: randomUUID(),
        organizationId: input.organizationId,
        roleId: input.roleId,
        effect: input.effect,
        resource: input.resource,
        actions: canonicalActions,
        conditions: {},
      })
      .onConflictDoNothing()
      .returning();

    const createdPolicy = createdRows[0];
    if (!createdPolicy) {
      throw new DuplicatePolicyError();
    }

    return rowToPolicyDto(createdPolicy);
  }

  async deleteRolePolicy(input: {
    organizationId: string;
    policyId: string;
  }): Promise<void> {
    const policyRows = await this.db
      .select({
        id: policiesTable.id,
        roleId: policiesTable.roleId,
        resource: policiesTable.resource,
        actions: policiesTable.actions,
      })
      .from(policiesTable)
      .where(
        and(
          eq(policiesTable.id, input.policyId),
          eq(policiesTable.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    const policy = policyRows[0];
    if (!policy) {
      throw new PolicyNotFoundError();
    }

    if (policy.roleId) {
      const roleRows = await this.db
        .select({
          id: rolesTable.id,
          name: rolesTable.name,
          isSystem: rolesTable.isSystem,
        })
        .from(rolesTable)
        .where(
          and(
            eq(rolesTable.id, policy.roleId),
            eq(rolesTable.organizationId, input.organizationId),
          ),
        )
        .limit(1);

      const role = roleRows[0];
      if (!role) {
        throw new RoleNotFoundError();
      }

      const protectsAdminBaseline =
        role.isSystem &&
        role.name.toLowerCase() === 'owner' &&
        policy.resource === RESOURCES.SECURITY &&
        policy.actions.includes(ACTIONS.SECURITY_MANAGE_POLICIES);

      if (protectsAdminBaseline) {
        throw new ProtectedPolicyDeletionError();
      }
    }

    const deletedRows = await this.db
      .delete(policiesTable)
      .where(
        and(
          eq(policiesTable.id, input.policyId),
          eq(policiesTable.organizationId, input.organizationId),
        ),
      )
      .returning();

    if (deletedRows.length === 0) {
      throw new PolicyNotFoundError();
    }
  }
}
