import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  DATA_STATEMENTS,
  getStatement,
  type StatementId,
} from './query-registry';

type Tx = PostgresJsDatabase<Record<string, never>>;

export interface RemoteInventoryFindings {
  readonly tenantOrgCounts: TenantOrgCountBuckets;
  readonly usersInMultipleOrgs: number;
  readonly usersInMultipleTenants: number;
  readonly orgsMissingTenantAttributes: number;
  readonly organizationMappingAnomalies: ProviderMappingAnomalies;
  readonly userMappingAnomalies: UserProviderMappingAnomalies;
  readonly waitlistEntriesWithTenantId: number;
  readonly policiesWithNullOrganization: number;
  readonly quotaSignal: QuotaSignal;
  readonly tenantIdShape: {
    readonly featureFlags: TenantIdShapeCounts;
    readonly auditLogSettings: TenantIdShapeCounts;
    readonly auditEvents: TenantIdShapeCounts;
  };
}

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
 *
 * SQL text lives in `query-registry.ts` (`latest_schema_migration`), not
 * here -- this function's job is only to run it and shape the result.
 */
export async function latestSchemaMigration(
  tx: Tx,
): Promise<LatestSchemaMigration | null> {
  const statement = getStatement('latest_schema_migration');
  const rows = await tx.execute<{ id: number; hash: string }>(
    sql.raw(statement.sql),
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
  const statement = getStatement('tenant_organization_counts');
  const rows = await tx.execute<{
    zero: string;
    one: string;
    multiple: string;
  }>(sql.raw(statement.sql));

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
  const statement = getStatement('users_in_multiple_organizations_count');
  const rows = await tx.execute<{ value: string }>(sql.raw(statement.sql));

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
  const statement = getStatement('users_in_multiple_tenants_count');
  const rows = await tx.execute<{ value: string }>(sql.raw(statement.sql));

  return Number(rows[0]?.value ?? 0);
}

/** S3: organizations whose tenant has no tenant_attributes row at all. */
export async function organizationsMissingTenantAttributesCount(
  tx: Tx,
): Promise<number> {
  const statement = getStatement(
    'organizations_missing_tenant_attributes_count',
  );
  const rows = await tx.execute<{ value: string }>(sql.raw(statement.sql));

  return Number(rows[0]?.value ?? 0);
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
  const unmapped = getStatement('provider_organization_mapping_unmapped');
  const duplicated = getStatement('provider_organization_mapping_duplicated');
  const [unmappedRows, duplicatedRows] = await Promise.all([
    tx.execute<{ value: string }>(sql.raw(unmapped.sql)),
    tx.execute<{ value: string }>(sql.raw(duplicated.sql)),
  ]);

  return {
    organizationsWithoutProviderMapping: Number(unmappedRows[0]?.value ?? 0),
    organizationsWithMultipleMappingsSameProvider: Number(
      duplicatedRows[0]?.value ?? 0,
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
  const unmapped = getStatement('user_provider_mapping_unmapped');
  const duplicated = getStatement('user_provider_mapping_duplicated');
  const [unmappedRows, duplicatedRows] = await Promise.all([
    tx.execute<{ value: string }>(sql.raw(unmapped.sql)),
    tx.execute<{ value: string }>(sql.raw(duplicated.sql)),
  ]);

  return {
    usersWithoutProviderMapping: Number(unmappedRows[0]?.value ?? 0),
    usersWithMultipleMappingsSameProvider: Number(
      duplicatedRows[0]?.value ?? 0,
    ),
  };
}

export interface TenantIdShapeCounts {
  readonly nonNull: number;
  readonly matchesInternalTenantUuid: number;
  readonly matchesInternalOrganizationUuid: number;
  readonly matchesNeither: number;
}

const TENANT_ID_SHAPE_STATEMENT_ID = {
  feature_flags: 'tenant_id_shape_feature_flags',
  audit_log_settings: 'tenant_id_shape_audit_log_settings',
  audit_events: 'tenant_id_shape_audit_events',
} as const;

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
  // `tableName` is one of exactly three literal values from the closed
  // record above, never a caller-supplied string (SEC-18).
  // eslint-disable-next-line security/detect-object-injection
  const statement = getStatement(TENANT_ID_SHAPE_STATEMENT_ID[tableName]);
  const rows = await tx.execute<{
    non_null: string;
    matches_tenant: string;
    matches_organization: string;
    matches_neither: string;
  }>(sql.raw(statement.sql));

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
  const statement = getStatement('waitlist_entries_with_tenant_id_count');
  const rows = await tx.execute<{ value: string }>(sql.raw(statement.sql));

  return Number(rows[0]?.value ?? 0);
}

/** Confirms whether policies.organization_id IS NULL happens in practice. */
export async function policiesWithNullOrganizationCount(
  tx: Tx,
): Promise<number> {
  const statement = getStatement('policies_with_null_organization_count');
  const rows = await tx.execute<{ value: string }>(sql.raw(statement.sql));

  return Number(rows[0]?.value ?? 0);
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
  // Sequential, not Promise.all -- unchanged from before Phase B0's
  // refactor. Both anomaly-check functions above already ran their two
  // statements in parallel prior to this refactor, so they stayed
  // parallel; this one was already sequential, and Phase B0 must not
  // increase concurrent DB load ahead of the still-pending production
  // plan review.
  const orgs = getStatement('quota_exceeding_max_organizations');
  const orgRows = await tx.execute<{ exceeded: string }>(sql.raw(orgs.sql));
  const users = getStatement('quota_exceeding_max_users');
  const userRows = await tx.execute<{ exceeded: string }>(sql.raw(users.sql));

  return {
    tenantsExceedingMaxOrganizations: Number(orgRows[0]?.exceeded ?? 0),
    tenantsExceedingMaxUsers: Number(userRows[0]?.exceeded ?? 0),
  };
}

/**
 * Remote-only inventory execution adapter. Unlike the local scan's existing
 * helper composition, this executes each of the 15 data statements in
 * `DATA_STATEMENTS` strictly in frozen `QUERY_REGISTRY` order. The schema
 * statement is deliberately not repeated here: `cli.ts` invokes
 * `latestSchemaMigration` first and proves compatibility before entering
 * this collector, completing the full 16-statement registry in order.
 *
 * Keeping this at the raw-registry boundary prevents helper-local
 * `Promise.all` calls from relying on postgres-js pipeline scheduling while
 * preserving the local dev/test scan's established parallel behavior.
 */
export async function collectRemoteInventoryFindingsSequential(
  tx: Tx,
): Promise<RemoteInventoryFindings> {
  const rowsById = new Map<StatementId, readonly Record<string, string>[]>();
  for (const statement of DATA_STATEMENTS) {
    rowsById.set(
      statement.id,
      await tx.execute<Record<string, string>>(sql.raw(statement.sql)),
    );
  }

  const rowFor = (id: StatementId): Record<string, string> | undefined =>
    rowsById.get(id)?.[0];
  const count = (id: StatementId): number => Number(rowFor(id)?.value ?? 0);
  const exceededCount = (id: StatementId): number =>
    Number(rowFor(id)?.exceeded ?? 0);
  const tenantShape = (id: StatementId): TenantIdShapeCounts => {
    const row = rowFor(id);
    return {
      nonNull: Number(row?.non_null ?? 0),
      matchesInternalTenantUuid: Number(row?.matches_tenant ?? 0),
      matchesInternalOrganizationUuid: Number(row?.matches_organization ?? 0),
      matchesNeither: Number(row?.matches_neither ?? 0),
    };
  };

  const tenantOrg = rowFor('tenant_organization_counts');
  return {
    tenantOrgCounts: {
      zeroOrganizations: Number(tenantOrg?.zero ?? 0),
      oneOrganization: Number(tenantOrg?.one ?? 0),
      multipleOrganizations: Number(tenantOrg?.multiple ?? 0),
    },
    usersInMultipleOrgs: count('users_in_multiple_organizations_count'),
    usersInMultipleTenants: count('users_in_multiple_tenants_count'),
    orgsMissingTenantAttributes: count(
      'organizations_missing_tenant_attributes_count',
    ),
    organizationMappingAnomalies: {
      organizationsWithoutProviderMapping: count(
        'provider_organization_mapping_unmapped',
      ),
      organizationsWithMultipleMappingsSameProvider: count(
        'provider_organization_mapping_duplicated',
      ),
    },
    userMappingAnomalies: {
      usersWithoutProviderMapping: count('user_provider_mapping_unmapped'),
      usersWithMultipleMappingsSameProvider: count(
        'user_provider_mapping_duplicated',
      ),
    },
    waitlistEntriesWithTenantId: count('waitlist_entries_with_tenant_id_count'),
    policiesWithNullOrganization: count(
      'policies_with_null_organization_count',
    ),
    quotaSignal: {
      tenantsExceedingMaxOrganizations: exceededCount(
        'quota_exceeding_max_organizations',
      ),
      tenantsExceedingMaxUsers: exceededCount('quota_exceeding_max_users'),
    },
    tenantIdShape: {
      featureFlags: tenantShape('tenant_id_shape_feature_flags'),
      auditLogSettings: tenantShape('tenant_id_shape_audit_log_settings'),
      auditEvents: tenantShape('tenant_id_shape_audit_events'),
    },
  };
}
