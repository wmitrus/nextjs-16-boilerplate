import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Phase B0: `REQUIRED_SELECT_TABLES` is derived from `query-registry.ts`
// (the union of every registry statement's referenced tables), not
// hand-maintained here -- see that module's doc comment. This is the one
// thing this file imports from the registry; it never touches SQL text.
import { REQUIRED_SELECT_TABLES } from './query-registry';

/**
 * OZI-79 Phase A: connection/verification plumbing only. Nothing in this
 * module is wired into a CLI command yet -- there is no `scan
 * --target=staging|production` this phase, deliberately, so that building
 * and testing this file cannot accidentally reach a real remote database.
 * Execution against either target requires a separate, explicit
 * authorization after this plumbing (and the exact query subset) has been
 * reviewed. See OZI-79.
 *
 * Deliberately a separate module from `readonly-db.ts`'s `LocalTarget`,
 * not an extension of it: no shared allowlist, no shared URL-resolution
 * function, no code path that could let a `LocalTarget` value reach a
 * remote credential or vice versa.
 */
export type RemoteTarget = 'staging' | 'production';

/**
 * One fixed, named env var per target -- never a computed/interpolated key
 * (SEC-18): `target` selects a key from this literal record, it is never
 * concatenated into an env var name. No fallback default exists for
 * either target; an unset credential must fail loudly, not silently
 * resolve to something else.
 */
const REMOTE_ENV_VAR: Record<RemoteTarget, string> = {
  staging: 'OZI79_STAGING_READONLY_DATABASE_URL',
  production: 'OZI79_PRODUCTION_READONLY_DATABASE_URL',
};

/**
 * Resolves the remote credential for `target`. Unlike
 * `scripts/lib/db-guard.mjs`'s `parsePostgresUrl` (safe only for
 * `LocalTarget`'s always-valid, non-secret hardcoded constants), this
 * NEVER echoes the raw value in an error message -- an externally
 * supplied, potentially secret-bearing, potentially operator-mistyped URL
 * must not be printed just because it failed validation.
 */
function resolveRemoteUrl(target: RemoteTarget): string {
  // `target` is the closed RemoteTarget union, not a caller-supplied
  // string -- this is a lookup in a hardcoded record, not dynamic access
  // to an open key domain (SEC-18).
  // eslint-disable-next-line security/detect-object-injection -- see comment above
  const envVar = REMOTE_ENV_VAR[target];
  // eslint-disable-next-line security/detect-object-injection, no-restricted-syntax -- envVar is one of exactly two literal values from the closed record above, never a caller-supplied string (SEC-18)
  const raw = process.env[envVar]?.trim();

  if (!raw) {
    throw new Error(
      `[tenancy-inventory] ${envVar} is required to connect to the ${target} target and was not provided.`,
    );
  }

  if (!raw.startsWith('postgres://') && !raw.startsWith('postgresql://')) {
    throw new Error(
      `[tenancy-inventory] ${envVar} must be a postgres:// or postgresql:// URL. ` +
        `(Value not shown here -- it may contain credentials.)`,
    );
  }

  return raw;
}

/** host:port/database only, via the platform URL parser -- never credentials. */
function describeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    const database = parsed.pathname.replace(/^\//, '');
    return `${parsed.hostname}:${parsed.port || '5432'}/${database}`;
  } catch {
    return '(unparseable -- value not shown, it may contain credentials)';
  }
}

export function describeRemoteTarget(target: RemoteTarget): string {
  return describeUrl(resolveRemoteUrl(target));
}

type RemoteDb = PostgresJsDatabase<Record<string, never>>;

export class RemoteRoleNotReadOnlyError extends Error {}

/**
 * Schemas this tool ever touches: `public` holds every application table;
 * `drizzle` holds only the migration-metadata table
 * (`latestSchemaMigration`'s source, see `topology-queries.ts`). Both are
 * checked for write privilege, schema-level `CREATE` (must be absent), and
 * schema-level `USAGE` (must be present).
 */
const APPLICATION_SCHEMAS = ['public', 'drizzle'] as const;

/**
 * Exported directly (not just used internally by `withReadOnlyRemoteDb`)
 * so it can be tested against a real Postgres connection independent of
 * `resolveRemoteUrl`'s env-var requirement -- see
 * `readonly-db-remote.db.test.ts`.
 *
 * Database-wide application-table least-privilege verification, not
 * representative-table sampling: every write privilege check below runs
 * against every real table in `APPLICATION_SCHEMAS` (discovered live from
 * `pg_catalog`, not a hardcoded 4-table guess), so a write grant on any
 * table -- including one nobody thought to sample -- is caught. Table
 * checks use Postgres's own `has_table_privilege()`, not a hand-rolled
 * `information_schema.role_table_grants` query filtered by
 * `grantee = current_user` -- the latter can miss a privilege the role
 * holds only through group/role membership; `has_table_privilege` resolves
 * the role's real, effective privilege including inheritance.
 *
 * The schema-level `CREATE`/`USAGE` checks use `has_schema_privilege()`
 * deliberately *inclusive* of whatever `PUBLIC` was granted: `PUBLIC`'s
 * grants are just as effective for the connected role as a role-specific
 * grant would be (Postgres does not distinguish "this role's own
 * privilege" from "a privilege every role gets through `PUBLIC`" when
 * actually enforcing access), so a database whose `public` schema still
 * has `CREATE` granted to `PUBLIC` (the pre-PG15 default; PostgreSQL's own
 * docs note databases upgraded from PG14 and earlier can still carry it)
 * genuinely does NOT hand out a SELECT-only credential to anyone connecting
 * to it, no matter how the specific role was provisioned. This tool
 * refuses to proceed in that case rather than reporting a false
 * "SELECT-only" pass -- fixing the ambient `PUBLIC` grant is a separate,
 * operational `REVOKE`, outside this tool's job (it never runs DDL).
 *
 * The role-membership check exists for the same reason: a login role that
 * is a member of another role inherits that role's privileges too
 * (`SET ROLE` or automatic inheritance), which is a hidden path to
 * whatever that other role can do. A genuinely minimal, single-purpose
 * OZI-79 credential should have no memberships at all.
 *
 * `SELECT` itself is scoped, not just write privileges: the connected
 * role must have `SELECT` on `REQUIRED_SELECT_TABLES` and nowhere else in
 * `public`/`drizzle`. A credential that can read every application table
 * (including e.g. `user_credentials`) is not the least-privilege
 * credential OZI-79 requires just because it cannot write -- read access
 * to sensitive tables the approved query set never touches is exactly the
 * kind of scope creep this check exists to catch.
 *
 * What this does NOT defend against: a writable view or a
 * `SECURITY DEFINER` function the role happens to have execute privilege
 * on. That is why the exact query allowlist still requires a separate
 * human review before any execution -- this check narrows the
 * "wrong/misconfigured role" failure mode, it does not replace reviewing
 * what the approved queries themselves touch.
 */
export async function verifyReadOnlyRole(tx: RemoteDb): Promise<void> {
  const roleRows = await tx.execute<{
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
  }>(
    sql`select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
        from pg_roles where rolname = current_user`,
  );
  const role = roleRows[0];
  const elevatedAttributes = [
    role?.rolsuper && 'rolsuper',
    role?.rolcreatedb && 'rolcreatedb',
    role?.rolcreaterole && 'rolcreaterole',
    role?.rolreplication && 'rolreplication',
    role?.rolbypassrls && 'rolbypassrls',
  ].filter((attribute): attribute is string => Boolean(attribute));
  if (elevatedAttributes.length > 0) {
    throw new RemoteRoleNotReadOnlyError(
      `Connected role has elevated attribute(s): ${elevatedAttributes.join(', ')}. ` +
        `Any of these can bypass table grants entirely, regardless of any ` +
        `explicit grant. Refusing to proceed.`,
    );
  }

  const applicationSchemaList = sql.join(
    APPLICATION_SCHEMAS.map((schema) => sql`${schema}`),
    sql`, `,
  );
  const schemaRows = await tx.execute<{
    schema: string;
    has_create: boolean;
    has_usage: boolean;
  }>(sql`
    select nspname as schema,
           has_schema_privilege(current_user, nspname, 'CREATE') as has_create,
           has_schema_privilege(current_user, nspname, 'USAGE') as has_usage
    from pg_namespace
    where nspname in (${applicationSchemaList})
  `);
  const schemaWithCreate = schemaRows.find((row) => row.has_create);
  if (schemaWithCreate) {
    throw new RemoteRoleNotReadOnlyError(
      `Connected role has effective CREATE privilege on schema ` +
        `"${schemaWithCreate.schema}" (directly, through role membership, ` +
        `or through PUBLIC). This tool requires a SELECT-only role. ` +
        `Refusing to proceed.`,
    );
  }
  const schemaMissingUsage = schemaRows.find((row) => !row.has_usage);
  if (schemaMissingUsage) {
    throw new RemoteRoleNotReadOnlyError(
      `Connected role is missing USAGE privilege on schema ` +
        `"${schemaMissingUsage.schema}", which the approved OZI-79 query ` +
        `set requires. Refusing to proceed.`,
    );
  }

  const membershipRows = await tx.execute<{ group_role: string }>(sql`
    select r2.rolname as group_role
    from pg_auth_members m
    join pg_roles r1 on r1.oid = m.member
    join pg_roles r2 on r2.oid = m.roleid
    where r1.rolname = current_user
  `);
  const membership = membershipRows[0];
  if (membership) {
    throw new RemoteRoleNotReadOnlyError(
      `Connected role is a member of role "${membership.group_role}", a ` +
        `hidden path to whatever privileges that role holds (via SET ROLE ` +
        `or automatic inheritance). A dedicated OZI-79 credential must have ` +
        `no role memberships. Refusing to proceed.`,
    );
  }

  const requiredQualifiedNames = new Set(
    REQUIRED_SELECT_TABLES.map(({ schema, table }) => `${schema}.${table}`),
  );

  // One row per table, one column per privilege -- a single round trip
  // covers every discovered table instead of one query per
  // (table, privilege) pair, and covers `SELECT` alongside the write
  // privileges so the required-table-presence check below can reuse this
  // same result set instead of a second query. Columns are explicit, not
  // built from a dynamic key lookup, so there is no object-injection sink
  // here.
  //
  // Resolved via `pg_class`/`pg_namespace` and passed to
  // `has_table_privilege` by oid, deliberately not by schema-qualified
  // text (`pg_catalog.pg_tables` + `'schema.table'::regclass`): the text
  // form makes Postgres resolve the identifier, which requires `USAGE` on
  // the containing schema -- a role legitimately never granted `USAGE` on
  // `drizzle` (it only needs `public`'s application tables) would make
  // that resolution throw "permission denied for schema", crashing this
  // check instead of cleanly reporting no privilege. The oid form needs
  // no such resolution.
  const tableRows = await tx.execute<{
    qualified_name: string;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_truncate: boolean;
    can_references: boolean;
    can_trigger: boolean;
  }>(sql`
    select
      n.nspname || '.' || c.relname as qualified_name,
      has_table_privilege(current_user, c.oid, 'SELECT') as can_select,
      has_table_privilege(current_user, c.oid, 'INSERT') as can_insert,
      has_table_privilege(current_user, c.oid, 'UPDATE') as can_update,
      has_table_privilege(current_user, c.oid, 'DELETE') as can_delete,
      has_table_privilege(current_user, c.oid, 'TRUNCATE') as can_truncate,
      has_table_privilege(current_user, c.oid, 'REFERENCES') as can_references,
      has_table_privilege(current_user, c.oid, 'TRIGGER') as can_trigger
    from pg_class c
    join pg_namespace n on c.relnamespace = n.oid
    where n.nspname in (${applicationSchemaList}) and c.relkind = 'r'
  `);
  for (const row of tableRows) {
    const writeViolation = [
      row.can_insert && 'INSERT',
      row.can_update && 'UPDATE',
      row.can_delete && 'DELETE',
      row.can_truncate && 'TRUNCATE',
      row.can_references && 'REFERENCES',
      row.can_trigger && 'TRIGGER',
    ].find((privilege): privilege is string => Boolean(privilege));
    if (writeViolation) {
      throw new RemoteRoleNotReadOnlyError(
        `Connected role has ${writeViolation} privilege on "${row.qualified_name}". ` +
          `This tool requires a SELECT-only role across every application table, ` +
          `not just a representative sample. Refusing to proceed.`,
      );
    }
    if (row.can_select && !requiredQualifiedNames.has(row.qualified_name)) {
      throw new RemoteRoleNotReadOnlyError(
        `Connected role has SELECT privilege on "${row.qualified_name}", which ` +
          `is not one of the tables the approved OZI-79 query set reads. This ` +
          `tool requires SELECT scoped to exactly the required table set, not ` +
          `every application table. Refusing to proceed.`,
      );
    }
  }

  const foundRequiredTables = new Map(
    tableRows.map((row) => [row.qualified_name, row.can_select]),
  );
  for (const { schema, table } of REQUIRED_SELECT_TABLES) {
    const qualifiedName = `${schema}.${table}`;
    const canSelect = foundRequiredTables.get(qualifiedName);
    if (canSelect === undefined) {
      throw new RemoteRoleNotReadOnlyError(
        `Table "${qualifiedName}" required by the approved OZI-79 query set ` +
          `does not exist on this target. Refusing to proceed.`,
      );
    }
    if (!canSelect) {
      throw new RemoteRoleNotReadOnlyError(
        `Connected role is missing SELECT privilege on "${qualifiedName}", ` +
          `which the approved OZI-79 query set requires. Refusing to proceed.`,
      );
    }
  }
}

/**
 * Phase A placeholders. `LocalTarget`'s values are a reasonable local
 * default for a small dev/test database; they are NOT an approved
 * production value -- OZI-79's Requirements are explicit that production
 * timeouts must be set after an `EXPLAIN`/plan review of the actual
 * approved query set against production-shaped data, not reused
 * unreviewed from here. Execution is not authorized in this phase either
 * way (see the module-level comment above).
 */
const STATEMENT_TIMEOUT_MS = 5_000;
const LOCK_TIMEOUT_MS = 2_000;
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 10_000;

/**
 * Mirrors `readonly-db.ts`'s `withReadOnlyDb` exactly (Postgres `READ
 * ONLY` transaction, `default_transaction_read_only`, connection-level
 * timeouts) plus one additional step specific to a remote, externally
 * provisioned credential: `verifyReadOnlyRole` runs first, inside the
 * same transaction, before `fn` ever sees the connection. Two independent
 * controls, not one: a `SELECT`-only DB-role grant (verified live, not
 * just trusted) AND the read-only transaction.
 */
export async function withReadOnlyRemoteDb<T>(
  target: RemoteTarget,
  fn: (tx: RemoteDb) => Promise<T>,
): Promise<T> {
  const client = postgres(resolveRemoteUrl(target), {
    connect_timeout: 10,
    connection: {
      default_transaction_read_only: true,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      lock_timeout: LOCK_TIMEOUT_MS,
      idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
  });
  const db = drizzle(client);

  try {
    return await db.transaction(
      async (tx) => {
        await verifyReadOnlyRole(tx);
        return fn(tx);
      },
      { accessMode: 'read only' },
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}
