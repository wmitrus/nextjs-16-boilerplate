/**
 * OZI-71 Slice 2 — the smallest read-only boundary that proves an id is an
 * actual internal `tenants.id` row.
 *
 * Authoritative design:
 * `.copilot/tasks/2026-09-01-ozi-71-tenant-organization-architecture/plan.md`
 * §7 ("tenant" scope); §13 invariant #3.
 *
 * `deriveTenantScopeAsPlatformAdmin` uses this so a platform admin's
 * explicitly-classified tenant operation targets a tenant that provably
 * EXISTS — not merely a UUID-shaped string. UUID syntax is representation,
 * not existence and not authority.
 *
 * There is no existing reusable read-only `tenants` row abstraction (only
 * write-path inserts in `DrizzleProvisioningService`), so this narrow
 * `tenants.id -> exists` read is added here. No schema change, no write, no
 * caching.
 *
 * NOT wired into any runtime path in this slice.
 */

import { eq } from 'drizzle-orm';

import { isCanonicalIdRepresentation } from '@/core/contracts/canonical-ids.provenance';
import type { DrizzleDb } from '@/core/db/types';

import { tenantsTable } from '@/modules/authorization/infrastructure/drizzle/schema';

/**
 * Read-only proof that a given id is an internal `tenants.id` row. An
 * implementation MUST answer for exactly the id it is given.
 */
export interface TenantExistenceReader {
  exists(tenantId: string): Promise<boolean>;
}

/**
 * Returns `true` iff `tenantId` is UUID-shaped AND a `tenants` row with that
 * id exists. A non-UUID input returns `false` rather than reaching the query.
 */
export async function readTenantExists(
  db: DrizzleDb,
  tenantId: string,
): Promise<boolean> {
  if (!isCanonicalIdRepresentation(tenantId)) {
    return false;
  }

  const rows = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  return rows.length > 0;
}

/** Drizzle-backed {@link TenantExistenceReader}. */
export function createDrizzleTenantExistenceReader(
  db: DrizzleDb,
): TenantExistenceReader {
  return { exists: (tenantId) => readTenantExists(db, tenantId) };
}
