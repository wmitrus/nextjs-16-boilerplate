import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

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
 * A representative, hardcoded sample of tables -- not every table, but
 * enough to catch the realistic misconfiguration this exists to catch (a
 * role accidentally granted write access, or connecting as the wrong
 * role entirely). Uses Postgres's own `has_table_privilege()`, not a hand
 * -rolled `information_schema.role_table_grants` query filtered by
 * `grantee = current_user` -- the latter can miss a privilege the role
 * holds only through group/role membership; `has_table_privilege`
 * resolves the role's real, effective privilege including inheritance.
 *
 * What this does NOT defend against: a writable view or a
 * `SECURITY DEFINER` function the role happens to have execute privilege
 * on. That is why the exact query allowlist still requires a separate
 * human review before any execution -- this check narrows the
 * "wrong/misconfigured role" failure mode, it does not replace reviewing
 * what the approved queries themselves touch.
 */
const REPRESENTATIVE_TABLES = [
  'tenants',
  'organizations',
  'users',
  'memberships',
] as const;

const WRITE_PRIVILEGES = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
] as const;

/**
 * Exported directly (not just used internally by `withReadOnlyRemoteDb`)
 * so it can be tested against a real Postgres connection independent of
 * `resolveRemoteUrl`'s env-var requirement -- see
 * `readonly-db-remote.db.test.ts`, which proves both the rejection path
 * (against the local test-db's own superuser role) and the pass path
 * (against a real, purpose-created SELECT-only role) without needing an
 * actual remote credential.
 */
export async function verifyReadOnlyRole(tx: RemoteDb): Promise<void> {
  const superuserRows = await tx.execute<{ rolsuper: boolean }>(
    sql`select rolsuper from pg_roles where rolname = current_user`,
  );
  if (superuserRows[0]?.rolsuper) {
    throw new RemoteRoleNotReadOnlyError(
      'Connected role is a Postgres superuser, which bypasses table grants ' +
        'entirely regardless of any explicit grant. Refusing to proceed.',
    );
  }

  for (const table of REPRESENTATIVE_TABLES) {
    for (const privilege of WRITE_PRIVILEGES) {
      const rows = await tx.execute<{ has_privilege: boolean }>(
        sql`select has_table_privilege(current_user, ${table}, ${privilege}) as has_privilege`,
      );
      if (rows[0]?.has_privilege) {
        throw new RemoteRoleNotReadOnlyError(
          `Connected role has ${privilege} privilege on "${table}". This tool ` +
            `requires a SELECT-only role. Refusing to proceed.`,
        );
      }
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
