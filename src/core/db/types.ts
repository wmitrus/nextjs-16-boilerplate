import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export type DrizzleDb =
  | PostgresJsDatabase<Record<string, never>>
  | PgliteDatabase<Record<string, never>>;

export type DbProvider = 'drizzle' | 'prisma';
export type DbDriver = 'pglite' | 'postgres';

export interface DbRuntime {
  db: DrizzleDb;
  close?: () => Promise<void>;
}

export interface DbConfig {
  provider: DbProvider;
  driver: DbDriver;
  url?: string;
}
