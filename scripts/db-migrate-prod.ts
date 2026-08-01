import './load-env';

import { spawnSync } from 'node:child_process';

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
  const migrationUrl = resolveMigrationUrlWithSource(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
  );
  const connectionString = migrationUrl?.url;

  if (!connectionString) {
    throw new Error(
      '[db-migrate-prod] DATABASE_URL_UNPOOLED or DATABASE_URL is required before running prod migrations.',
    );
  }

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

  runDrizzleMigrate();

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
