import './load-env';

import { spawnSync } from 'node:child_process';

import postgres from 'postgres';

import {
  appendMigrationSessionParams,
  runAudAPostMigrateSteps,
  sqlRunnerFromPostgres,
  type ConvergenceEnforcement,
} from '@/core/db/post-migrate-steps';

import { reconcileKnownMigrationState } from './reconcile-known-migration-state';
import {
  assertMigrationJournalComplete,
  formatMigrationJournalSummary,
  repairKnownMigrationJournalDrift,
  validateMigrationJournal,
} from './validate-migration-journal';

const DRIZZLE_CONFIG = 'src/core/db/migrations/config/drizzle.prod.ts';

type MigrationUrlSource = 'DATABASE_URL' | 'DATABASE_URL_UNPOOLED';

interface ResolvedMigrationUrl {
  source: MigrationUrlSource;
  url: string;
}

export function resolveMigrationUrl(
  rawUrl: string | undefined,
  unpooledUrl: string | undefined,
): string | undefined {
  return resolveMigrationUrlWithSource(rawUrl, unpooledUrl)?.url;
}

export function resolveMigrationUrlWithSource(
  rawUrl: string | undefined,
  unpooledUrl: string | undefined,
): ResolvedMigrationUrl | undefined {
  const directUrl = unpooledUrl?.trim();
  if (directUrl) {
    return {
      source: 'DATABASE_URL_UNPOOLED',
      url: directUrl,
    };
  }

  const pooledUrl = rawUrl?.trim();
  if (pooledUrl) {
    return {
      source: 'DATABASE_URL',
      url: pooledUrl,
    };
  }

  return undefined;
}

export function describeMigrationTarget(resolved: ResolvedMigrationUrl): {
  database: string;
  hostname: string;
  pooled: boolean;
  protocol: string;
  source: MigrationUrlSource;
} {
  const parsed = new URL(resolved.url);

  return {
    source: resolved.source,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ''),
    pooled: /pooler/i.test(parsed.hostname),
  };
}

/**
 * OZI-71 AUD·A — post-migrate convergence step, run AFTER `drizzle-kit migrate`
 * has applied and committed the additive expand migration (`0023`):
 *
 *  - builds `idx_audit_events_organization_occurred` with
 *    `CREATE INDEX CONCURRENTLY` on a fresh connection, OUTSIDE any
 *    transaction (drizzle-kit wraps every pending migration in ONE
 *    transaction, where CONCURRENTLY is illegal and a plain build would hold
 *    a write-blocking `SHARE` lock for the whole scan of a large
 *    `audit_events`);
 *  - `VALIDATE`s the two `organization_id` FKs added `NOT VALID` by `0023`,
 *    each as its own statement — provably a separate transaction from the
 *    `ADD CONSTRAINT`.
 *
 * The connection carries the AUD·A `lock_timeout` / `statement_timeout` policy
 * via URL params; the step additionally `SET`s a per-operation
 * `statement_timeout` (0 for the concurrent index build, 1h for VALIDATE).
 *
 * `enforcement: 'enforce'` (post-migrate): absent columns / FKs / a
 * non-matching index are a hard error — the command does not report success
 * unless the index exists valid with the exact expected definition and both
 * FKs are validated. `enforcement: 'inspect'` (`--check`): reports only.
 */
async function runAudAConvergenceStep(
  resolved: ResolvedMigrationUrl,
  enforcement: ConvergenceEnforcement,
): Promise<void> {
  const sql = postgres(appendMigrationSessionParams(resolved.url), {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const result = await runAudAPostMigrateSteps(
      sqlRunnerFromPostgres(sql),
      'concurrent',
      { enforcement },
    );
    console.log(
      JSON.stringify({ audAPostMigrate: { enforcement, ...result } }, null, 2),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function runDrizzleMigrate(resolved: ResolvedMigrationUrl): void {
  const result = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'migrate', `--config=${DRIZZLE_CONFIG}`],
    {
      stdio: 'inherit',
      // Hand `drizzle-kit` a URL carrying the AUD·A DDL session-timeout policy
      // (lock_timeout 3s, statement_timeout 30s) — the 0023 transaction runs on
      // a client it builds from this URL alone. A blocked ALTER / ADD
      // CONSTRAINT then aborts instead of queueing behind a long transaction.
      env: {
        ...process.env,
        [resolved.source]: appendMigrationSessionParams(resolved.url),
      },
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export async function run(argv = process.argv.slice(2)): Promise<void> {
  const dryRun = argv.includes('--check');
  const migrationUrl = resolveMigrationUrlWithSource(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
  );
  if (!migrationUrl) {
    throw new Error(
      '[db-migrate-prod] DATABASE_URL_UNPOOLED or DATABASE_URL is required before running prod migrations.',
    );
  }
  const connectionString = migrationUrl.url;

  console.log(
    JSON.stringify(
      {
        migrationTarget: describeMigrationTarget(migrationUrl),
      },
      null,
      2,
    ),
  );

  const summary = await reconcileKnownMigrationState({
    connectionString,
    dryRun,
  });

  const backfilled = summary.decisions
    .filter((decision) => decision.action === 'backfill')
    .map((decision) => decision.tag);
  const skipped = summary.decisions
    .filter((decision) => decision.action === 'skip')
    .map((decision) => ({
      tag: decision.tag,
      reason: decision.reason,
    }));

  console.log(
    JSON.stringify(
      {
        journalTablePresent: summary.journalTablePresent,
        dryRun,
        backfilled,
        skipped,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    // Inspect-only: 0023 may not have run, so report deferred/missing/would-*
    // without mutation.
    await runAudAConvergenceStep(migrationUrl, 'inspect');

    const repairSummary = await repairKnownMigrationJournalDrift({
      connectionString,
      dryRun: true,
    });
    console.log(
      JSON.stringify(
        {
          migrationJournalRepair: repairSummary,
        },
        null,
        2,
      ),
    );
    const journalSummary = await validateMigrationJournal({
      connectionString,
    });
    console.log(
      JSON.stringify(
        {
          migrationJournal: formatMigrationJournalSummary(journalSummary),
        },
        null,
        2,
      ),
    );
    assertMigrationJournalComplete(journalSummary);
    return;
  }

  // 1. Additive expansion (migration 0023): ADD COLUMN / ADD FK NOT VALID /
  //    ADD CHECK NOT VALID, under lock_timeout=3s / statement_timeout=30s.
  //    `drizzle-kit migrate` applies it in its own transaction and COMMITS
  //    before returning here.
  runDrizzleMigrate(migrationUrl);

  // 2. Post-migrate convergence, OUTSIDE that transaction: build the
  //    audit_events organization index with CREATE INDEX CONCURRENTLY, then
  //    VALIDATE the two deferred FKs (each its own statement). No journaled
  //    migration ever builds that index — this is the only path that does.
  //    `enforce`: this call throws unless the index ends up valid + matching
  //    and both FKs are validated, so the command only succeeds on full
  //    convergence.
  await runAudAConvergenceStep(migrationUrl, 'enforce');

  const repairSummary = await repairKnownMigrationJournalDrift({
    connectionString,
  });
  console.log(
    JSON.stringify(
      {
        migrationJournalRepair: repairSummary,
      },
      null,
      2,
    ),
  );

  const journalSummary = await validateMigrationJournal({
    connectionString,
  });
  console.log(
    JSON.stringify(
      {
        migrationJournal: formatMigrationJournalSummary(journalSummary),
      },
      null,
      2,
    ),
  );
  assertMigrationJournalComplete(journalSummary);
}

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/db-migrate-prod.ts');

if (isMain) {
  run().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[db-migrate-prod] Fatal error:', err.message);
    process.exit(1);
  });
}
