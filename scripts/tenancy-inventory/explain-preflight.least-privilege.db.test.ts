/** @vitest-environment node */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_DEFAULT_URL } from '../lib/db-guard.mjs';

import { collectExplainPreflightFacts } from './explain-preflight';
import { REQUIRED_SELECT_TABLES } from './query-registry';
import { verifyReadOnlyRole } from './readonly-db-remote';

/**
 * The end-to-end integration proof Phase B1's security review asked for:
 * a disposable role scoped to exactly what a real `RemoteTarget`
 * credential is required to be (`USAGE` on `public`/`drizzle`, `SELECT`
 * on exactly `REQUIRED_SELECT_TABLES`, no memberships, no write
 * privilege anywhere) must (a) pass `verifyReadOnlyRole` -- the same
 * live least-privilege check `withReadOnlyRemoteDb` runs before any
 * query -- and (b) then actually be sufficient for
 * `collectExplainPreflightFacts` to succeed, all inside one real
 * Postgres `READ ONLY` transaction. Local `test-db` only; this test
 * never imports/calls `withReadOnlyRemoteDb`,`describeRemoteTarget`, or
 * connects to anything remote -- it proves the *mechanism* the same way
 * `readonly-db-remote.db.test.ts`/`query-registry.dependencies.db.test.ts`
 * already do, by exercising it against a real, disposable local role.
 */
const LEAST_PRIVILEGE_ROLE = 'ozi79_b1_least_privilege_test';

let adminClient: ReturnType<typeof postgres>;
/**
 * Whether `PUBLIC` held `CREATE` on `public` *before* this suite touched
 * anything -- captured so `afterAll` restores the exact pre-suite state
 * instead of unconditionally granting it back (mirrors
 * `readonly-db-remote.db.test.ts`'s established pattern).
 */
let publicHadCreateBeforeSuite = false;

async function dropTestRole(): Promise<void> {
  await adminClient
    .unsafe(`DROP OWNED BY ${LEAST_PRIVILEGE_ROLE}`)
    .catch(() => undefined);
  await adminClient.unsafe(`DROP ROLE IF EXISTS ${LEAST_PRIVILEGE_ROLE}`);
}

beforeAll(async () => {
  adminClient = postgres(TEST_DEFAULT_URL, { connect_timeout: 10 });
  await dropTestRole();

  const [{ has_create: publicHadCreate }] = await adminClient.unsafe<
    { has_create: boolean }[]
  >(`select has_schema_privilege('public', 'public', 'CREATE') as has_create`);
  publicHadCreateBeforeSuite = publicHadCreate;
  if (publicHadCreateBeforeSuite) {
    await adminClient.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  }

  await adminClient.unsafe(
    `CREATE ROLE ${LEAST_PRIVILEGE_ROLE} LOGIN PASSWORD 'ozi79-test-only'`,
  );
  await adminClient.unsafe(
    `GRANT USAGE ON SCHEMA public TO ${LEAST_PRIVILEGE_ROLE}`,
  );
  await adminClient.unsafe(
    `GRANT USAGE ON SCHEMA drizzle TO ${LEAST_PRIVILEGE_ROLE}`,
  );
  for (const { schema, table } of REQUIRED_SELECT_TABLES) {
    await adminClient.unsafe(
      `GRANT SELECT ON ${schema}.${table} TO ${LEAST_PRIVILEGE_ROLE}`,
    );
  }
});

afterAll(async () => {
  await dropTestRole();
  if (publicHadCreateBeforeSuite) {
    await adminClient.unsafe(`GRANT CREATE ON SCHEMA public TO PUBLIC`);
  }
  await adminClient.end({ timeout: 5 });
});

describe('least-privilege integration (real DB, local test-db only)', () => {
  it('verifyReadOnlyRole accepts the disposable role, then collectExplainPreflightFacts succeeds inside the same READ ONLY transaction', async () => {
    const url = new URL(TEST_DEFAULT_URL);
    url.username = LEAST_PRIVILEGE_ROLE;
    url.password = 'ozi79-test-only';
    const client = postgres(url.toString(), { connect_timeout: 10 });
    const db = drizzle(client);

    try {
      const facts = await db.transaction(
        async (tx) => {
          // (a) the same live least-privilege check withReadOnlyRemoteDb
          // runs before any query -- must accept this role.
          await verifyReadOnlyRole(tx);
          // (b) then the actual Phase B1 collection, in the same
          // transaction, against the same minimally scoped role.
          return collectExplainPreflightFacts(tx);
        },
        { accessMode: 'read only' },
      );

      expect(facts.requiredRelationStats).toHaveLength(
        REQUIRED_SELECT_TABLES.length,
      );
      expect(facts.statementPlans).toHaveLength(16);
      for (const stat of facts.requiredRelationStats) {
        expect(typeof stat.estimatedRowCount).toBe('number');
      }
      for (const plan of facts.statementPlans) {
        expect(plan.rawPlan).toBeTruthy();
      }
    } finally {
      await client.end({ timeout: 5 });
    }
  });
});
