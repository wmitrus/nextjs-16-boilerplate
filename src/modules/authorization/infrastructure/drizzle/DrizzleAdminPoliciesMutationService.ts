import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { isAction, parseAction } from '@/core/contracts/authorization';
import { ACTIONS, RESOURCES } from '@/core/contracts/resources-actions';
import type { DrizzleDb } from '@/core/db/types';

import {
  DuplicatePolicyError,
  PolicyNotFoundError,
  ProtectedPolicyDeletionError,
  ProtectedPolicyMutationError,
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

export interface UpdatePolicyInput {
  organizationId: string;
  policyId: string;
  effect: 'allow' | 'deny';
  resource: string;
  actions: string[];
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

function canonicalizePolicyActions(
  resource: string,
  actions: string[],
): string[] {
  const canonicalActions = [...new Set(actions)].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const action of canonicalActions) {
    if (!isAction(action)) {
      throw new Error('Policy actions must use resource:verb format');
    }

    const parsedAction = parseAction(action);
    if (parsedAction.resource !== resource) {
      throw new Error('Policy actions must belong to the selected resource');
    }
  }

  return canonicalActions;
}

function isProtectedAdminBaselinePolicy(
  role: { name: string; isSystem: boolean },
  policy: { resource: string; actions: string[] },
): boolean {
  return (
    role.isSystem &&
    role.name.toLowerCase() === 'owner' &&
    policy.resource === RESOURCES.SECURITY &&
    policy.actions.includes(ACTIONS.SECURITY_MANAGE_POLICIES)
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('unique constraint') ||
      ('code' in error && (error as { code?: unknown }).code === '23505')
    );
  }

  return false;
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

    const canonicalActions = canonicalizePolicyActions(
      input.resource,
      input.actions,
    );

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

  async updateRolePolicy(input: UpdatePolicyInput): Promise<CreatedPolicyDto> {
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

    if (!policy.roleId) {
      throw new RoleNotFoundError();
    }

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

    if (isProtectedAdminBaselinePolicy(role, policy)) {
      throw new ProtectedPolicyMutationError();
    }

    const canonicalActions = canonicalizePolicyActions(
      input.resource,
      input.actions,
    );
    const canonicalActionsKey = canonicalActions.join('\u0000');

    const siblingPolicies = await this.db
      .select({
        id: policiesTable.id,
        effect: policiesTable.effect,
        resource: policiesTable.resource,
        actions: policiesTable.actions,
      })
      .from(policiesTable)
      .where(
        and(
          eq(policiesTable.organizationId, input.organizationId),
          eq(policiesTable.roleId, policy.roleId),
          eq(policiesTable.conditions, {}),
        ),
      );

    const duplicatePolicy = siblingPolicies.find(
      (candidate) =>
        candidate.id !== input.policyId &&
        candidate.effect === input.effect &&
        candidate.resource === input.resource &&
        candidate.actions.length === canonicalActions.length &&
        candidate.actions.join('\u0000') === canonicalActionsKey,
    );

    if (duplicatePolicy) {
      throw new DuplicatePolicyError();
    }

    try {
      const updatedRows = await this.db
        .update(policiesTable)
        .set({
          effect: input.effect,
          resource: input.resource,
          actions: canonicalActions,
          conditions: {},
        })
        .where(
          and(
            eq(policiesTable.id, input.policyId),
            eq(policiesTable.organizationId, input.organizationId),
          ),
        )
        .returning();

      const updatedPolicy = updatedRows[0];
      if (!updatedPolicy) {
        throw new PolicyNotFoundError();
      }

      return rowToPolicyDto(updatedPolicy);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicatePolicyError();
      }

      throw error;
    }
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

      if (isProtectedAdminBaselinePolicy(role, policy)) {
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
