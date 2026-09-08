import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  assertDirectPostgresUrl,
  runAudAPostMigrateSteps,
  sqlRunnerFromDrizzle,
  sqlRunnerFromPostgres,
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

export interface RunMigrationsOptions {
  /**
   * DIRECT (unpooled) Postgres URL. REQUIRED for `driver === 'postgres'`: the
   * AUD·A post-migrate convergence (`SET lock_timeout`/`statement_timeout` →
   * `CREATE INDEX CONCURRENTLY` → `VALIDATE CONSTRAINT` → post-condition
   * introspection) must run through ONE physical PostgreSQL session. A pooled
   * application client — and even a `max:1` client through a transaction
   * pooler — gives no such guarantee, so a known pooler URL is REJECTED
   * (`PooledConnectionRejectedError`), not silently accepted. A dedicated
   * `postgres(url, { max: 1 })` client is created for that sequence and closed
   * afterwards; the ordinary application pool is untouched. Ignored for
   * `driver === 'pglite'` (a single in-process instance — already
   * session-affine).
   */
  postgresUrl?: string;
}

export async function runMigrations(
  db: DrizzleDb,
  driver: DbDriver,
  options: RunMigrationsOptions = {},
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
    // Fail closed BEFORE any migrator runs, but INSIDE the try so a rejection
    // still goes through the `db:migrations:failure` log and the
    // `migrationActiveCount` decrement in `finally`. The postgres AUD·A
    // convergence needs a dedicated DIRECT (unpooled) single session; a bad
    // `postgresUrl` must never leave 0023 committed without convergence.
    if (driver === 'postgres') {
      if (!options.postgresUrl) {
        throw new Error(
          "[runMigrations] driver 'postgres' requires options.postgresUrl so " +
            'the AUD·A post-migrate convergence can run on one explicit ' +
            'PostgreSQL session (SET + CONCURRENTLY + VALIDATE must not span ' +
            'pooled connections).',
        );
      }
      assertDirectPostgresUrl(options.postgresUrl, 'runMigrations convergence');
    }

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
    // fails closed (`runMigrations` always returns with 0023 applied — the
    // journal is at head — so absent AUD·A columns / FKs / index are a hard
    // error). `plain` index build for PGlite (single in-process instance,
    // already session-affine); `CONCURRENTLY` on a dedicated single-session
    // Postgres client for real Postgres.
    const postStepLog = (event: Record<string, unknown>) =>
      logger.info(
        { event: 'db:migrations:post-step', driver, ...event },
        'AUD·A post-migrate step',
      );

    if (driver === 'pglite') {
      await runAudAPostMigrateSteps(
        sqlRunnerFromDrizzle(db, (text) => sql.raw(text)),
        'plain',
        { enforcement: 'enforce', log: postStepLog },
      );
    } else {
      // Validated direct + present at the top of `runMigrations`.
      const postgresUrl = options.postgresUrl as string;
      const { default: postgres } = await import('postgres');
      const affine = postgres(postgresUrl, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
      });
      try {
        await runAudAPostMigrateSteps(
          sqlRunnerFromPostgres(affine),
          'concurrent',
          { enforcement: 'enforce', log: postStepLog },
        );
      } finally {
        await affine.end({ timeout: 5 });
      }
    }

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
