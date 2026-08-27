/** @vitest-environment node */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_DEFAULT_URL } from '../lib/db-guard.mjs';

import { REQUIRED_SELECT_TABLES } from './query-registry';
import {
  RemoteRoleNotReadOnlyError,
  verifyReadOnlyRole,
} from './readonly-db-remote';

/**
 * `verifyReadOnlyRole` is the mechanism `withReadOnlyRemoteDb` depends on
 * to catch a misconfigured remote credential live, rather than trusting
 * how it was provisioned. Tested here against the local `test-db` (safe,
 * disposable) rather than a real remote target -- proving the rejection
 * path (superuser, elevated attributes, a write grant anywhere across the
 * full application-table surface, missing required SELECT/USAGE, SELECT
 * outside the required table set, schema CREATE including via PUBLIC,
 * role membership) and the pass path (a real, purpose-created
 * SELECT-only role scoped to exactly the required tables, with no
 * memberships) is equally strong evidence for the detection logic
 * itself, without needing an actual remote credential.
 */
const READONLY_TEST_ROLE = 'ozi79_readonly_role_test';

let adminClient: ReturnType<typeof postgres>;
/**
 * Whether `PUBLIC` held `CREATE` on `public` *before* this suite touched
 * anything -- captured so `afterAll` restores the exact pre-suite state
 * instead of unconditionally granting it back. A hardened database that
 * never had this ambient grant must not gain it as a side effect of
 * running these tests.
 */
let publicHadCreateBeforeSuite = false;

/**
 * A granted privilege is a dependent object of the granting relationship
 * in Postgres's own bookkeeping -- `DROP ROLE` alone fails with
 * "cannot be dropped because some objects depend on it" while the role
 * still holds any grant. `DROP OWNED BY` revokes everything the role
 * holds (and drops anything it owns) first, which is Postgres's own
 * documented pattern for tearing down a role cleanly.
 */
async function dropTestRole(role: string): Promise<void> {
  await adminClient.unsafe(`DROP OWNED BY ${role}`).catch(() => undefined);
  await adminClient.unsafe(`DROP ROLE IF EXISTS ${role}`);
}

/**
 * The exact set of grants a correctly provisioned OZI-79 credential needs
 * -- `SELECT` on exactly `REQUIRED_SELECT_TABLES`, nothing more. Built
 * from the same exported list `verifyReadOnlyRole` checks against, so the
 * fixture can never silently drift from what the check actually requires.
 * Individual tests build on this baseline and vary or omit exactly the
 * one grant they're testing, so a failure proves the specific check under
 * test fired -- not some other, unrelated gap or excess in the baseline.
 */
async function grantBaselineSelectOnly(role: string): Promise<void> {
  await adminClient.unsafe(`GRANT USAGE ON SCHEMA drizzle TO ${role}`);
  for (const { schema, table } of REQUIRED_SELECT_TABLES) {
    await adminClient.unsafe(`GRANT SELECT ON ${schema}.${table} TO ${role}`);
  }
}

async function connectAs(role: string): Promise<ReturnType<typeof postgres>> {
  const url = new URL(TEST_DEFAULT_URL);
  url.username = role;
  url.password = 'ozi79-test-only';
  return postgres(url.toString(), { connect_timeout: 10 });
}

beforeAll(async () => {
  adminClient = postgres(TEST_DEFAULT_URL, { connect_timeout: 10 });
  // Idempotent: drop first in case a previous run crashed before cleanup.
  await dropTestRole(READONLY_TEST_ROLE);
  // Harden the schema-level ACL for the duration of this suite so a
  // "clean pass" actually proves what it claims -- this test-db, like
  // plenty of real Postgres databases that predate PG15's hardened
  // default (or never ran this REVOKE themselves), ships with PUBLIC
  // holding CREATE on `public`. Captured and restored exactly, not
  // unconditionally re-granted, in case this ever runs against a database
  // that never had the ambient grant in the first place.
  const [{ has_create: publicHadCreate }] = await adminClient.unsafe<
    { has_create: boolean }[]
  >(`select has_schema_privilege('public', 'public', 'CREATE') as has_create`);
  publicHadCreateBeforeSuite = publicHadCreate;
  if (publicHadCreateBeforeSuite) {
    await adminClient.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  }
  await adminClient.unsafe(
    `CREATE ROLE ${READONLY_TEST_ROLE} LOGIN PASSWORD 'ozi79-test-only'`,
  );
  await grantBaselineSelectOnly(READONLY_TEST_ROLE);
});

afterAll(async () => {
  await dropTestRole(READONLY_TEST_ROLE);
  if (publicHadCreateBeforeSuite) {
    await adminClient.unsafe(`GRANT CREATE ON SCHEMA public TO PUBLIC`);
  }
  await adminClient.end({ timeout: 5 });
});

describe('verifyReadOnlyRole (real DB)', () => {
  it('rejects the local superuser role', async () => {
    const client = postgres(TEST_DEFAULT_URL, { connect_timeout: 10 });
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toBeInstanceOf(RemoteRoleNotReadOnlyError);
    } finally {
      await client.end({ timeout: 5 });
    }
  });

  it('passes for a real role scoped to exactly the required tables, with no memberships', async () => {
    const client = await connectAs(READONLY_TEST_ROLE);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).resolves.toBeUndefined();
    } finally {
      await client.end({ timeout: 5 });
    }
  });

  it('rejects a role that also holds an INSERT grant', async () => {
    const roleWithWrite = 'ozi79_readwrite_role_test';
    await dropTestRole(roleWithWrite);
    await adminClient.unsafe(
      `CREATE ROLE ${roleWithWrite} LOGIN PASSWORD 'ozi79-test-only'`,
    );
    await grantBaselineSelectOnly(roleWithWrite);
    await adminClient.unsafe(
      `GRANT INSERT ON ALL TABLES IN SCHEMA public TO ${roleWithWrite}`,
    );

    const client = await connectAs(roleWithWrite);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toBeInstanceOf(RemoteRoleNotReadOnlyError);
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(roleWithWrite);
    }
  });

  /**
   * The old check only sampled `tenants`/`organizations`/`users`/
   * `memberships`. `audit_events` was never in that sample -- this proves
   * the Phase A.1 database-wide rewrite actually catches a write grant on
   * a table the old sample would have missed entirely.
   */
  it('rejects a role with UPDATE on a table the old 4-table sample never checked', async () => {
    const roleWithWrite = 'ozi79_untested_table_write_test';
    await dropTestRole(roleWithWrite);
    await adminClient.unsafe(
      `CREATE ROLE ${roleWithWrite} LOGIN PASSWORD 'ozi79-test-only'`,
    );
    await grantBaselineSelectOnly(roleWithWrite);
    await adminClient.unsafe(
      `GRANT UPDATE ON audit_events TO ${roleWithWrite}`,
    );

    const client = await connectAs(roleWithWrite);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(/UPDATE privilege on "public\.audit_events"/);
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(roleWithWrite);
    }
  });

  /**
   * The old check only ever looked for the *absence* of write privilege --
   * it never confirmed `SELECT` was actually granted. A role with zero
   * grants at all (or missing SELECT on one required table) would have
   * passed the old check while being unable to run any approved query.
   */
  it('rejects a role missing SELECT on a table the approved query set requires', async () => {
    const roleMissingSelect = 'ozi79_missing_select_test';
    await dropTestRole(roleMissingSelect);
    await adminClient.unsafe(
      `CREATE ROLE ${roleMissingSelect} LOGIN PASSWORD 'ozi79-test-only'`,
    );
    await grantBaselineSelectOnly(roleMissingSelect);
    await adminClient.unsafe(
      `REVOKE SELECT ON feature_flags FROM ${roleMissingSelect}`,
    );

    const client = await connectAs(roleMissingSelect);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(/missing SELECT privilege on "public\.feature_flags"/);
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(roleMissingSelect);
    }
  });

  /**
   * The dedicated OZI-79 credential must have `SELECT` on exactly the
   * required table set, not every application table. A role that reads
   * `user_credentials` -- outside `REQUIRED_SELECT_TABLES`, and about as
   * sensitive a table as this schema has -- is not the least-privilege
   * credential OZI-79 requires just because it holds no write privilege
   * anywhere.
   */
  it('rejects a role with SELECT on a table outside the required set (user_credentials)', async () => {
    const roleWithExcessSelect = 'ozi79_excess_select_test';
    await dropTestRole(roleWithExcessSelect);
    await adminClient.unsafe(
      `CREATE ROLE ${roleWithExcessSelect} LOGIN PASSWORD 'ozi79-test-only'`,
    );
    await grantBaselineSelectOnly(roleWithExcessSelect);
    await adminClient.unsafe(
      `GRANT SELECT ON user_credentials TO ${roleWithExcessSelect}`,
    );

    const client = await connectAs(roleWithExcessSelect);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(/SELECT privilege on "public\.user_credentials"/);
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(roleWithExcessSelect);
    }
  });

  it('rejects a role explicitly granted CREATE on the public schema', async () => {
    const roleWithCreate = 'ozi79_schema_create_test';
    await dropTestRole(roleWithCreate);
    await adminClient.unsafe(
      `CREATE ROLE ${roleWithCreate} LOGIN PASSWORD 'ozi79-test-only'`,
    );
    await grantBaselineSelectOnly(roleWithCreate);
    await adminClient.unsafe(
      `GRANT CREATE ON SCHEMA public TO ${roleWithCreate}`,
    );

    const client = await connectAs(roleWithCreate);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(/effective CREATE privilege on schema "public"/);
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(roleWithCreate);
    }
  });

  /**
   * The Phase A.1 CREATE check deliberately ignored PUBLIC's own grants,
   * checking only role-specific ACL entries -- so a database whose
   * `public` schema still has CREATE granted to PUBLIC (the pre-PG15
   * default; this repo's own test-db reproduces it) would report a
   * correctly scoped role as "SELECT-only" even though every role on that
   * database, including this one, can actually CREATE TABLE. This proves
   * the Phase A.2 fix catches that ambient case: a role that is otherwise
   * exactly the passing baseline is rejected purely because PUBLIC itself
   * holds CREATE.
   */
  it('rejects a role when PUBLIC itself holds CREATE on the schema (ambient, not role-specific)', async () => {
    const client = await connectAs(READONLY_TEST_ROLE);
    const db = drizzle(client);

    await adminClient.unsafe(`GRANT CREATE ON SCHEMA public TO PUBLIC`);
    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(/effective CREATE privilege on schema "public"/);
    } finally {
      // Restores this test's own pre-test state exactly: the suite's
      // beforeAll already revoked PUBLIC's CREATE (or it never had it),
      // so a plain REVOKE here is what "back to how it was before this
      // test" actually means -- not a blind GRANT.
      await adminClient.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
      await client.end({ timeout: 5 });
    }
  });

  it('rejects a role missing USAGE on schema drizzle', async () => {
    const roleMissingUsage = 'ozi79_missing_drizzle_usage_test';
    await dropTestRole(roleMissingUsage);
    await adminClient.unsafe(
      `CREATE ROLE ${roleMissingUsage} LOGIN PASSWORD 'ozi79-test-only'`,
    );
    // Deliberately public-only: no USAGE or SELECT anywhere in `drizzle`.
    for (const { schema, table } of REQUIRED_SELECT_TABLES) {
      if (schema !== 'public') continue;
      await adminClient.unsafe(
        `GRANT SELECT ON ${schema}.${table} TO ${roleMissingUsage}`,
      );
    }

    const client = await connectAs(roleMissingUsage);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(/missing USAGE privilege on schema "drizzle"/);
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(roleMissingUsage);
    }
  });

  it('rejects a role with USAGE on drizzle but missing SELECT on __drizzle_migrations', async () => {
    const roleMissingDrizzleSelect = 'ozi79_missing_drizzle_select_test';
    await dropTestRole(roleMissingDrizzleSelect);
    await adminClient.unsafe(
      `CREATE ROLE ${roleMissingDrizzleSelect} LOGIN PASSWORD 'ozi79-test-only'`,
    );
    await grantBaselineSelectOnly(roleMissingDrizzleSelect);
    // USAGE without SELECT: can see the schema exists, cannot read the
    // one table it's required to read.
    await adminClient.unsafe(
      `REVOKE SELECT ON drizzle.__drizzle_migrations FROM ${roleMissingDrizzleSelect}`,
    );

    const client = await connectAs(roleMissingDrizzleSelect);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(
        /missing SELECT privilege on "drizzle\.__drizzle_migrations"/,
      );
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(roleMissingDrizzleSelect);
    }
  });

  /**
   * A login role that is a member of another role inherits that role's
   * privileges too -- a hidden `SET ROLE`/inheritance path to whatever the
   * group role can do, even if the login role's own direct grants are
   * exactly SELECT-only. A genuinely minimal OZI-79 credential must have
   * no memberships at all.
   */
  it('rejects a role that is a member of another role', async () => {
    const groupRole = 'ozi79_group_role_test';
    const memberRole = 'ozi79_member_role_test';
    await dropTestRole(memberRole);
    await dropTestRole(groupRole);
    await adminClient.unsafe(`CREATE ROLE ${groupRole} NOLOGIN`);
    await adminClient.unsafe(
      `CREATE ROLE ${memberRole} LOGIN PASSWORD 'ozi79-test-only' IN ROLE ${groupRole}`,
    );
    await grantBaselineSelectOnly(memberRole);

    const client = await connectAs(memberRole);
    const db = drizzle(client);

    try {
      await expect(
        db.transaction((tx) => verifyReadOnlyRole(tx)),
      ).rejects.toThrow(new RegExp(`member of role "${groupRole}"`));
    } finally {
      await client.end({ timeout: 5 });
      await dropTestRole(memberRole);
      await dropTestRole(groupRole);
    }
  });
});
