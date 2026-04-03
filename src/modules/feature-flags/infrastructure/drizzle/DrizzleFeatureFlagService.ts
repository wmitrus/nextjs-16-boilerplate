import { and, eq, isNull, or } from 'drizzle-orm';

import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import type { DrizzleDb } from '@/core/db';

import { featureFlagsTable } from './schema';

export class DrizzleFeatureFlagService implements FeatureFlagService {
  constructor(private readonly db: DrizzleDb) {}

  async isEnabled(
    flag: string,
    context: AuthorizationContext,
  ): Promise<boolean> {
    const tenantId = context.tenant.tenantId;

    const rows = await this.db
      .select({
        enabled: featureFlagsTable.enabled,
        tenantId: featureFlagsTable.tenantId,
      })
      .from(featureFlagsTable)
      .where(
        and(
          eq(featureFlagsTable.key, flag),
          or(
            eq(featureFlagsTable.tenantId, tenantId),
            isNull(featureFlagsTable.tenantId),
          ),
        ),
      );

    if (rows.length === 0) return false;

    const tenantRow = rows.find((r) => r.tenantId === tenantId);
    if (tenantRow) return tenantRow.enabled;

    const globalRow = rows.find((r) => r.tenantId === null);
    return globalRow?.enabled ?? false;
  }
}
