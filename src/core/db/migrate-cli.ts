import { createDb } from '@/core/db/create-db';
import { runMigrations } from '@/core/db/migrations/run-migrations';
import { assertDirectPostgresUrl } from '@/core/db/post-migrate-steps';
import type { DbDriver, DbProvider } from '@/core/db/types';

/**
 * `pnpm db:pglite:migrate` runs this instead of a bare `drizzle-kit migrate`
 * (OZI-54): drizzle-kit's own `driver: 'pglite'` integration instantiates
 * PGlite itself with no way to register contrib extensions, so it cannot run
 * the `CREATE EXTENSION pg_trgm` migration this task added. Going through
 * `createDb()` uses this repo's own `create-pglite.ts`, which does register
 * it -- verified against a fresh PGlite path. `db:generate`/`db:pglite:studio`
 * stay on drizzle-kit directly: generate only diffs `schema.ts` (never
 * executes SQL), and studio only reads an already-migrated DB.
 */

function resolveProvider(): DbProvider {
  const raw = process.env.DB_PROVIDER?.trim();

  if (raw === 'drizzle' || raw === 'prisma') {
    return raw;
  }

  return 'drizzle';
}

function resolveDriver(): DbDriver {
  const raw = process.env.DB_DRIVER?.trim();

  if (raw === 'pglite' || raw === 'postgres') {
    return raw;
  }

  return process.env.NODE_ENV === 'production' ? 'postgres' : 'pglite';
}

/**
 * Resolve the ONE canonical database target for this migration invocation
 * (Codex P2). The journaled migrator and the AUD·A post-migrate convergence
 * MUST run against this exact same URL -- never two independently-resolved
 * endpoints, which (with `DATABASE_URL` and `DATABASE_URL_UNPOOLED` pointing at
 * different branches) could run migration 0023 on one database and the
 * `CREATE INDEX CONCURRENTLY` / FK `VALIDATE` convergence on another.
 *
 * - `postgres`: `DATABASE_URL_UNPOOLED` (preferred) else `DATABASE_URL`. It
 *   must exist and must be a DIRECT (unpooled) endpoint -- this fails closed
 *   HERE, before any DB client is opened or the migrator can run, reusing
 *   `assertDirectPostgresUrl` (no duplicated pooler detection). A direct URL
 *   is also a valid source for `createDb`'s pool.
 * - `pglite`: `DATABASE_URL` as-is (optional; unchanged behavior).
 */
export function resolveMigrationTarget(driver: DbDriver): string | undefined {
  if (driver !== 'postgres') {
    return process.env.DATABASE_URL?.trim() || undefined;
  }

  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      '[migrate-cli] DATABASE_URL_UNPOOLED or DATABASE_URL is required for postgres.',
    );
  }

  // Fail closed BEFORE createDb / the migrator / migration 0023 / convergence.
  assertDirectPostgresUrl(url, 'migrate-cli');

  return url;
}

export interface MigrateCliDeps {
  createDb: typeof createDb;
  runMigrations: typeof runMigrations;
}

export async function runMigrateCli(
  deps: MigrateCliDeps = { createDb, runMigrations },
): Promise<{ provider: DbProvider; driver: DbDriver }> {
  const provider = resolveProvider();
  const driver = resolveDriver();

  if (provider === 'prisma') {
    throw new Error(
      '[migrate-cli] DB_PROVIDER=prisma is configured, but Prisma migration provider is not implemented yet.',
    );
  }

  // One canonical target, resolved once. For postgres this also fails closed
  // on a missing / pooled URL before any client is created.
  const url = resolveMigrationTarget(driver);

  const dbRuntime = deps.createDb({ provider, driver, url });

  try {
    // The migrator runs on `dbRuntime.db` (built from `url`); `runMigrations`
    // opens its own dedicated single-session client for the AUD·A convergence
    // from `postgresUrl` -- passed the SAME `url`, so migration and
    // convergence cannot target different databases.
    await deps.runMigrations(dbRuntime.db, driver, {
      postgresUrl: driver === 'postgres' ? url : undefined,
    });
  } finally {
    await dbRuntime.close?.();
  }

  console.log(
    `[migrate-cli] Migrations applied using provider: ${provider}, driver: ${driver}`,
  );

  return { provider, driver };
}

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/migrate-cli.ts');

if (isMain) {
  runMigrateCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[migrate-cli] ${message}`);
    process.exit(1);
  });
}
