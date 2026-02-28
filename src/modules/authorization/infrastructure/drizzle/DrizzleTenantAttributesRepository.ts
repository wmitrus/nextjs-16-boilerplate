import { eq } from 'drizzle-orm';

import type {
  TenantAttributes,
  TenantAttributesRepository,
  TenantId,
} from '@/core/contracts/repositories';
import type { DrizzleDb } from '@/core/db';

import { tenantAttributesTable } from './schema';

const DEFAULTS: TenantAttributes = {
  plan: 'free',
  contractType: 'standard',
  features: [],
  userLimit: 5,
};

export class DrizzleTenantAttributesRepository implements TenantAttributesRepository {
  constructor(private readonly db: DrizzleDb) {}

  async getTenantAttributes(tenantId: TenantId): Promise<TenantAttributes> {
    const rows = await this.db
      .select()
      .from(tenantAttributesTable)
      .where(eq(tenantAttributesTable.tenantId, tenantId))
      .limit(1);

    if (rows.length === 0) return DEFAULTS;

    const row = rows[0];
    return {
      plan: row.plan as TenantAttributes['plan'],
      contractType: row.contractType as TenantAttributes['contractType'],
      features: (row.features ?? []) as string[],
      userLimit: row.maxUsers,
    };
  }
}
