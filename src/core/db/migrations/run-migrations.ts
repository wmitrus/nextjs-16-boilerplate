import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DbDriver, DrizzleDb } from '@/core/db/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const MIGRATIONS_FOLDER = resolve(__dirname, 'generated');

export async function runMigrations(
  db: DrizzleDb,
  driver: DbDriver,
): Promise<void> {
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
