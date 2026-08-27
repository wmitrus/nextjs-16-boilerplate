import { sql, count, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { authOrganizationIdentitiesTable } from '@/modules/auth/infrastructure/drizzle/schema';
import {
  membershipsTable,
  organizationsTable,
  policiesTable,
  tenantAttributesTable,
  tenantsTable,
  waitlistEntriesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';

type Tx = PostgresJsDatabase<Record<string, never>>;

/**
 * Safety net for every listing query in this module, independent of the
 * `READ ONLY` transaction: this tool never needs more than a bounded sample
 * of raw rows, even against a much larger environment than local dev/test.
 * Aggregate (`count`) queries below don't need it -- they return one row
 * regardless of table size -- but it is applied wherever a query could
 * otherwise return one row per entity.
 */
const MAX_ROWS = 10_000;

export interface TenantOrgCountBuckets {
  readonly zeroOrganizations: number;
  readonly oneOrganization: number;
  readonly multipleOrganizations: number;
}

/** S1/S2: buckets every tenant by how many organizations it has. */
export async function tenantOrganizationCounts(
  tx: Tx,
): Promise<TenantOrgCountBuckets> {
  const rows = await tx
    .select({
      tenantId: tenantsTable.id,
      orgCount: count(organizationsTable.id),
    })
    .from(tenantsTable)
    .leftJoin(
      organizationsTable,
      eq(organizationsTable.tenantId, tenantsTable.id),
    )
    .groupBy(tenantsTable.id)
    .limit(MAX_ROWS);

  const buckets = {
    zeroOrganizations: 0,
    oneOrganization: 0,
    multipleOrganizations: 0,
  };

  for (const row of rows) {
    if (row.orgCount === 0) buckets.zeroOrganizations += 1;
    else if (row.orgCount === 1) buckets.oneOrganization += 1;
    else buckets.multipleOrganizations += 1;
  }

  return buckets;
}

/**
 * S4: counts users who hold a membership in more than one organization.
 * Returns only the count -- never the user ids -- consistent with keeping
 * this tool's output aggregate-only.
 */
export async function usersInMultipleOrganizationsCount(
  tx: Tx,
): Promise<number> {
  const rows = await tx
    .select({ userId: membershipsTable.userId })
    .from(membershipsTable)
    .groupBy(membershipsTable.userId)
    .having(sql`count(distinct ${membershipsTable.organizationId}) > 1`)
    .limit(MAX_ROWS);

  return rows.length;
}

/** S3: organizations whose tenant has no tenant_attributes row at all. */
export async function organizationsMissingTenantAttributesCount(
  tx: Tx,
): Promise<number> {
  const rows = await tx
    .select({ value: count() })
    .from(organizationsTable)
    .where(
      sql`not exists (
        select 1 from ${tenantAttributesTable}
        where ${tenantAttributesTable.tenantId} = ${organizationsTable.tenantId}
      )`,
    );

  return rows[0]?.value ?? 0;
}

export interface ProviderMappingAnomalies {
  readonly organizationsWithoutProviderMapping: number;
  readonly organizationsWithMultipleProviderMappings: number;
}

/** S5: organization <-> external-provider identity mapping shape. */
export async function providerOrganizationMappingAnomalies(
  tx: Tx,
): Promise<ProviderMappingAnomalies> {
  const [unmapped, duplicated] = await Promise.all([
    tx
      .select({ value: count() })
      .from(organizationsTable)
      .where(
        sql`not exists (
          select 1 from ${authOrganizationIdentitiesTable}
          where ${authOrganizationIdentitiesTable.organizationId} = ${organizationsTable.id}
        )`,
      ),
    tx
      .select({
        organizationId: authOrganizationIdentitiesTable.organizationId,
      })
      .from(authOrganizationIdentitiesTable)
      .groupBy(authOrganizationIdentitiesTable.organizationId)
      .having(sql`count(*) > 1`)
      .limit(MAX_ROWS),
  ]);

  return {
    organizationsWithoutProviderMapping: unmapped[0]?.value ?? 0,
    organizationsWithMultipleProviderMappings: duplicated.length,
  };
}

export interface TenantIdShapeCounts {
  readonly nonNull: number;
  readonly matchesInternalTenantUuid: number;
}

const UUID_PATTERN =
  "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";

/**
 * S6: for a `tenant_id text` column that may hold either an internal
 * `tenants.id` uuid or a raw external-provider org id (see
 * `ownership-matrix.ts`'s TENANT_ORG_CONFLATION_NOTE), quantifies how many
 * non-null values actually resolve to a real internal tenant versus not.
 * `tableName` is a closed, hardcoded allowlist -- never a caller-supplied
 * string -- so the identifier is never interpolated dynamically (SEC-18).
 */
export async function tenantIdShapeCounts(
  tx: Tx,
  tableName: 'feature_flags' | 'audit_log_settings' | 'audit_events',
): Promise<TenantIdShapeCounts> {
  const table = sql.raw(`"${tableName}"`);
  const rows = await tx.execute<{
    non_null: string;
    matches_internal_tenant_uuid: string;
  }>(sql`
    select
      count(*) filter (where tenant_id is not null) as non_null,
      count(*) filter (
        where tenant_id is not null
          and tenant_id ~* ${sql.raw(UUID_PATTERN)}
          and exists (
            select 1 from tenants where tenants.id::text = ${table}.tenant_id
          )
      ) as matches_internal_tenant_uuid
    from ${table}
  `);

  const row = rows[0];
  return {
    nonNull: Number(row?.non_null ?? 0),
    matchesInternalTenantUuid: Number(row?.matches_internal_tenant_uuid ?? 0),
  };
}

/**
 * Confirms/refutes the ownership-matrix hypothesis that waitlist_entries.tenant_id
 * is a dead column -- application code never writes it, but the schema
 * carries it as a real, nullable uuid FK.
 */
export async function waitlistEntriesWithTenantIdCount(
  tx: Tx,
): Promise<number> {
  const rows = await tx
    .select({ value: count() })
    .from(waitlistEntriesTable)
    .where(sql`${waitlistEntriesTable.tenantId} is not null`);

  return rows[0]?.value ?? 0;
}

/** Confirms whether policies.organization_id IS NULL happens in practice. */
export async function policiesWithNullOrganizationCount(
  tx: Tx,
): Promise<number> {
  const rows = await tx
    .select({ value: count() })
    .from(policiesTable)
    .where(isNull(policiesTable.organizationId));

  return rows[0]?.value ?? 0;
}

export interface QuotaSignal {
  readonly tenantsExceedingMaxOrganizations: number;
  readonly tenantsExceedingMaxUsers: number;
}

/**
 * S7: whether tenant_attributes.max_organizations/max_users quotas are
 * observably exceeded by real data -- if so, nothing in the runtime path
 * enforces them.
 */
export async function quotaEnforcementSignal(tx: Tx): Promise<QuotaSignal> {
  const orgRows = await tx.execute<{ exceeded: string }>(sql`
    select count(*) as exceeded from (
      select ta.tenant_id
      from ${tenantAttributesTable} ta
      join ${organizationsTable} o on o.tenant_id = ta.tenant_id
      group by ta.tenant_id, ta.max_organizations
      having count(o.id) > ta.max_organizations
    ) t
  `);

  const userRows = await tx.execute<{ exceeded: string }>(sql`
    select count(*) as exceeded from (
      select ta.tenant_id
      from ${tenantAttributesTable} ta
      join ${organizationsTable} o on o.tenant_id = ta.tenant_id
      join ${membershipsTable} m on m.organization_id = o.id
      group by ta.tenant_id, ta.max_users
      having count(distinct m.user_id) > ta.max_users
    ) t
  `);

  return {
    tenantsExceedingMaxOrganizations: Number(orgRows[0]?.exceeded ?? 0),
    tenantsExceedingMaxUsers: Number(userRows[0]?.exceeded ?? 0),
  };
}
