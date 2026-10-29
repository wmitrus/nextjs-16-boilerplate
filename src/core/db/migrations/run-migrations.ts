import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  assertNoKnownPoolerMarker,
  runAudAPostMigrateSteps,
  sqlRunnerFromDrizzle,
  sqlRunnerFromPostgres,
} from '@/core/db/post-migrate-steps';
import {
  assertR4aBootstrapTargetIdentity,
  bootstrapR4aSchemaAConcurrent,
  bootstrapR4aSchemaAPlain,
  isLocalR4aBootstrapTarget,
} from '@/core/db/r4a-compact-index-bootstrap';
import { r4aExecutorRunnerFromPostgres } from '@/core/db/r4a-compact-index-executor';
import { runS7PostMigrateSteps } from '@/core/db/s7-post-migrate-steps';
import {
  assertS7ProductionPreconditions,
  gatherS7ProductionEvidence,
} from '@/core/db/s7-production-gate';
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
  /**
   * OZI-219 — converge the non-Production R4a-A schema (the two compact
   * uniques) after migrations. Accepted only for PGlite or a loopback
   * PostgreSQL that also carries `r4aTargetSystemIdentifier`; anything else is
   * refused before the migrator runs. Production/Preview get schema A only
   * through the operator executor.
   */
  r4aSchemaA?: 'bootstrap';
  /**
   * OZI-219 — the target cluster's `system_identifier`, read through a trusted
   * channel (inside the Testcontainers / local compose container), never via
   * `postgresUrl`. Verified on the bootstrap session before any DDL.
   */
  r4aTargetSystemIdentifier?: string;
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
      assertNoKnownPoolerMarker(
        options.postgresUrl,
        'runMigrations convergence',
      );
      // migrate-cli never requests the bootstrap in production; refuse any
      // other caller that does, before the migrator writes.
      if (
        options.r4aSchemaA === 'bootstrap' &&
        process.env.NODE_ENV === 'production'
      ) {
        throw new Error(
          '[runMigrations] the R4a-A schema bootstrap is non-Production only ' +
            'and refuses NODE_ENV=production.',
        );
      }
      if (
        options.r4aSchemaA === 'bootstrap' &&
        !isLocalR4aBootstrapTarget(options.postgresUrl)
      ) {
        throw new Error(
          '[runMigrations] the R4a-A schema bootstrap is non-Production only ' +
            'and refuses a non-loopback PostgreSQL target.',
        );
      }
      if (
        options.r4aSchemaA === 'bootstrap' &&
        !options.r4aTargetSystemIdentifier
      ) {
        throw new Error(
          '[runMigrations] the R4a-A schema bootstrap requires a trusted ' +
            'target identity (r4aTargetSystemIdentifier); a loopback hostname ' +
            'is not proof.',
        );
      }
      // Proven on the migrator's own client BEFORE it writes, and again on
      // the bootstrap session itself before any R4a DDL.
      if (options.r4aSchemaA === 'bootstrap') {
        await assertR4aBootstrapTargetIdentity(
          sqlRunnerFromDrizzle(db, (text) => sql.raw(text)),
          options.r4aTargetSystemIdentifier,
        );
      }

      // S7·resid destructive Production DDL is intentionally executable only
      // through the dedicated db:s7:cutover operator workflow. runMigrations
      // is also reachable from migrate-cli.ts in NODE_ENV=production, so it
      // must fail closed before the generic migrator can apply 0025.
      //
      // Preview retains the reviewed automatic cutover behavior. An already
      // converged Production schema also passes without approval.
      if (process.env.NODE_ENV === 'production') {
        const evidence = await gatherS7ProductionEvidence(
          sqlRunnerFromDrizzle(db, (text) => sql.raw(text)),
        );

        assertS7ProductionPreconditions(evidence, {
          approved: false,
          preview: process.env.VERCEL_ENV === 'preview',
        });
      }
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
      const runner = sqlRunnerFromDrizzle(db, (text) => sql.raw(text));
      await runAudAPostMigrateSteps(runner, 'plain', {
        enforcement: 'enforce',
        log: postStepLog,
      });
      await runS7PostMigrateSteps(runner);
      if (options.r4aSchemaA === 'bootstrap') {
        postStepLog({ r4aSchemaA: await bootstrapR4aSchemaAPlain(runner) });
      }
    } else {
      // Checked for a known pooler marker (defense-in-depth only -- does NOT
      // prove directness) and confirmed present at the top of `runMigrations`.
      const postgresUrl = options.postgresUrl as string;
      const { default: postgres } = await import('postgres');
      const affine = postgres(postgresUrl, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
      });
      try {
        const runner = sqlRunnerFromPostgres(affine);
        await runAudAPostMigrateSteps(runner, 'concurrent', {
          enforcement: 'enforce',
          log: postStepLog,
        });
        await runS7PostMigrateSteps(runner);
      } finally {
        await affine.end({ timeout: 5 });
      }

      if (options.r4aSchemaA === 'bootstrap') {
        // The executor's advisory lock and timeout policy live on one pinned,
        // never-retired session.
        const r4a = postgres(postgresUrl, {
          prepare: false,
          max: 1,
          idle_timeout: 5,
          connect_timeout: 10,
          max_lifetime: null,
        });
        try {
          const session = await r4a.reserve();
          try {
            postStepLog({
              r4aSchemaA: await bootstrapR4aSchemaAConcurrent(
                r4aExecutorRunnerFromPostgres(session),
                {
                  expectedSystemIdentifier:
                    options.r4aTargetSystemIdentifier ?? '',
                },
              ),
            });
          } finally {
            session.release();
          }
        } finally {
          await r4a.end({ timeout: 5 });
        }
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
