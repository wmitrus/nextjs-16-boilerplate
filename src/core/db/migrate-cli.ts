import { createDb } from '@/core/db/create-db';
import { runMigrations } from '@/core/db/migrations/run-migrations';
import { assertNoKnownPoolerMarker } from '@/core/db/post-migrate-steps';
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
 * - `postgres` + `NODE_ENV=production`: `migrate-cli.ts` is not local-only --
 *   `resolveDriver()` itself defaults to `postgres` under
 *   `NODE_ENV=production`. So in a production context this requires
 *   `DATABASE_URL_UNPOOLED` explicitly and does NOT fall back to
 *   `DATABASE_URL` (Codex P1 follow-up): the same no-fallback contract as
 *   the dedicated Production DDL/convergence surfaces
 *   (`scripts/db-migrate-prod.ts`, `scripts/db-aud-a-converge.ts`).
 * - `postgres` + non-production (local/dev/test): `DATABASE_URL_UNPOOLED`
 *   (preferred) else `DATABASE_URL` -- the existing guarded local fallback.
 *   Either way the resolved URL is checked for a KNOWN pooler marker
 *   (defense-in-depth only -- `assertNoKnownPoolerMarker`, no duplicated
 *   pooler detection: absence of a marker is NOT proof of directness) --
 *   this fails closed HERE, before any DB client is opened or the migrator
 *   can run.
 * - `pglite`: `DATABASE_URL` as-is (optional; unchanged behavior).
 */
export function resolveMigrationTarget(driver: DbDriver): string | undefined {
  if (driver !== 'postgres') {
    return process.env.DATABASE_URL?.trim() || undefined;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const unpooledUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
  const url = isProduction
    ? unpooledUrl
    : unpooledUrl || process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      isProduction
        ? '[migrate-cli] NODE_ENV=production requires DATABASE_URL_UNPOOLED ' +
            'explicitly for postgres. DATABASE_URL is NOT accepted as a ' +
            'fallback in a production context (Codex P1).'
        : '[migrate-cli] DATABASE_URL_UNPOOLED or DATABASE_URL is required for postgres.',
    );
  }

  // Fail closed BEFORE createDb / the migrator / migration 0023 / convergence.
  assertNoKnownPoolerMarker(url, 'migrate-cli');

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
