import { createHash } from 'node:crypto';

/**
 * OZI-79 Phase B0: the single canonical source of every SQL statement this
 * tool ever runs against tenant/organization data -- 15 data statements
 * (the frozen 12-check allowlist; three of the twelve checks issue two
 * statements each) plus 1 schema-metadata statement
 * (`latest_schema_migration`). Every consumer -- `topology-queries.ts`'s
 * typed wrapper functions, the future plain-`EXPLAIN` preflight, and the
 * future inventory-scan execution -- reads from this one registry instead
 * of owning its own copy of the SQL text, so there is no way for "what got
 * reviewed" and "what actually runs" to drift apart.
 *
 * Deep-frozen (`Object.freeze` at every level: the registry array, each
 * statement object, each statement's `tables` array, and each individual
 * `QualifiedTable` object within it) so a runtime mutation attempt throws
 * in strict mode rather than silently succeeding.
 */

export type ApplicationSchema = 'public' | 'drizzle';

export interface QualifiedTable {
  readonly schema: ApplicationSchema;
  readonly table: string;
}

export type DataStatementId =
  | 'tenant_organization_counts'
  | 'users_in_multiple_organizations_count'
  | 'users_in_multiple_tenants_count'
  | 'organizations_missing_tenant_attributes_count'
  | 'provider_organization_mapping_unmapped'
  | 'provider_organization_mapping_duplicated'
  | 'user_provider_mapping_unmapped'
  | 'user_provider_mapping_duplicated'
  | 'tenant_id_shape_feature_flags'
  | 'tenant_id_shape_audit_log_settings'
  | 'tenant_id_shape_audit_events'
  | 'waitlist_entries_with_tenant_id_count'
  | 'policies_with_null_organization_count'
  | 'quota_exceeding_max_organizations'
  | 'quota_exceeding_max_users';

export type MetadataStatementId = 'latest_schema_migration';

export type StatementId = DataStatementId | MetadataStatementId;

export interface QueryStatement {
  readonly id: StatementId;
  readonly kind: 'data' | 'metadata';
  /** Which OZI-75/OZI-79 check function this statement backs. */
  readonly description: string;
  /**
   * Fully static, parameter-free SQL text -- every value in it is a
   * hardcoded literal authored here, never caller/request input, so
   * running it via `sql.raw()` carries no injection surface (SEC-18-style
   * closed authorship, not runtime-open). Every application relation is
   * schema-qualified with `public.` (and the one metadata statement with
   * `drizzle.`) so the statement's meaning does not depend on the
   * connecting role's `search_path` -- a hardened remote role may not
   * have `public` on its search_path at all.
   */
  readonly sql: string;
  /**
   * The exact set of tables this statement reads -- declared here
   * alongside the SQL, not parsed out of it. This is registry-declared
   * dependency metadata; `query-registry.dependencies.db.test.ts` is what
   * actually *validates* it against the real SQL (a disposable role
   * granted `SELECT` on exactly these tables must be able to plain-
   * `EXPLAIN` the statement, and revoking any one of them must break
   * that), against local `test-db` only.
   */
  readonly tables: readonly QualifiedTable[];
}

const UUID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/**
 * Shared shape for the three `tenant_id_shape_*` statements -- same
 * template, three fixed table names baked in at registry-build time. This
 * is the one place the registry generates text via a helper rather than
 * three independent literals; the *result* is still three concrete,
 * frozen strings, not a runtime template. `table` is schema-qualified in
 * the `from` clause (`public."${table}"`); the `where`/`exists` clauses
 * reference it by its resulting bare correlation name (`"${table}"`),
 * which is the standard, unambiguous way to refer back to a schema-
 * qualified relation that was not given an explicit alias.
 */
function tenantIdShapeSql(table: string): string {
  return `
    select
      count(*) filter (where tenant_id is not null) as non_null,
      count(*) filter (
        where tenant_id is not null
          and tenant_id ~* '${UUID_PATTERN}'
          and exists (select 1 from public.tenants where tenants.id::text = "${table}".tenant_id)
      ) as matches_tenant,
      count(*) filter (
        where tenant_id is not null
          and tenant_id ~* '${UUID_PATTERN}'
          and exists (select 1 from public.organizations where organizations.id::text = "${table}".tenant_id)
      ) as matches_organization,
      count(*) filter (
        where tenant_id is not null
          and not (
            tenant_id ~* '${UUID_PATTERN}'
            and (
              exists (select 1 from public.tenants where tenants.id::text = "${table}".tenant_id)
              or exists (select 1 from public.organizations where organizations.id::text = "${table}".tenant_id)
            )
          )
      ) as matches_neither
    from public."${table}"
  `;
}

const REGISTRY: readonly QueryStatement[] = [
  {
    id: 'latest_schema_migration',
    kind: 'metadata',
    description:
      'Latest applied migration id/hash from drizzle bookkeeping -- evidence metadata, not a finding.',
    sql: `select id, hash from drizzle.__drizzle_migrations order by id desc limit 1`,
    tables: [{ schema: 'drizzle', table: '__drizzle_migrations' }],
  },
  {
    id: 'tenant_organization_counts',
    kind: 'data',
    description:
      'S1/S2: buckets every tenant by how many organizations it has.',
    sql: `
      select
        count(*) filter (where org_count = 0) as zero,
        count(*) filter (where org_count = 1) as one,
        count(*) filter (where org_count > 1) as multiple
      from (
        select t.id, count(o.id) as org_count
        from public.tenants t
        left join public.organizations o on o.tenant_id = t.id
        group by t.id
      ) per_tenant
    `,
    tables: [
      { schema: 'public', table: 'tenants' },
      { schema: 'public', table: 'organizations' },
    ],
  },
  {
    id: 'users_in_multiple_organizations_count',
    kind: 'data',
    description: 'S4: users holding membership in more than one organization.',
    sql: `
      select count(*) as value from (
        select user_id
        from public.memberships
        group by user_id
        having count(distinct organization_id) > 1
      ) users_with_multiple_orgs
    `,
    tables: [{ schema: 'public', table: 'memberships' }],
  },
  {
    id: 'users_in_multiple_tenants_count',
    kind: 'data',
    description:
      'S4 (tenant-level): users whose memberships span more than one tenant.',
    sql: `
      select count(*) as value from (
        select m.user_id
        from public.memberships m
        join public.organizations o on o.id = m.organization_id
        group by m.user_id
        having count(distinct o.tenant_id) > 1
      ) users_with_multiple_tenants
    `,
    tables: [
      { schema: 'public', table: 'memberships' },
      { schema: 'public', table: 'organizations' },
    ],
  },
  {
    id: 'organizations_missing_tenant_attributes_count',
    kind: 'data',
    description: 'S3: organizations whose tenant has no tenant_attributes row.',
    sql: `
      select count(*) as value
      from public.organizations
      where not exists (
        select 1 from public.tenant_attributes
        where tenant_attributes.tenant_id = organizations.tenant_id
      )
    `,
    tables: [
      { schema: 'public', table: 'organizations' },
      { schema: 'public', table: 'tenant_attributes' },
    ],
  },
  {
    id: 'provider_organization_mapping_unmapped',
    kind: 'data',
    description:
      'S5: organizations with no auth_organization_identities mapping.',
    sql: `
      select count(*) as value
      from public.organizations
      where not exists (
        select 1 from public.auth_organization_identities
        where auth_organization_identities.organization_id = organizations.id
      )
    `,
    tables: [
      { schema: 'public', table: 'organizations' },
      { schema: 'public', table: 'auth_organization_identities' },
    ],
  },
  {
    id: 'provider_organization_mapping_duplicated',
    kind: 'data',
    description:
      'S5: organizations with more than one mapping for the same provider.',
    sql: `
      select count(*) as value from (
        select organization_id, provider
        from public.auth_organization_identities
        group by organization_id, provider
        having count(*) > 1
      ) orgs_with_multiple_mappings_same_provider
    `,
    tables: [{ schema: 'public', table: 'auth_organization_identities' }],
  },
  {
    id: 'user_provider_mapping_unmapped',
    kind: 'data',
    description:
      'The auth_user_identities counterpart: users with no provider mapping.',
    sql: `
      select count(*) as value
      from public.users
      where not exists (
        select 1 from public.auth_user_identities
        where auth_user_identities.user_id = users.id
      )
    `,
    tables: [
      { schema: 'public', table: 'users' },
      { schema: 'public', table: 'auth_user_identities' },
    ],
  },
  {
    id: 'user_provider_mapping_duplicated',
    kind: 'data',
    description: 'Users with more than one mapping for the same provider.',
    sql: `
      select count(*) as value from (
        select user_id, provider
        from public.auth_user_identities
        group by user_id, provider
        having count(*) > 1
      ) users_with_multiple_mappings_same_provider
    `,
    tables: [{ schema: 'public', table: 'auth_user_identities' }],
  },
  {
    id: 'tenant_id_shape_feature_flags',
    kind: 'data',
    description:
      'S6: feature_flags.tenant_id shape -- internal tenant vs organization vs neither.',
    sql: tenantIdShapeSql('feature_flags'),
    tables: [
      { schema: 'public', table: 'feature_flags' },
      { schema: 'public', table: 'tenants' },
      { schema: 'public', table: 'organizations' },
    ],
  },
  {
    id: 'tenant_id_shape_audit_log_settings',
    kind: 'data',
    description: 'S6: audit_log_settings.tenant_id shape.',
    sql: tenantIdShapeSql('audit_log_settings'),
    tables: [
      { schema: 'public', table: 'audit_log_settings' },
      { schema: 'public', table: 'tenants' },
      { schema: 'public', table: 'organizations' },
    ],
  },
  {
    id: 'tenant_id_shape_audit_events',
    kind: 'data',
    description: 'S6: audit_events.tenant_id shape.',
    sql: tenantIdShapeSql('audit_events'),
    tables: [
      { schema: 'public', table: 'audit_events' },
      { schema: 'public', table: 'tenants' },
      { schema: 'public', table: 'organizations' },
    ],
  },
  {
    id: 'waitlist_entries_with_tenant_id_count',
    kind: 'data',
    description:
      'Whether waitlist_entries.tenant_id (unused by app code) is ever set.',
    sql: `select count(*) as value from public.waitlist_entries where tenant_id is not null`,
    tables: [{ schema: 'public', table: 'waitlist_entries' }],
  },
  {
    id: 'policies_with_null_organization_count',
    kind: 'data',
    description:
      'Whether policies.organization_id IS NULL happens in practice.',
    sql: `select count(*) as value from public.policies where organization_id is null`,
    tables: [{ schema: 'public', table: 'policies' }],
  },
  {
    id: 'quota_exceeding_max_organizations',
    kind: 'data',
    description:
      'S7: tenants whose organization count observably exceeds tenant_attributes.max_organizations.',
    sql: `
      select count(*) as exceeded from (
        select ta.tenant_id
        from public.tenant_attributes ta
        join public.organizations o on o.tenant_id = ta.tenant_id
        group by ta.tenant_id, ta.max_organizations
        having count(o.id) > ta.max_organizations
      ) t
    `,
    tables: [
      { schema: 'public', table: 'tenant_attributes' },
      { schema: 'public', table: 'organizations' },
    ],
  },
  {
    id: 'quota_exceeding_max_users',
    kind: 'data',
    description:
      'S7: tenants whose distinct-user count observably exceeds tenant_attributes.max_users.',
    sql: `
      select count(*) as exceeded from (
        select ta.tenant_id
        from public.tenant_attributes ta
        join public.organizations o on o.tenant_id = ta.tenant_id
        join public.memberships m on m.organization_id = o.id
        group by ta.tenant_id, ta.max_users
        having count(distinct m.user_id) > ta.max_users
      ) t
    `,
    tables: [
      { schema: 'public', table: 'tenant_attributes' },
      { schema: 'public', table: 'organizations' },
      { schema: 'public', table: 'memberships' },
    ],
  },
];

export const QUERY_REGISTRY: readonly QueryStatement[] = Object.freeze(
  REGISTRY.map((statement) =>
    Object.freeze({
      ...statement,
      tables: Object.freeze(
        statement.tables.map((table) => Object.freeze({ ...table })),
      ),
    }),
  ),
);

export const DATA_STATEMENTS: readonly QueryStatement[] = Object.freeze(
  QUERY_REGISTRY.filter((statement) => statement.kind === 'data'),
);

export const METADATA_STATEMENTS: readonly QueryStatement[] = Object.freeze(
  QUERY_REGISTRY.filter((statement) => statement.kind === 'metadata'),
);

const BY_ID = new Map(
  QUERY_REGISTRY.map((statement) => [statement.id, statement]),
);

export function getStatement(id: StatementId): QueryStatement {
  const statement = BY_ID.get(id);
  if (!statement) {
    // Unreachable given StatementId is a closed union checked at compile
    // time -- defensive only, e.g. against a future refactor typo TS
    // somehow doesn't catch at the call site.
    throw new Error(`[tenancy-inventory] Unknown query statement id "${id}".`);
  }
  return statement;
}

/**
 * Every table any registry statement declares as a dependency,
 * deduplicated -- the single source `verifyReadOnlyRole`'s required-
 * `SELECT` check and the test fixture's baseline grants both consume, so
 * the DB-role verifier, test provisioning, and the executable query set
 * cannot silently drift from each other or from the registry itself.
 *
 * This is registry-*declared* metadata (each statement's `tables` field,
 * authored alongside its `sql`), not something parsed out of the SQL
 * text -- there is no SQL parser here. What makes that declaration
 * trustworthy is `query-registry.dependencies.db.test.ts`: a real-Postgres
 * test, local `test-db` only, that grants a disposable role `SELECT` on
 * exactly each statement's declared tables and proves (a) the statement
 * plain-`EXPLAIN`s successfully under that role, and (b) removing any one
 * declared table's `SELECT` breaks it. That test is what actually
 * validates this list against the real SQL; this constant is only its
 * declared, deduplicated union.
 */
export const REQUIRED_SELECT_TABLES: readonly QualifiedTable[] = Object.freeze(
  (() => {
    const seen = new Set<string>();
    const result: QualifiedTable[] = [];
    for (const statement of QUERY_REGISTRY) {
      for (const table of statement.tables) {
        const key = `${table.schema}.${table.table}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(table);
        }
      }
    }
    return result;
  })(),
);

/**
 * The exact, canonical representation a statement's fingerprint is
 * computed over: its id, kind, verbatim SQL bytes (no normalization --
 * see `statementFingerprint`'s doc comment), and its declared table
 * dependencies as a sorted, deduplicated set (order-independent, but
 * membership-sensitive). `description` is deliberately excluded -- it is
 * documentation, not a security-relevant property of what the statement
 * does.
 */
function canonicalStatementRepresentation(statement: QueryStatement): string {
  const tables = [...statement.tables]
    .map((table) => `${table.schema}.${table.table}`)
    .sort();
  return JSON.stringify({
    id: statement.id,
    kind: statement.kind,
    sql: statement.sql,
    tables,
  });
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * A statement's fingerprint changes if and only if its id, kind, declared
 * table set, or SQL changes -- including a change that is *only*
 * whitespace, since whitespace can be semantically load-bearing in SQL
 * (inside a quoted string literal, or around a `--` line comment, where
 * collapsing a real newline to a space silently changes which text the
 * comment swallows). This fingerprints the exact bytes `sql.raw(statement
 * .sql)` will execute -- anything less than that would let two statements
 * that mean different things collide onto the same fingerprint, which
 * would defeat the entire point of binding an approved `EXPLAIN` artifact
 * to what actually runs later. See `query-registry.test.ts`'s "no
 * whitespace normalization" suite for concrete collision regressions this
 * guards against.
 */
export function statementFingerprint(statement: QueryStatement): string {
  return sha256(canonicalStatementRepresentation(statement));
}

export interface StatementFingerprintEntry {
  readonly id: StatementId;
  readonly fingerprint: string;
}

export function allStatementFingerprints(): readonly StatementFingerprintEntry[] {
  return QUERY_REGISTRY.map((statement) => ({
    id: statement.id,
    fingerprint: statementFingerprint(statement),
  }));
}

/**
 * One fingerprint for the whole registry, meant to be recorded on a future
 * approved plain-`EXPLAIN` artifact and re-checked before the later
 * inventory scan runs -- if this value differs from what was approved,
 * something in the query set changed since the plan was reviewed, and the
 * scan must not proceed on the strength of the old approval.
 *
 * Deterministic regardless of `QUERY_REGISTRY`'s declaration order: the
 * per-statement fingerprints are sorted by id before combining, so only a
 * real change to the statement set or its content can change this value,
 * not an incidental reordering of the array literal above.
 */
export function registryFingerprint(): string {
  const sorted = [...allStatementFingerprints()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const combined = sorted
    .map(({ id, fingerprint }) => `${id}:${fingerprint}`)
    .join('\n');
  return sha256(combined);
}
