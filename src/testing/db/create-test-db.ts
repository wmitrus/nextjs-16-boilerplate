import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inject } from 'vitest';

import { runMigrations } from '@/core/db/run-migrations';
import type { DbDriver, DrizzleDb } from '@/core/db/types';

export interface TestDb {
  db: DrizzleDb;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated test database.
 *
 * - PGLite (default): in-memory `memory://` instance — never touches dev disk.
 *   Migrations are applied on creation. Cleanup closes the instance.
 *
 * - Postgres: connects to the given URL (e.g. from Testcontainers).
 *   Truncates all user tables on creation and cleanup.
 *   Migrations are expected to have been run once by globalSetup.
 */
export async function createTestDb(
  driver: DbDriver = 'pglite',
  url?: string,
): Promise<TestDb> {
  return resolveTestDb(driver, url);
}

/**
 * Auto-detects the driver from the Vitest provided context.
 *
 * - If `TEST_DATABASE_URL` was provided by globalSetup (Testcontainers CI),
 *   uses `postgres` with that URL.
 * - Otherwise defaults to in-memory `pglite`.
 *
 * Use this in `*.db.test.ts` files to make them driver-agnostic.
 */
export async function resolveTestDb(): Promise<TestDb>;
export async function resolveTestDb(
  driver: DbDriver,
  url?: string,
): Promise<TestDb>;
export async function resolveTestDb(
  driver?: DbDriver,
  url?: string,
): Promise<TestDb> {
  if (driver !== undefined) {
    return createDbByDriver(driver, url);
  }

  const injectedUrl = inject('TEST_DATABASE_URL') as string | undefined;
  if (injectedUrl) {
    return createDbByDriver('postgres', injectedUrl);
  }

  return createDbByDriver('pglite', undefined);
}

async function createDbByDriver(
  driver: DbDriver,
  url: string | undefined,
): Promise<TestDb> {
  if (driver === 'pglite') {
    return createPgliteTestDb();
  }

  if (driver === 'postgres') {
    if (!url) {
      throw new Error('[createTestDb] url is required for postgres driver');
    }
    return createPostgresTestDb(url);
  }

  throw new Error(`[createTestDb] unsupported driver: ${String(driver)}`);
}

async function createPgliteTestDb(): Promise<TestDb> {
  const pglite = new PGlite('memory://');
  const db = drizzlePglite(pglite) as unknown as DrizzleDb;
  await runMigrations(db, 'pglite');

  return {
    db,
    cleanup: async () => {
      await pglite.close();
    },
  };
}

async function createPostgresTestDb(url: string): Promise<TestDb> {
  const client = postgres(url, { max: 1 });
  const db = drizzlePostgres(client) as unknown as DrizzleDb;

  await truncateAll(db);

  return {
    db,
    cleanup: async () => {
      await truncateAll(db);
      await client.end({ timeout: 5 });
    },
  };
}

async function truncateAll(db: DrizzleDb): Promise<void> {
  await db.execute(sql`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT LIKE 'drizzle_%'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$
  `);
}
