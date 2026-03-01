import { createDb } from './create-db';
import type { DrizzleDb } from './types';

export type { DrizzleDb };

let _db: DrizzleDb | undefined;

export function getDb(): DrizzleDb {
  if (_db) return _db;

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const databaseUrl = process.env.DATABASE_URL?.trim();

  _db = createDb({
    driver: nodeEnv === 'production' ? 'postgres' : 'pglite',
    url: databaseUrl,
  });

  return _db;
}

export const db: DrizzleDb = getDb();
