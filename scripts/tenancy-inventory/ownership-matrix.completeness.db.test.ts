/** @vitest-environment node */
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { TABLE_OWNERSHIP } from './ownership-matrix';
import { withReadOnlyDb } from './readonly-db';

/**
 * Guards against exactly the drift the ownership matrix cannot protect
 * itself from: it is hand-authored from a schema read at one point in
 * time, so a later migration that adds/renames/drops a table would leave
 * it silently stale. This test derives the *actual* live table list from
 * `pg_catalog` (not from re-reading the same Drizzle schema files the
 * matrix was built from -- that would just check the matrix against
 * itself) and diffs it against `TABLE_OWNERSHIP`, so a 22nd table added a
 * month from now fails this test instead of `tenancy-inventory` silently
 * reporting a stale matrix as "complete".
 */
describe('TABLE_OWNERSHIP completeness (real DB)', () => {
  it('has exactly one row for every real table, and no extra rows', async () => {
    const liveTables = await withReadOnlyDb('test', async (tx) => {
      // `drizzle`'s own bookkeeping schema is `drizzle`, not `public`, so
      // this naturally excludes `__drizzle_migrations` without an explicit
      // exclusion list.
      const rows = await tx.execute<{ tablename: string }>(
        sql`select tablename from pg_catalog.pg_tables where schemaname = 'public'`,
      );
      return rows.map((row) => row.tablename);
    });

    const matrixTables = TABLE_OWNERSHIP.map((row) => row.table);

    const missingFromMatrix = liveTables.filter(
      (name) => !matrixTables.includes(name),
    );
    const staleInMatrix = matrixTables.filter(
      (name) => !liveTables.includes(name),
    );
    const duplicatesInMatrix = matrixTables.filter(
      (name, index) => matrixTables.indexOf(name) !== index,
    );

    expect(
      missingFromMatrix,
      `Live tables missing from TABLE_OWNERSHIP: ${missingFromMatrix.join(', ')}`,
    ).toEqual([]);
    expect(
      staleInMatrix,
      `TABLE_OWNERSHIP rows for tables that no longer exist: ${staleInMatrix.join(', ')}`,
    ).toEqual([]);
    expect(
      duplicatesInMatrix,
      `TABLE_OWNERSHIP has duplicate rows for: ${duplicatesInMatrix.join(', ')}`,
    ).toEqual([]);
  });
});
