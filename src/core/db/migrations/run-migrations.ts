import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { DbDriver, DrizzleDb } from '@/core/db/types';
import { resolveServerLogger } from '@/core/logger/di';

import { getRuntimeDiagnosticState } from '@/shared/lib/observability/runtime-diagnostic-state';

type MigrationSchema = Record<string, never>;

function resolveMigrationsFolder(): string {
  const moduleUrl = import.meta.url;

  if (moduleUrl.startsWith('file:')) {
    const dirname = fileURLToPath(new URL('.', moduleUrl));
    return resolve(dirname, 'generated');
  }

  return resolve(process.cwd(), 'src/core/db/migrations/generated');
}

const MIGRATIONS_FOLDER = resolveMigrationsFolder();
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'db',
  module: 'run-migrations',
});

export async function runMigrations(
  db: DrizzleDb,
  driver: DbDriver,
): Promise<void> {
  const diagnostics = getRuntimeDiagnosticState();
  diagnostics.migrationInvocations += 1;
  diagnostics.migrationActiveCount += 1;

  logger.info(
    {
      event: 'db:migrations:start',
      driver,
      migrationsFolder: MIGRATIONS_FOLDER,
      invocationCount: diagnostics.migrationInvocations,
      activeInvocationCount: diagnostics.migrationActiveCount,
    },
    'Database migration run starting',
  );

  if (process.env.NEXT_RUNTIME === 'edge') {
    diagnostics.migrationActiveCount = Math.max(
      0,
      diagnostics.migrationActiveCount - 1,
    );
    throw new Error(
      '[runMigrations] Migrations are not supported in Edge runtime. Run them in Node CLI/test contexts only.',
    );
  }

  try {
    if (driver === 'pglite') {
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      await migrate(db as PgliteDatabase<MigrationSchema>, {
        migrationsFolder: MIGRATIONS_FOLDER,
      });

      logger.info(
        {
          event: 'db:migrations:success',
          driver,
          migrationsFolder: MIGRATIONS_FOLDER,
          invocationCount: diagnostics.migrationInvocations,
        },
        'Database migration run completed',
      );
      return;
    }

    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(db as PostgresJsDatabase<MigrationSchema>, {
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    logger.info(
      {
        event: 'db:migrations:success',
        driver,
        migrationsFolder: MIGRATIONS_FOLDER,
        invocationCount: diagnostics.migrationInvocations,
      },
      'Database migration run completed',
    );
  } catch (err) {
    logger.error(
      {
        event: 'db:migrations:failure',
        driver,
        migrationsFolder: MIGRATIONS_FOLDER,
        invocationCount: diagnostics.migrationInvocations,
        err,
      },
      'Database migration run failed',
    );
    throw err;
  } finally {
    diagnostics.migrationActiveCount = Math.max(
      0,
      diagnostics.migrationActiveCount - 1,
    );
  }
}
