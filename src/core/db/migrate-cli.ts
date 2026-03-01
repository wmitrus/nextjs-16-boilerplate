import { createDb } from '@/core/db/create-db';
import { runMigrations } from '@/core/db/migrations/run-migrations';
import type { DbDriver, DbProvider } from '@/core/db/types';

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
    await runMigrations(dbRuntime.db, driver);
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
