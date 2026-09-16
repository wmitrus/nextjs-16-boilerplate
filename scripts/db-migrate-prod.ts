import './load-env';

import { spawnSync } from 'node:child_process';

import postgres from 'postgres';

import {
  assertNoKnownPoolerMarker,
  isPooledPostgresUrl,
  runAudAPostMigrateSteps,
  sqlRunnerFromPostgres,
  type AudAPostMigrateResult,
  type SqlRunner,
} from '@/core/db/post-migrate-steps';

import { reconcileKnownMigrationState } from './reconcile-known-migration-state';
import {
  assertMigrationJournalComplete,
  formatMigrationJournalSummary,
  repairKnownMigrationJournalDrift,
  validateMigrationJournal,
} from './validate-migration-journal';

const DRIZZLE_CONFIG = 'src/core/db/migrations/config/drizzle.prod.ts';

/**
 * `DATABASE_URL_UNPOOLED` is the ONLY accepted source for Production DDL
 * (Codex P1). It is the operator trust boundary: the operator explicitly
 * configures this variable with a genuinely direct endpoint. There is
 * deliberately no fallback to `DATABASE_URL` — a Production `DATABASE_URL`
 * is commonly (and often silently) a transaction pooler, and an
 * unrecognized custom pooler/proxy cannot be reliably distinguished from a
 * direct endpoint by inspecting the URL string
 * ({@link assertNoKnownPoolerMarker} is defense-in-depth only, not proof).
 */
type MigrationUrlSource = 'DATABASE_URL_UNPOOLED';

interface ResolvedMigrationUrl {
  source: MigrationUrlSource;
  url: string;
}

export function resolveMigrationUrl(
  unpooledUrl: string | undefined,
): string | undefined {
  return resolveMigrationUrlWithSource(unpooledUrl)?.url;
}

export function resolveMigrationUrlWithSource(
  unpooledUrl: string | undefined,
): ResolvedMigrationUrl | undefined {
  const directUrl = unpooledUrl?.trim();
  if (!directUrl) return undefined;

  return {
    source: 'DATABASE_URL_UNPOOLED',
    url: directUrl,
  };
}

/**
 * Describe the migration target for logging/evidence WITHOUT claiming to
 * have verified it is direct (Codex P1). `knownPoolerMarker` reuses the SAME
 * predicate ({@link isPooledPostgresUrl}) the reject path uses, so reporting
 * and rejection can never disagree; a `false` value means "no known marker
 * matched", never "confirmed direct" -- an unrecognized custom pooler/proxy
 * matches no marker and would also report `false` here. `trust` states the
 * actual trust boundary: the operator explicitly put this URL in
 * `DATABASE_URL_UNPOOLED`.
 */
export function describeMigrationTarget(resolved: ResolvedMigrationUrl): {
  database: string;
  hostname: string;
  knownPoolerMarker: boolean;
  protocol: string;
  source: MigrationUrlSource;
  trust: string;
} {
  const parsed = new URL(resolved.url);

  return {
    source: resolved.source,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    database: parsed.pathname.replace(/^\//, ''),
    knownPoolerMarker: isPooledPostgresUrl(resolved.url),
    trust: 'explicitly operator-configured unpooled endpoint',
  };
}

/**
 * Run `drizzle-kit migrate`. It reads `DATABASE_URL_UNPOOLED` itself (see
 * `drizzle.prod.ts`) and requires it explicitly, with no fallback to
 * `DATABASE_URL` (Codex P1); no per-run timeout policy is injected here —
 * migration `0023` scopes its own `lock_timeout` / `statement_timeout` with
 * `SET LOCAL` so a catch-up batch never runs earlier / later migrations under
 * 0023's caps.
 */
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

/**
 * Injectable seam for the Preview auto-convergence step ONLY, so it can be
 * unit-tested deterministically without a database. Reuses the SAME
 * `runAudAPostMigrateSteps` executor as `db:aud-a:converge --apply` and the
 * Testcontainers/local `runMigrations` path — no second implementation.
 */
export interface MigrateProdDeps {
  runConvergence: typeof runAudAPostMigrateSteps;
  openConvergenceRunner: (url: string) => {
    runner: SqlRunner;
    close: () => Promise<unknown>;
  };
}

function defaultMigrateProdDeps(): MigrateProdDeps {
  return {
    runConvergence: runAudAPostMigrateSteps,
    openConvergenceRunner: (url) => {
      const sql = postgres(url, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
      });
      return {
        runner: sqlRunnerFromPostgres(sql),
        close: () => sql.end({ timeout: 5 }),
      };
    },
  };
}

/**
 * Vercel Preview convergence (Codex P2 follow-up). The actual Preview
 * migration path is the Vercel Build Command `pnpm db:migrate:prod && pnpm
 * build` -- there is no separate `db:aud-a:converge --apply` step for
 * Preview, so without this, Preview would stop getting the automatic AUD·A
 * convergence the rollout promised. Runs ONLY when `VERCEL_ENV=preview`,
 * ONLY after the journaled migration and exact journal validation succeed,
 * and ONLY on `DATABASE_URL_UNPOOLED` (the already-established trust
 * boundary -- no new URL resolution). Never runs for
 * `VERCEL_ENV=production`: ordinary Production stays the operator-gated
 * `db:aud-a:converge --check` then `--apply --production-approved`.
 */
async function runPreviewConvergence(
  connectionString: string,
  deps: MigrateProdDeps,
): Promise<AudAPostMigrateResult | undefined> {
  if (process.env.VERCEL_ENV !== 'preview') {
    return undefined;
  }

  console.log(
    '[db-migrate-prod] VERCEL_ENV=preview — running AUD·A post-migrate ' +
      'convergence automatically on a dedicated single session…',
  );
  const { runner, close } = deps.openConvergenceRunner(connectionString);
  try {
    const result = await deps.runConvergence(runner, 'concurrent', {
      enforcement: 'enforce',
    });
    console.log(
      JSON.stringify({ audAConverge: { applied: true, ...result } }, null, 2),
    );
    return result;
  } finally {
    await close();
  }
}

export async function run(
  argv = process.argv.slice(2),
  deps: MigrateProdDeps = defaultMigrateProdDeps(),
): Promise<void> {
  const dryRun = argv.includes('--check');
  const migrationUrl = resolveMigrationUrlWithSource(
    process.env.DATABASE_URL_UNPOOLED,
  );
  if (!migrationUrl) {
    throw new Error(
      '[db-migrate-prod] DATABASE_URL_UNPOOLED is required before running prod ' +
        'migrations. DATABASE_URL is NOT accepted as a fallback: it is commonly ' +
        'a pooled/proxied endpoint, and an unrecognized custom pooler cannot be ' +
        'reliably detected from the URL string. Configure DATABASE_URL_UNPOOLED ' +
        'to an explicitly direct PostgreSQL endpoint (Codex P1).',
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

  // Defense-in-depth ONLY (Codex P1): reject a KNOWN pooler marker even
  // though `connectionString` already came exclusively from
  // DATABASE_URL_UNPOOLED (the actual trust boundary, enforced above).
  assertNoKnownPoolerMarker(connectionString, 'db-migrate-prod');

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

  // Additive expansion (migration 0023): ADD COLUMN / ADD FK NOT VALID / ADD
  // CHECK NOT VALID. `drizzle-kit migrate` applies it in its own transaction
  // and COMMITS. 0023 scopes its own lock_timeout=3s / statement_timeout=30s
  // with `SET LOCAL` (+ reset), so a catch-up batch never runs earlier / later
  // migrations under 0023's caps.
  //
  // OZI-71 AUD·A operational split (Codex P1): the long-running AUD·A
  // convergence (`CREATE INDEX CONCURRENTLY idx_audit_events_organization_occurred`
  // with statement_timeout=0, and `VALIDATE CONSTRAINT` on both deferred FKs
  // with statement_timeout up to 1h) is NOT run inline here. For
  // `VERCEL_ENV=preview` it runs automatically right after journal
  // validation below (`runPreviewConvergence` -- one Vercel Build Command,
  // `pnpm db:migrate:prod && pnpm build`, so there is no separate Preview
  // convergence step to invoke). For ordinary Production it stays a
  // separately operator-approved step per the AUD·A Production DDL safety
  // plan:
  //   pnpm db:aud-a:converge --check                       (read-only evidence)
  //   pnpm db:aud-a:converge --apply --production-approved  (mutating)
  // AUD·A is additive-only: the legacy runtime path stays authoritative, the
  // NOT VALID FKs still enforce new/changed rows, and the deferred index is
  // not required by the legacy runtime — so a normal Production deploy
  // applies 0023 and exits without touching those operations.
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

  await runPreviewConvergence(connectionString, deps);
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
