import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { runMigrations } from '@/core/db/migrations/run-migrations';
import { R4A_SYSTEM_IDENTIFIER_SQL } from '@/core/db/r4a-compact-index-bootstrap';
import type { DrizzleDb } from '@/core/db/types';

export interface IsolatedPostgres {
  readonly url: string;
  /** Cluster identity read inside the container (trusted R4a bootstrap proof). */
  readonly systemIdentifier: string;
  stop(): Promise<void>;
}

/**
 * Starts a disposable, migrated PostgreSQL instance for a DB test that cannot
 * safely roll all of its DDL back (for example CREATE INDEX CONCURRENTLY).
 *
 * By default it converges the non-Production R4a-A schema like every other
 * migration-built database (OZI-219). R4a suites that must observe the
 * migration-only (pre-A) state pass `{ r4aSchemaA: 'absent' }`.
 */
export async function startIsolatedPostgres(
  options: { readonly r4aSchemaA?: 'bootstrap' | 'absent' } = {},
): Promise<IsolatedPostgres> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });
  let systemIdentifier: string;

  try {
    // OZI-219: the trusted identity comes from inside the container this
    // fixture started (local socket), never from the URL being verified.
    const probe = await container.exec([
      'psql',
      '-U',
      container.getUsername(),
      '-d',
      container.getDatabase(),
      '-tAc',
      R4A_SYSTEM_IDENTIFIER_SQL,
    ]);
    systemIdentifier = probe.output.trim();
    if (probe.exitCode !== 0 || !/^\d{1,20}$/.test(systemIdentifier))
      throw new Error('[isolated-postgres] cannot read the container identity');

    const db = drizzle(client) as unknown as DrizzleDb;
    await runMigrations(db, 'postgres', {
      postgresUrl: url,
      ...(options.r4aSchemaA === 'absent'
        ? {}
        : {
            r4aSchemaA: 'bootstrap',
            r4aTargetSystemIdentifier: systemIdentifier,
          }),
    });
  } catch (error) {
    await container.stop();
    throw error;
  } finally {
    await client.end({ timeout: 5 });
  }

  return {
    url,
    systemIdentifier,
    stop: async () => {
      await container.stop();
    },
  };
}
