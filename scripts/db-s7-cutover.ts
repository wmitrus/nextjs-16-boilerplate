import './load-env';

import postgres from 'postgres';

import {
  assertNoKnownPoolerMarker,
  sqlRunnerFromPostgres,
} from '@/core/db/post-migrate-steps';
import {
  assertS7ProductionPreconditions,
  gatherS7ProductionEvidence,
  S7_PRODUCTION_APPROVAL_FLAG,
  type S7ProductionEvidence,
} from '@/core/db/s7-production-gate';

import {
  describeMigrationTarget,
  resolveMigrationUrlWithSource,
  run as runProdMigration,
} from './db-migrate-prod';

const CTX = 'db:s7:cutover';
const APPROVAL_FLAG = '--production-approved';
const KNOWN_FLAGS = new Set(['--check', '--apply', APPROVAL_FLAG]);

export function parseArgs(argv: readonly string[]): {
  mode: 'check' | 'apply';
} {
  const unknown = argv.filter((arg) => !KNOWN_FLAGS.has(arg));
  if (unknown.length > 0) {
    throw new Error(
      `[${CTX}] unknown argument(s): ${unknown.join(', ')}. ` +
        'Usage: `pnpm db:s7:cutover --check` OR ' +
        '`pnpm db:s7:cutover --apply --production-approved`.',
    );
  }

  const check = argv.includes('--check');
  const apply = argv.includes('--apply');
  const approved = argv.includes(APPROVAL_FLAG);

  if (check && apply) {
    throw new Error(
      `[${CTX}] choose exactly one mode: --check OR ` +
        `--apply ${APPROVAL_FLAG}.`,
    );
  }

  if (approved && !apply) {
    throw new Error(
      `[${CTX}] ${APPROVAL_FLAG} is only valid together with --apply.`,
    );
  }

  if (!check && !apply) {
    throw new Error(
      `[${CTX}] a mode is required: --check OR ` + `--apply ${APPROVAL_FLAG}.`,
    );
  }

  if (apply && !approved) {
    throw new Error(
      `[${CTX}] --apply requires the explicit operator gate ` +
        `${APPROVAL_FLAG}. Run --check first.`,
    );
  }

  return { mode: apply ? 'apply' : 'check' };
}

export interface S7CutoverDeps {
  gatherEvidence: (connectionString: string) => Promise<S7ProductionEvidence>;
  applyMigration: () => Promise<void>;
}

async function gatherEvidenceFromDatabase(
  connectionString: string,
): Promise<S7ProductionEvidence> {
  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    return await gatherS7ProductionEvidence(sqlRunnerFromPostgres(client));
  } finally {
    await client.end({ timeout: 5 });
  }
}

function defaultDeps(): S7CutoverDeps {
  return {
    gatherEvidence: gatherEvidenceFromDatabase,
    applyMigration: () => runProdMigration([S7_PRODUCTION_APPROVAL_FLAG]),
  };
}

function printEvidence(
  mode: 'check' | 'apply',
  evidence: S7ProductionEvidence,
): void {
  console.log(
    JSON.stringify(
      {
        s7Cutover: {
          mode,
          evidence,
          schemaState: evidence.preS7Schema ? 'pre-S7' : 'S7-era',
          destructiveChange: evidence.waitlistTenantIdExists
            ? 'DROP waitlist_entries.tenant_id is pending'
            : 'waitlist_entries.tenant_id is already absent',
          reconstruction:
            evidence.waitlistRowsWithTenantId === 0
              ? 'No non-NULL tenant_id values exist. The compatibility column can be reconstructed as nullable UUID metadata if rollback requires it; no business tenant_id values are being discarded.'
              : 'BLOCKED: populated tenant_id values require an explicit data-preservation/reconstruction plan.',
        },
      },
      null,
      2,
    ),
  );
}

export async function run(
  argv = process.argv.slice(2),
  deps: S7CutoverDeps = defaultDeps(),
): Promise<void> {
  const { mode } = parseArgs(argv);

  if (process.env.VERCEL_ENV === 'preview') {
    throw new Error(
      `[${CTX}] this is the Production operator cutover CLI; ` +
        'VERCEL_ENV=preview is not an allowed target.',
    );
  }

  const resolved = resolveMigrationUrlWithSource(
    process.env.DATABASE_URL_UNPOOLED,
  );

  if (!resolved) {
    throw new Error(
      `[${CTX}] DATABASE_URL_UNPOOLED is required. ` +
        'DATABASE_URL is not accepted as a fallback.',
    );
  }

  console.log(
    JSON.stringify(
      {
        migrationTarget: describeMigrationTarget(resolved),
      },
      null,
      2,
    ),
  );

  assertNoKnownPoolerMarker(resolved.url, CTX);

  const evidence = await deps.gatherEvidence(resolved.url);
  printEvidence(mode, evidence);

  assertS7ProductionPreconditions(evidence, {
    approved: mode === 'apply',
    preview: false,
    checkOnly: mode === 'check',
  });

  if (mode === 'check') {
    console.log(
      `[${CTX}] CHECK PASS — no mutation performed. ` +
        `To execute the reviewed cutover, run: ` +
        `pnpm db:s7:cutover --apply ${APPROVAL_FLAG}`,
    );
    return;
  }

  await deps.applyMigration();

  console.log(
    `[${CTX}] APPLY PASS — journaled S7 migration and post-migrate ` +
      'convergence completed through the guarded Production migration path.',
  );
}

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/db-s7-cutover.ts');

if (isMain) {
  run().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[${CTX}] Fatal error:`, err.message);
    process.exit(1);
  });
}
