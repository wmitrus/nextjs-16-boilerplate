/** @vitest-environment node */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_DEFAULT_URL } from '../lib/db-guard.mjs';

import {
  RemoteRoleNotReadOnlyError,
  verifyReadOnlyRole,
} from './readonly-db-remote';

/**
 * `verifyReadOnlyRole` is the mechanism `withReadOnlyRemoteDb` depends on
 * to catch a misconfigured remote credential live, rather than trusting
 * how it was provisioned. Tested here against the local `test-db`
 * (safe, disposable) rather than a real remote target -- proving both the
 * rejection path (the local superuser role) and the pass path (a real,
 * purpose-created SELECT-only role) is equally strong evidence for the
 * detection logic itself, without needing an actual remote credential.
 */
const READONLY_TEST_ROLE = 'ozi79_readonly_role_test';

let adminClient: ReturnType<typeof postgres>;

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

beforeAll(async () => {
  adminClient = postgres(TEST_DEFAULT_URL, { connect_timeout: 10 });
  // Idempotent: drop first in case a previous run crashed before cleanup.
  await dropTestRole(READONLY_TEST_ROLE);
  await adminClient.unsafe(
    `CREATE ROLE ${READONLY_TEST_ROLE} LOGIN PASSWORD 'ozi79-test-only'`,
  );
  await adminClient.unsafe(
    `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READONLY_TEST_ROLE}`,
  );
});

afterAll(async () => {
  await dropTestRole(READONLY_TEST_ROLE);
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

  it('passes for a real, purpose-created SELECT-only role', async () => {
    const url = new URL(TEST_DEFAULT_URL);
    url.username = READONLY_TEST_ROLE;
    url.password = 'ozi79-test-only';

    const client = postgres(url.toString(), { connect_timeout: 10 });
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
    await adminClient.unsafe(
      `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO ${roleWithWrite}`,
    );

    const url = new URL(TEST_DEFAULT_URL);
    url.username = roleWithWrite;
    url.password = 'ozi79-test-only';
    const client = postgres(url.toString(), { connect_timeout: 10 });
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
});
