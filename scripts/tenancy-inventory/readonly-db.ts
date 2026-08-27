import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  DEV_DEFAULT_URL,
  TEST_DEFAULT_URL,
  parsePostgresUrl,
} from '../lib/db-guard.mjs';

/**
 * OZI-75 local/schema pass: only these two local containers are authorized.
 * No arbitrary `DATABASE_URL`/`--url` input is accepted anywhere in this
 * tool -- the connection target is always one of these two fixed constants,
 * never a caller-supplied string. Staging/production require a separate,
 * explicitly authorized follow-up; do not add a third target here without
 * that authorization.
 */
export type LocalTarget = 'dev' | 'test';

function resolveLocalUrl(target: LocalTarget): string {
  return target === 'dev' ? DEV_DEFAULT_URL : TEST_DEFAULT_URL;
}

/**
 * Logs only host/port/database, mirroring `scripts/db-ops.mjs`'s
 * `logTarget` -- never the credentials embedded in the connection string.
 */
export function describeLocalTarget(target: LocalTarget): string {
  const parsed = parsePostgresUrl(resolveLocalUrl(target));
  return `${parsed.host}:${parsed.port}/${parsed.database}`;
}

type ReadOnlyDb = PostgresJsDatabase<Record<string, never>>;

/**
 * Runs `fn` inside a genuine Postgres `READ ONLY` transaction
 * (`SET TRANSACTION READ ONLY`, drizzle-orm's `accessMode: 'read only'`).
 * This is engine-level enforcement, not an application-level promise: the
 * server itself rejects any `INSERT`/`UPDATE`/`DELETE`/DDL attempted inside
 * the transaction with Postgres error `25006`
 * (`cannot execute ... in a read-only transaction`), and the whole
 * transaction is rolled back regardless of what `fn` returns -- no
 * diagnostic query in this tool can ever durably change data.
 *
 * `fn` receives the transaction handle directly; nothing in this module
 * hands out a writable `db`/`client` reference, so there is no way for a
 * future query added to this tool to bypass this wrapper by construction.
 *
 * Connects directly with `postgres`/`drizzle` rather than
 * `@/core/db/drivers/create-postgres` -- that helper's return type is the
 * app-wide `DrizzleDb` union (it also covers PGlite), which would erase the
 * `accessMode` transaction option this wrapper depends on. This tool is
 * Postgres-only by design (see `LocalTarget`), so it keeps the concrete
 * `PostgresJsDatabase` type instead.
 */
export async function withReadOnlyDb<T>(
  target: LocalTarget,
  fn: (tx: ReadOnlyDb) => Promise<T>,
): Promise<T> {
  const client = postgres(resolveLocalUrl(target), { connect_timeout: 10 });
  const db = drizzle(client);

  try {
    return await db.transaction((tx) => fn(tx), { accessMode: 'read only' });
  } finally {
    await client.end({ timeout: 5 });
  }
}
