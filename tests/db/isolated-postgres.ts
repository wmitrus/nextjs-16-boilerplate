import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { runMigrations } from '../../src/core/db/migrations/run-migrations';
import type { DrizzleDb } from '../../src/core/db/types';

export interface IsolatedPostgres {
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Starts a disposable, migrated PostgreSQL instance for a DB test that cannot
 * safely roll all of its DDL back (for example CREATE INDEX CONCURRENTLY).
 */
export async function startIsolatedPostgres(): Promise<IsolatedPostgres> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });

  try {
    const db = drizzle(client) as unknown as DrizzleDb;
    await runMigrations(db, 'postgres', { postgresUrl: url });
  } catch (error) {
    await container.stop();
    throw error;
  } finally {
    await client.end({ timeout: 5 });
  }

  return {
    url,
    stop: async () => {
      await container.stop();
    },
  };
}
