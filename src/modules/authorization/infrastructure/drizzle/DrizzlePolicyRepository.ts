import { asc, eq, isNull, or } from 'drizzle-orm';

import type { Action } from '@/core/contracts/authorization';
import type {
  AuthorizationContext,
  Policy,
  PolicyRepository,
} from '@/core/contracts/repositories';
import type { DrizzleDb } from '@/core/db';

import { deserializeCondition } from './deserializeCondition';
import { policiesTable } from './schema';

export class DrizzlePolicyRepository implements PolicyRepository {
  constructor(private readonly db: DrizzleDb) {}

  async getPolicies(context: AuthorizationContext): Promise<Policy[]> {
    const { tenantId } = context.tenant;

    const rows = await this.db
      .select()
      .from(policiesTable)
      .where(
        or(
          eq(policiesTable.tenantId, tenantId),
          isNull(policiesTable.tenantId),
        ),
      )
      .orderBy(asc(policiesTable.createdAt));

    return rows.map((row) => ({
      effect: row.effect as 'allow' | 'deny',
      actions: row.actions as Action[],
      resource: row.resource,
      condition: deserializeCondition(row.conditions ?? undefined),
    }));
  }
}
