import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type DrizzleDb = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type DbProvider = 'drizzle' | 'prisma';
export type DbDriver = 'pglite' | 'postgres';

export interface DbConfig {
  provider: DbProvider;
  driver: DbDriver;
  url?: string;
}
