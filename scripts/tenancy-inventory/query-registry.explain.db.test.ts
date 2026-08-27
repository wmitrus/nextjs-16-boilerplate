/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { QUERY_REGISTRY } from './query-registry';
import { withReadOnlyDb } from './readonly-db';

/**
 * Phase B0: proves every one of the 16 registry statements is valid,
 * plannable Postgres SQL -- against local `test-db` only, plain `EXPLAIN`
 * only (never `EXPLAIN ANALYZE`, which would actually execute the query).
 *
 * This is NOT the production plan review OZI-79's runbook still requires
 * before any remote execution -- it only proves the statements are
 * syntactically and semantically valid against this repo's real schema,
 * catching e.g. a typo'd column/table name here rather than at first real
 * use. No remote connection, no staging/production CLI command, and no
 * remote credential exist anywhere in this change.
 */
describe('QUERY_REGISTRY statements (real DB, plain EXPLAIN only)', () => {
  it.each(
    QUERY_REGISTRY.map((statement) => [statement.id, statement.sql] as const),
  )('EXPLAINs cleanly: %s', async (_id, statementSql) => {
    const rows = await withReadOnlyDb('test', (tx) =>
      tx.execute<{ 'QUERY PLAN': string }>(
        sql`explain ${sql.raw(statementSql)}`,
      ),
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
