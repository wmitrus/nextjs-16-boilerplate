import { createDb } from '@/core/db/create-db';
import { runMigrations } from '@/core/db/migrations/run-migrations';
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

function resolveUrl(driver: DbDriver): string | undefined {
  const url = process.env.DATABASE_URL?.trim();

  if (driver === 'postgres' && !url) {
    throw new Error('[migrate-cli] DATABASE_URL is required for postgres.');
  }

  return url;
}

/**
 * Direct (unpooled) URL for the AUD·A post-migrate convergence's dedicated
 * single-session client. `DATABASE_URL_UNPOOLED` is preferred; `runMigrations`
 * fails closed if the resolved URL is a known pooler endpoint.
 */
function resolveDirectConvergenceUrl(): string | undefined {
  return (
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    undefined
  );
}

async function main(): Promise<void> {
  const provider = resolveProvider();
  const driver = resolveDriver();
  const url = resolveUrl(driver);

  if (provider === 'prisma') {
    throw new Error(
      '[migrate-cli] DB_PROVIDER=prisma is configured, but Prisma migration provider is not implemented yet.',
    );
  }

  const dbRuntime = createDb({ provider, driver, url });

  try {
    // For the postgres driver, `runMigrations` needs a DIRECT URL to open its
    // own dedicated single-session client for the AUD·A convergence, because
    // `createDb`'s postgres client is a pool and SET + CONCURRENTLY + VALIDATE
    // must run through one physical session.
    await runMigrations(dbRuntime.db, driver, {
      postgresUrl:
        driver === 'postgres' ? resolveDirectConvergenceUrl() : undefined,
    });
  } finally {
    await dbRuntime.close?.();
  }

  console.log(
    `[migrate-cli] Migrations applied using provider: ${provider}, driver: ${driver}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[migrate-cli] ${message}`);
  process.exit(1);
});
