import { PGlite } from '@electric-sql/pglite';
// OZI-54: same reason as src/core/db/drivers/create-pglite.ts -- PGlite
// doesn't enable contrib extensions by default, so the migration's
// `CREATE EXTENSION pg_trgm` needs it registered on the client.
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { inject } from 'vitest';

import { runMigrations } from '@/core/db/migrations/run-migrations';
import {
  bootstrapR4aSchemaAConcurrent,
  isLocalR4aBootstrapTarget,
} from '@/core/db/r4a-compact-index-bootstrap';
import { r4aExecutorRunnerFromPostgres } from '@/core/db/r4a-compact-index-executor';
import type { DbDriver, DrizzleDb } from '@/core/db/types';

export interface TestDb {
  db: DrizzleDb;
  cleanup: () => Promise<void>;
  /** Real-Postgres URL of a migration-only database, for suites needing a second session. */
  url?: string;
  /** Its cluster identity, read inside its container (R4a bootstrap proof). */
  systemIdentifier?: string;
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
 * - If `TEST_DATABASE_URL` is set in process env (local Podman/Postgres),
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

  const envUrl = process.env.TEST_DATABASE_URL?.trim();
  if (envUrl) {
    return createDbByDriver('postgres', envUrl);
  }

  return createDbByDriver('pglite', undefined);
}

/**
 * OZI-219 — a migration-only (pre-R4a-A) database for suites that assert the
 * schema exactly as the migrations leave it (FF·A / AUD·A contracts: NOT
 * VALID ownership CHECKs, several NULL-organization legacy rows per key).
 * Schema A forbids those states, so they are never asserted on the shared
 * schema-A fixture: PGlite gets a fresh instance without the bootstrap; a
 * real-Postgres profile gets its own disposable Testcontainers database.
 */
export async function resolveMigrationOnlyTestDb(): Promise<TestDb> {
  const usesPostgres =
    Boolean(inject('TEST_DATABASE_URL')) ||
    Boolean(process.env.TEST_DATABASE_URL?.trim());
  if (!usesPostgres) return createPgliteTestDb({ r4aSchemaA: 'absent' });

  const { startIsolatedPostgres } = await import('./isolated-postgres');
  const isolated = await startIsolatedPostgres({ r4aSchemaA: 'absent' });
  try {
    const testDb = await createPostgresTestDb(isolated.url, {
      r4aSchemaA: 'absent',
    });
    return {
      db: testDb.db,
      url: isolated.url,
      systemIdentifier: isolated.systemIdentifier,
      cleanup: async () => {
        await testDb.cleanup();
        await isolated.stop();
      },
    };
  } catch (error) {
    await isolated.stop();
    throw error;
  }
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

interface SchemaAOption {
  readonly r4aSchemaA: 'bootstrap' | 'absent';
}

async function createPgliteTestDb(
  { r4aSchemaA }: SchemaAOption = { r4aSchemaA: 'bootstrap' },
): Promise<TestDb> {
  const pglite = new PGlite('memory://', { extensions: { pg_trgm } });
  const db = drizzlePglite(pglite) as unknown as DrizzleDb;
  await runMigrations(
    db,
    'pglite',
    r4aSchemaA === 'bootstrap' ? { r4aSchemaA } : {},
  );

  return {
    db,
    cleanup: async () => {
      await pglite.close();
    },
  };
}

async function createPostgresTestDb(
  url: string,
  { r4aSchemaA }: SchemaAOption = { r4aSchemaA: 'bootstrap' },
): Promise<TestDb> {
  const client = postgres(url, {
    max: 1,
    // Test isolation uses TRUNCATE ... CASCADE on the disposable test DB.
    // PostgreSQL emits verbose NOTICE messages for every dependent relation;
    // suppress those notices only in the test client while preserving errors.
    onnotice: () => {},
  });
  const db = drizzlePostgres(client) as unknown as DrizzleDb;

  await truncateAll(db);
  if (r4aSchemaA === 'bootstrap') await ensureR4aSchemaA(client, url);

  return {
    db,
    cleanup: async () => {
      await truncateAll(db);
      await client.end({ timeout: 5 });
    },
  };
}

/**
 * OZI-219 — the shared database may have been rebuilt by an earlier file
 * through the migrator alone (migration-transition suites), so every file
 * starts in R4a schema A. Idempotent; on one pinned session for the executor.
 *
 * The identity proof is the cluster `system_identifier` the globalSetup read
 * inside the container it controls (Testcontainers or the local compose
 * test-db); without it, or on a mismatch, the bootstrap refuses.
 */
async function ensureR4aSchemaA(
  client: postgres.Sql,
  url: string,
): Promise<void> {
  if (!isLocalR4aBootstrapTarget(url))
    throw new Error(
      '[createTestDb] the R4a schema A bootstrap refuses a non-loopback test database',
    );
  const expectedSystemIdentifier =
    (inject('TEST_DATABASE_SYSTEM_IDENTIFIER') as string | undefined) ??
    process.env.TEST_DATABASE_SYSTEM_IDENTIFIER?.trim() ??
    '';
  const session = await client.reserve();
  try {
    await bootstrapR4aSchemaAConcurrent(
      r4aExecutorRunnerFromPostgres(session),
      { expectedSystemIdentifier },
    );
  } finally {
    session.release();
  }
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
