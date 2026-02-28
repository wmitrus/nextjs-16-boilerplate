import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;

let _db: DrizzleDb | undefined;

export function getDb(): DrizzleDb {
  if (_db) return _db;

  if (process.env.DATABASE_URL) {
    _db = drizzlePostgres(
      postgres(process.env.DATABASE_URL),
    ) as unknown as DrizzleDb;
  } else {
    _db = drizzlePglite(new PGlite('.pglite')) as unknown as DrizzleDb;
  }

  return _db;
}

export const db: DrizzleDb = getDb();
