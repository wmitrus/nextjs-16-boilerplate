import { sql } from 'drizzle-orm';

import type { FeatureFlagEvaluationContext } from '@/core/contracts/feature-flags';
import type { FeatureFlagService } from '@/core/contracts/feature-flags';
import type { DrizzleDb } from '@/core/db';
import { organizationsReferenceTable } from '@/core/db/schema/references';

import { featureFlagsTable } from './schema';

/** Normalize a raw `db.execute` result to its row array (driver-shape safe). */
function firstRow<T>(raw: unknown): T | undefined {
  const rows = (
    Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])
  ) as T[];
  return rows[0];
}

export class DrizzleFeatureFlagService implements FeatureFlagService {
  constructor(private readonly db: DrizzleDb) {}

  async isEnabled(
    flag: string,
    context: FeatureFlagEvaluationContext,
  ): Promise<boolean> {
    const { scope } = context;

    if (scope.kind === 'platform-global') {
      // No tenant/organization to prove -- resolves ONLY the genuinely
      // platform-global rows. `unresolved_legacy` / `quarantined` /
      // `canonical_organization` never participate.
      const raw = await this.db.execute(sql`
        SELECT enabled
        FROM ${featureFlagsTable}
        WHERE key = ${flag} AND ownership_state = 'intentional_global'
        LIMIT 1
      `);
      return firstRow<{ enabled: boolean }>(raw)?.enabled ?? false;
    }

    // scope.kind === 'organization' (plan §14a.7). The `(organizationId,
    // tenantId)` tuple is proven valid FIRST: `EXISTS (SELECT 1 FROM
    // valid_scope)` gates the WHOLE predicate below, not merely the
    // organization branch, so an invalid tuple (a real organization paired
    // with the wrong tenant) yields zero rows -- no organization override
    // AND no `intentional_global` fallback. `unresolved_legacy` /
    // `quarantined` never participate. Override sorts before global
    // (`organization_id IS NULL` false < true).
    const raw = await this.db.execute(sql`
      WITH valid_scope AS (
        SELECT 1
        FROM ${organizationsReferenceTable}
        WHERE id = ${scope.organizationId}
          AND tenant_id = ${scope.tenantId}
      )
      SELECT ff.enabled
      FROM ${featureFlagsTable} ff
      WHERE EXISTS (SELECT 1 FROM valid_scope)
        AND ff.key = ${flag}
        AND (
          (
            ff.ownership_state = 'canonical_organization'
            AND ff.organization_id = ${scope.organizationId}
          )
          OR ff.ownership_state = 'intentional_global'
        )
      ORDER BY (ff.organization_id IS NULL) ASC
      LIMIT 1
    `);
    return firstRow<{ enabled: boolean }>(raw)?.enabled ?? false;
  }
}
