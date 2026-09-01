import { eq } from 'drizzle-orm';

import type { TenantExistenceReader } from '@/core/contracts/access-scope-authority';
import type { DrizzleDb } from '@/core/db/types';

import { tenantsTable } from './schema';

const UUID_GENERIC_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * OZI-71 Slice 2 — Drizzle implementation of the neutral
 * {@link TenantExistenceReader} port (`@/core/contracts/access-scope-authority`).
 *
 * `deriveTenantScopeAsPlatformAdmin` uses this so a platform admin's
 * explicitly-classified tenant operation targets a tenant that provably
 * EXISTS as a `tenants.id` row — UUID syntax alone is never sufficient.
 *
 * There is no existing reusable read-only `tenants` row abstraction (only
 * write-path inserts in `DrizzleProvisioningService`), so this narrow
 * `SELECT id FROM tenants WHERE id = $1 LIMIT 1` read is added here. A
 * non-UUID input fails closed before the query. No write, no cache, no
 * schema change.
 *
 * NOT wired into any runtime path in this slice.
 */
export class DrizzleTenantExistenceReader implements TenantExistenceReader {
  private readonly db: DrizzleDb;

  constructor(db: DrizzleDb) {
    this.db = db;
  }

  async exists(tenantId: string): Promise<boolean> {
    if (!UUID_GENERIC_REGEX.test(tenantId)) {
      return false;
    }

    const rows = await this.db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);

    return rows.length > 0;
  }
}
