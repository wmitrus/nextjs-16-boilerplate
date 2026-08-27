import { sql, count, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  authOrganizationIdentitiesTable,
  authUserIdentitiesTable,
} from '@/modules/auth/infrastructure/drizzle/schema';
import {
  membershipsTable,
  organizationsTable,
  policiesTable,
  tenantAttributesTable,
  waitlistEntriesTable,
} from '@/modules/authorization/infrastructure/drizzle/schema';
import { usersTable } from '@/modules/user/infrastructure/drizzle/schema';

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface LatestSchemaMigration {
  readonly id: number;
  readonly hash: string;
}

/**
 * The schema-version half of this tool's evidence, alongside `commitSha`:
 * reads the latest applied migration from drizzle's own bookkeeping table
 * (`drizzle.__drizzle_migrations`, not `public` -- separate schema). A
 * report is tied to the exact DB schema state it was observed against,
 * not just the application code's git state, which can drift from it
 * (e.g. a report run against a DB that hasn't picked up the latest
 * migration yet, even on a clean checkout).
 */
export async function latestSchemaMigration(
  tx: Tx,
): Promise<LatestSchemaMigration | null> {
  const rows = await tx.execute<{ id: number; hash: string }>(
    sql`select id, hash from drizzle.__drizzle_migrations order by id desc limit 1`,
  );
  const row = rows[0];
  return row ? { id: row.id, hash: row.hash } : null;
}

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
 * S4: counts any user who holds a membership in more than one
 * organization -- regardless of whether those organizations belong to the
 * same tenant or different tenants. Distinct from
 * `usersInMultipleTenantsCount` below, which specifically isolates the
 * cross-tenant case: two organizations under one tenant and two
 * organizations under two different tenants are architecturally different
 * states, and this function alone cannot tell them apart -- read it
 * together with `usersInMultipleTenantsCount`, not in isolation. Computed
 * as a single aggregate over a per-user subquery -- no user id ever
 * leaves the database.
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

/**
 * S4 (tenant-level): counts users whose organization memberships span more
 * than one *tenant* -- joins through `organizations.tenant_id` rather than
 * counting distinct organizations directly. This is the architecturally
 * significant case for the eventual two-ID migration: a user in two
 * organizations under one tenant is a normal multi-workspace user; a user
 * spanning two different tenants is a different kind of state entirely.
 */
export async function usersInMultipleTenantsCount(tx: Tx): Promise<number> {
  const rows = await tx.execute<{ value: string }>(sql`
    select count(*) as value from (
      select m.user_id
      from ${membershipsTable} m
      join ${organizationsTable} o on o.id = m.organization_id
      group by m.user_id
      having count(distinct o.tenant_id) > 1
    ) users_with_multiple_tenants
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
  readonly organizationsWithMultipleMappingsSameProvider: number;
}

/**
 * S5: organization <-> external-provider identity mapping shape. Both
 * counts are single-row aggregates -- no organization id or provider
 * identity row ever leaves the database.
 *
 * The duplicate check groups by `(organization_id, provider)`, not just
 * `organization_id`: the schema explicitly carries a `provider` column, so
 * one organization legitimately having one mapping per provider (e.g. one
 * Clerk mapping and one AuthJS mapping) is healthy provider-parity, not an
 * anomaly. Grouping by organization_id alone would have flagged that
 * healthy state as a false-positive "multiple mappings" finding.
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
        select ${authOrganizationIdentitiesTable.organizationId}, ${authOrganizationIdentitiesTable.provider}
        from ${authOrganizationIdentitiesTable}
        group by ${authOrganizationIdentitiesTable.organizationId}, ${authOrganizationIdentitiesTable.provider}
        having count(*) > 1
      ) orgs_with_multiple_mappings_same_provider
    `),
  ]);

  return {
    organizationsWithoutProviderMapping: unmapped[0]?.value ?? 0,
    organizationsWithMultipleMappingsSameProvider: Number(
      duplicated[0]?.value ?? 0,
    ),
  };
}

export interface UserProviderMappingAnomalies {
  readonly usersWithoutProviderMapping: number;
  readonly usersWithMultipleMappingsSameProvider: number;
}

/**
 * The `auth_user_identities` counterpart to
 * `providerOrganizationMappingAnomalies` -- OZI-75 scoped both user and
 * organization provider mappings, but the first pass only covered
 * organizations. Same `(user_id, provider)` grouping for the same
 * provider-parity reason.
 */
export async function userProviderMappingAnomalies(
  tx: Tx,
): Promise<UserProviderMappingAnomalies> {
  const [unmapped, duplicated] = await Promise.all([
    tx
      .select({ value: count() })
      .from(usersTable)
      .where(
        sql`not exists (
          select 1 from ${authUserIdentitiesTable}
          where ${authUserIdentitiesTable.userId} = ${usersTable.id}
        )`,
      ),
    tx.execute<{ value: string }>(sql`
      select count(*) as value from (
        select ${authUserIdentitiesTable.userId}, ${authUserIdentitiesTable.provider}
        from ${authUserIdentitiesTable}
        group by ${authUserIdentitiesTable.userId}, ${authUserIdentitiesTable.provider}
        having count(*) > 1
      ) users_with_multiple_mappings_same_provider
    `),
  ]);

  return {
    usersWithoutProviderMapping: unmapped[0]?.value ?? 0,
    usersWithMultipleMappingsSameProvider: Number(duplicated[0]?.value ?? 0),
  };
}

export interface TenantIdShapeCounts {
  readonly nonNull: number;
  readonly matchesInternalTenantUuid: number;
  readonly matchesInternalOrganizationUuid: number;
  readonly matchesNeither: number;
}

const UUID_PATTERN =
  "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";

/**
 * S6: for a `tenant_id text` column that may hold either an internal
 * `tenants.id` uuid or a raw external-provider org id (see
 * `ownership-matrix.ts`'s TENANT_ORG_CONFLATION_NOTE), quantifies how many
 * non-null values resolve to a real internal *tenant*, how many instead
 * resolve to an *organization* id (the specific, architecturally load-
 * bearing confusion this whole migration exists to resolve -- a column
 * named "tenant" actually holding an organization uuid), and how many
 * match neither (external-provider-shaped or otherwise unrecognized).
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
    matches_tenant: string;
    matches_organization: string;
    matches_neither: string;
  }>(sql`
    select
      count(*) filter (where tenant_id is not null) as non_null,
      count(*) filter (
        where tenant_id is not null
          and tenant_id ~* ${sql.raw(UUID_PATTERN)}
          and exists (select 1 from tenants where tenants.id::text = ${table}.tenant_id)
      ) as matches_tenant,
      count(*) filter (
        where tenant_id is not null
          and tenant_id ~* ${sql.raw(UUID_PATTERN)}
          and exists (select 1 from ${organizationsTable} where ${organizationsTable.id}::text = ${table}.tenant_id)
      ) as matches_organization,
      count(*) filter (
        where tenant_id is not null
          and not (
            tenant_id ~* ${sql.raw(UUID_PATTERN)}
            and (
              exists (select 1 from tenants where tenants.id::text = ${table}.tenant_id)
              or exists (select 1 from ${organizationsTable} where ${organizationsTable.id}::text = ${table}.tenant_id)
            )
          )
      ) as matches_neither
    from ${table}
  `);

  const row = rows[0];
  return {
    nonNull: Number(row?.non_null ?? 0),
    matchesInternalTenantUuid: Number(row?.matches_tenant ?? 0),
    matchesInternalOrganizationUuid: Number(row?.matches_organization ?? 0),
    matchesNeither: Number(row?.matches_neither ?? 0),
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
 * observably exceeded by real data.
 *
 * Read this as: "the configured quota is exceeded in observed data;
 * enforcement effectiveness requires runtime-path verification" -- NOT as
 * a confirmed "nothing enforces this" finding. The data alone doesn't
 * prove that: the exceeding rows could predate enforcement being added,
 * could have been created through a special/import path, or through an
 * administrative bypass. This function only quantifies the observed
 * state; it does not and cannot establish why that state exists.
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
