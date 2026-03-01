import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DbDriver, DrizzleDb } from '@/core/db/types';

function resolveMigrationsFolder(): string {
  const moduleUrl = import.meta.url;

  if (moduleUrl.startsWith('file:')) {
    const dirname = fileURLToPath(new URL('.', moduleUrl));
    return resolve(dirname, 'generated');
  }

  return resolve(process.cwd(), 'src/core/db/migrations/generated');
}

const MIGRATIONS_FOLDER = resolveMigrationsFolder();

export async function runMigrations(
  db: DrizzleDb,
  driver: DbDriver,
): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error(
      '[runMigrations] Migrations are not supported in Edge runtime. Run them in Node CLI/test contexts only.',
    );
  }

  if (driver === 'pglite') {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
    return;
  }

  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any, { migrationsFolder: MIGRATIONS_FOLDER });
}
