/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_DEFAULT_URL } from '../lib/db-guard.mjs';

import { QUERY_REGISTRY, type QualifiedTable } from './query-registry';

/**
 * `statement.tables` is registry-*declared* dependency metadata (see
 * `query-registry.ts`'s doc comment) -- authored alongside the SQL, not
 * parsed out of it. This is what actually validates that declaration
 * against the real SQL: a disposable role is granted `SELECT` on exactly
 * a statement's declared tables, and plain `EXPLAIN` (never `EXPLAIN
 * ANALYZE`) must succeed under it -- proving nothing is missing. Then,
 * for each declared table in turn, its `SELECT` grant alone is revoked
 * and the same `EXPLAIN` must now fail -- proving nothing is over-
 * declared (a table listed that the SQL doesn't actually need would keep
 * passing after its own grant was removed).
 *
 * Local `test-db` only. No remote connection, no remote credential.
 */
const DEP_CHECK_ROLE = 'ozi79_dependency_check_test';

let adminClient: ReturnType<typeof postgres>;

async function dropTestRole(): Promise<void> {
  await adminClient
    .unsafe(`DROP OWNED BY ${DEP_CHECK_ROLE}`)
    .catch(() => undefined);
  await adminClient.unsafe(`DROP ROLE IF EXISTS ${DEP_CHECK_ROLE}`);
}

/** Resets the role's grants to exactly `tables` -- no more, no less. */
async function setExactSelectGrants(
  tables: readonly QualifiedTable[],
): Promise<void> {
  await adminClient.unsafe(
    `REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM ${DEP_CHECK_ROLE}`,
  );
  await adminClient.unsafe(
    `REVOKE SELECT ON ALL TABLES IN SCHEMA drizzle FROM ${DEP_CHECK_ROLE}`,
  );
  for (const { schema, table } of tables) {
    await adminClient.unsafe(
      `GRANT SELECT ON ${schema}.${table} TO ${DEP_CHECK_ROLE}`,
    );
  }
}

async function explainAsDepCheckRole(
  statementSql: string,
): Promise<{ ok: boolean; message?: string }> {
  const url = new URL(TEST_DEFAULT_URL);
  url.username = DEP_CHECK_ROLE;
  url.password = 'ozi79-test-only';
  const client = postgres(url.toString(), { connect_timeout: 10 });
  const db = drizzle(client);

  try {
    await db.execute(sql`explain ${sql.raw(statementSql)}`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}

beforeAll(async () => {
  adminClient = postgres(TEST_DEFAULT_URL, { connect_timeout: 10 });
  await dropTestRole();
  await adminClient.unsafe(
    `CREATE ROLE ${DEP_CHECK_ROLE} LOGIN PASSWORD 'ozi79-test-only'`,
  );
  await adminClient.unsafe(`GRANT USAGE ON SCHEMA public TO ${DEP_CHECK_ROLE}`);
  await adminClient.unsafe(
    `GRANT USAGE ON SCHEMA drizzle TO ${DEP_CHECK_ROLE}`,
  );
});

afterAll(async () => {
  await dropTestRole();
  await adminClient.end({ timeout: 5 });
});

describe('statement.tables matches actual SQL dependencies (real DB, local test-db only)', () => {
  it.each(
    QUERY_REGISTRY.map((statement) => [statement.id, statement] as const),
  )(
    'plain-EXPLAINs successfully under a role granted SELECT on exactly its declared tables: %s',
    async (_id, statement) => {
      await setExactSelectGrants(statement.tables);
      const result = await explainAsDepCheckRole(statement.sql);
      expect(result.ok, result.message).toBe(true);
    },
  );

  const removalCases = QUERY_REGISTRY.flatMap((statement) =>
    statement.tables.map((missingTable) => ({
      title: `${statement.id} fails without SELECT on ${missingTable.schema}.${missingTable.table}`,
      statement,
      missingTable,
    })),
  );

  it.each(removalCases)('$title', async ({ statement, missingTable }) => {
    await setExactSelectGrants(statement.tables);
    await adminClient.unsafe(
      `REVOKE SELECT ON ${missingTable.schema}.${missingTable.table} FROM ${DEP_CHECK_ROLE}`,
    );
    const result = await explainAsDepCheckRole(statement.sql);
    expect(
      result.ok,
      `expected ${statement.id} to fail EXPLAIN without SELECT on ` +
        `${missingTable.schema}.${missingTable.table} -- it did not, meaning ` +
        `that table is declared but not actually required`,
    ).toBe(false);
  });
});
