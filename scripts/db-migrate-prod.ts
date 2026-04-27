import './load-env';

import { spawnSync } from 'node:child_process';

import { reconcileKnownMigrationState } from './reconcile-known-migration-state';

const DRIZZLE_CONFIG = 'src/core/db/migrations/config/drizzle.prod.ts';

export function resolveMigrationUrl(
  rawUrl: string | undefined,
  unpooledUrl: string | undefined,
): string | undefined {
  return unpooledUrl?.trim() || rawUrl?.trim() || undefined;
}

function runDrizzleMigrate(): void {
  const result = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'migrate', `--config=${DRIZZLE_CONFIG}`],
    {
      stdio: 'inherit',
      env: process.env,
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
  const connectionString = resolveMigrationUrl(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
  );

  if (!connectionString) {
    throw new Error(
      '[db-migrate-prod] DATABASE_URL_UNPOOLED or DATABASE_URL is required before running prod migrations.',
    );
  }

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
    return;
  }

  runDrizzleMigrate();
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
