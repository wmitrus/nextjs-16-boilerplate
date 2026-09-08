import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  runAudAPostMigrateSteps,
  sqlRunnerFromDrizzle,
} from '@/core/db/post-migrate-steps';
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
    } else {
      const { migrate } = await import('drizzle-orm/postgres-js/migrator');
      await migrate(db as PostgresJsDatabase<MigrationSchema>, {
        migrationsFolder: MIGRATIONS_FOLDER,
      });
    }

    // OZI-71 AUD·A — the migrator wraps every pending migration in ONE
    // transaction, so `CREATE INDEX CONCURRENTLY` and a real commit boundary
    // before `VALIDATE CONSTRAINT` cannot live in a journaled `.sql`. Run
    // them here, after the migrator's transaction has committed. Idempotent;
    // fails closed. `plain` index build for PGlite (single-connection, no
    // large-table write-lock concern); `CONCURRENTLY` for real Postgres.
    await runAudAPostMigrateSteps(
      sqlRunnerFromDrizzle(db, (text) => sql.raw(text)),
      driver === 'pglite' ? 'plain' : 'concurrent',
      {
        // `runMigrations` always returns with 0023 applied (journal at head),
        // so absent AUD·A columns / FKs / index are a hard error here.
        enforcement: 'enforce',
        log: (event) =>
          logger.info(
            { event: 'db:migrations:post-step', driver, ...event },
            'AUD·A post-migrate step',
          ),
      },
    );

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
