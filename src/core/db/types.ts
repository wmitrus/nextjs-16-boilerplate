import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type DbDriver = 'pglite' | 'postgres';

export interface DbConfig {
  driver: DbDriver;
  url?: string;
}
