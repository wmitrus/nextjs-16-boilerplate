import { sql, count, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { authOrganizationIdentitiesTable } from '@/modules/auth/infrastructure/drizzle/schema';
import {
  membershipsTable,
  organizationsTable,
  policiesTable,
  tenantAttributesTable,
  waitlistEntriesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface TenantOrgCountBuckets {
  readonly zeroOrganizations: number;
  readonly oneOrganization: number;
  readonly multipleOrganizations: number;
}

/**
 * S1/S2: buckets every tenant by how many organizations it has. Computed
 * entirely inside Postgres (an aggregate over a per-tenant subquery) --
 * unlike an app-side `GROUP BY` fetch-then-bucket, no per-tenant row (and
 * so no tenant id) ever leaves the database into this process; only the
 * three final counts do.
 */
export async function tenantOrganizationCounts(
  tx: Tx,
): Promise<TenantOrgCountBuckets> {
  const rows = await tx.execute<{
    zero: string;
    one: string;
    multiple: string;
  }>(sql`
    select
      count(*) filter (where org_count = 0) as zero,
      count(*) filter (where org_count = 1) as one,
      count(*) filter (where org_count > 1) as multiple
    from (
      select t.id, count(o.id) as org_count
      from tenants t
      left join ${organizationsTable} o on o.tenant_id = t.id
      group by t.id
    ) per_tenant
  `);

  const row = rows[0];
  return {
    zeroOrganizations: Number(row?.zero ?? 0),
    oneOrganization: Number(row?.one ?? 0),
    multipleOrganizations: Number(row?.multiple ?? 0),
  };
}

/**
 * S4: counts users who hold a membership in more than one organization.
 * Computed as a single aggregate over a per-user subquery -- no user id
 * ever leaves the database.
 */
export async function usersInMultipleOrganizationsCount(
  tx: Tx,
): Promise<number> {
  const rows = await tx.execute<{ value: string }>(sql`
    select count(*) as value from (
      select ${membershipsTable.userId}
      from ${membershipsTable}
      group by ${membershipsTable.userId}
      having count(distinct ${membershipsTable.organizationId}) > 1
    ) users_with_multiple_orgs
  `);

  return Number(rows[0]?.value ?? 0);
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

/**
 * S5: organization <-> external-provider identity mapping shape. Both
 * counts are single-row aggregates -- no organization id or provider
 * identity row ever leaves the database.
 */
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
    tx.execute<{ value: string }>(sql`
      select count(*) as value from (
        select ${authOrganizationIdentitiesTable.organizationId}
        from ${authOrganizationIdentitiesTable}
        group by ${authOrganizationIdentitiesTable.organizationId}
        having count(*) > 1
      ) orgs_with_multiple_mappings
    `),
  ]);

  return {
    organizationsWithoutProviderMapping: unmapped[0]?.value ?? 0,
    organizationsWithMultipleProviderMappings: Number(
      duplicated[0]?.value ?? 0,
    ),
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
