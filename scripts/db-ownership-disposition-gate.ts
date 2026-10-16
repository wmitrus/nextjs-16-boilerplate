import './load-env';

import postgres from 'postgres';

import {
  runOwnershipDispositionConvergence,
  type OwnershipDispositionConvergenceResult,
} from '@/core/db/ownership-disposition-convergence';
import {
  gatherOwnershipDispositionEvidence,
  type OwnershipDispositionEvidence,
  type OwnershipDispositionTableEvidence,
} from '@/core/db/ownership-disposition-gate';
import {
  assertNoKnownPoolerMarker,
  sqlRunnerFromPostgres,
  type SqlRunner,
} from '@/core/db/post-migrate-steps';

import {
  describeMigrationTarget,
  resolveMigrationUrlWithSource,
} from './db-migrate-prod';
import {
  assertMigrationJournalComplete,
  formatMigrationJournalSummary,
  validateMigrationJournal,
} from './validate-migration-journal';

const CTX = 'db:ownership-disposition';
const APPROVAL_FLAG = '--production-approved';
const KNOWN_FLAGS = new Set(['--check', '--apply', APPROVAL_FLAG]);

export function parseArgs(argv: readonly string[]): {
  readonly mode: 'check' | 'apply';
} {
  const unknown = argv.filter((arg) => !KNOWN_FLAGS.has(arg));

  if (unknown.length > 0) {
    throw new Error(
      `[${CTX}] unknown argument(s): ${unknown.join(', ')}. ` +
        'Usage: `pnpm db:ownership-disposition --check` OR ' +
        '`pnpm db:ownership-disposition --apply --production-approved`.',
    );
  }

  const check = argv.includes('--check');
  const apply = argv.includes('--apply');
  const approved = argv.includes(APPROVAL_FLAG);

  if (check && apply) {
    throw new Error(
      `[${CTX}] choose exactly one mode: --check OR ` +
        `--apply ${APPROVAL_FLAG}, not both.`,
    );
  }

  if (!check && !apply) {
    throw new Error(
      `[${CTX}] a mode is required: --check OR ` + `--apply ${APPROVAL_FLAG}.`,
    );
  }

  if (approved && !apply) {
    throw new Error(
      `[${CTX}] ${APPROVAL_FLAG} is valid only together with --apply.`,
    );
  }

  if (apply && !approved) {
    throw new Error(
      `[${CTX}] --apply requires explicit operator approval: ` +
        `${APPROVAL_FLAG}. Run --check first and review the evidence.`,
    );
  }

  return {
    mode: apply ? 'apply' : 'check',
  };
}

export interface OwnershipDispositionCliDeps {
  readonly gatherEvidence: typeof gatherOwnershipDispositionEvidence;
  readonly converge: typeof runOwnershipDispositionConvergence;
  readonly validateJournal: typeof validateMigrationJournal;
  readonly assertJournalComplete: typeof assertMigrationJournalComplete;
  readonly openRunner: (url: string) => {
    readonly runner: SqlRunner;
    readonly close: () => Promise<unknown>;
  };
}

function defaultDeps(): OwnershipDispositionCliDeps {
  return {
    gatherEvidence: gatherOwnershipDispositionEvidence,
    converge: runOwnershipDispositionConvergence,
    validateJournal: validateMigrationJournal,
    assertJournalComplete: assertMigrationJournalComplete,
    openRunner: (url) => {
      const client = postgres(url, {
        prepare: false,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
      });

      return {
        runner: sqlRunnerFromPostgres(client),
        close: () => client.end({ timeout: 5 }),
      };
    },
  };
}

function formatTable(
  label: string,
  evidence: OwnershipDispositionTableEvidence,
): string[] {
  const c = evidence.counts;

  return [
    `${label}:`,
    `  table                    : ${evidence.table}`,
    `  later gate               : ${evidence.gate}`,
    `  rows total               : ${c.total}`,
    `  canonical_organization   : ${c.canonicalOrganization}`,
    `  intentional_global       : ${c.intentionalGlobal}`,
    `  unresolved_legacy        : ${c.unresolvedLegacy}`,
    `  quarantined              : ${c.quarantined}`,
    `  organization_orphaned    : ${c.organizationOwnedOrphaned}`,
    `  invalid combinations     : ${evidence.invalidCombinationCount}`,
    `  disposition settled      : ${String(evidence.dispositionSettled)}`,
    `  CHECK                    : ${evidence.constraint.name}`,
    `  CHECK state              : ${evidence.constraint.state}`,
    `  CHECK exact definition   : ${String(
      evidence.constraint.definitionMatches,
    )}`,
    `  CHECK validated          : ${String(evidence.constraint.validated)}`,
    `  planned action           : ${evidence.plannedAction}`,
    `  ${evidence.gate} ready              : ${String(evidence.gateReady)}`,
  ];
}

export function formatEvidence(
  evidence: OwnershipDispositionEvidence,
  phase: 'check' | 'before-apply' | 'after-apply',
): string {
  return [
    `OZI-213 Quarantine Disposition Gate — ${phase}`,
    '',
    ...formatTable('Feature Flags', evidence.featureFlags),
    '',
    ...formatTable('Audit Log Settings', evidence.auditLogSettings),
    '',
    ...formatTable('Audit Events', evidence.auditEvents),
    '',
    'Gate isolation:',
    `  feature_flags R4a       : ${
      evidence.featureFlags.gateReady ? 'GO' : 'NO-GO'
    }`,
    `  audit_log_settings R4a  : ${
      evidence.auditLogSettings.gateReady ? 'GO' : 'NO-GO'
    }`,
    `  audit_events R4b-1      : ${
      evidence.auditEvents.gateReady ? 'GO' : 'NO-GO'
    }`,
    '',
    'Important: audit_events R4b-1 readiness does NOT gate the independent',
    'feature_flags / audit_log_settings R4a path.',
  ].join('\n');
}

function formatOutcomes(result: OwnershipDispositionConvergenceResult): string {
  return [
    'Convergence actions:',
    ...result.outcomes.map(
      (outcome) => `  ${outcome.table}: ${outcome.action}`,
    ),
  ].join('\n');
}

export async function run(
  argv = process.argv.slice(2),
  deps: OwnershipDispositionCliDeps = defaultDeps(),
): Promise<void> {
  const { mode } = parseArgs(argv);

  if (process.env.VERCEL_ENV === 'preview') {
    throw new Error(
      `[${CTX}] this is a Production operator gate; ` +
        'VERCEL_ENV=preview is not an allowed target.',
    );
  }

  const resolved = resolveMigrationUrlWithSource(
    process.env.DATABASE_URL_UNPOOLED,
  );

  if (!resolved) {
    throw new Error(
      `[${CTX}] DATABASE_URL_UNPOOLED is required. DATABASE_URL is NOT ` +
        'accepted as a fallback.',
    );
  }

  const target = describeMigrationTarget(resolved);

  console.log(
    JSON.stringify(
      {
        ownershipDispositionTarget: target,
      },
      null,
      2,
    ),
  );

  assertNoKnownPoolerMarker(resolved.url, CTX);

  const { runner, close } = deps.openRunner(resolved.url);

  try {
    const before = await deps.gatherEvidence(runner);

    console.log('');
    console.log(
      formatEvidence(before, mode === 'check' ? 'check' : 'before-apply'),
    );

    if (mode === 'check') {
      console.log('');
      console.log(
        `[${CTX}] CHECK COMPLETE — read-only evidence gathered. ` +
          'No schema, data or migration-journal mutation was performed.',
      );
      return;
    }

    const journal = await deps.validateJournal({
      connectionString: resolved.url,
    });

    console.log('');
    console.log(
      JSON.stringify(
        {
          migrationJournal: formatMigrationJournalSummary(journal),
        },
        null,
        2,
      ),
    );

    deps.assertJournalComplete(journal);

    console.log('');
    console.log(
      `[${CTX}] --apply ${APPROVAL_FLAG} — validating only independently ` +
        'eligible ownership CHECK constraints.',
    );

    const result = await deps.converge(runner);

    console.log('');
    console.log(formatOutcomes(result));

    console.log('');
    console.log(
      [
        'Evidence provenance:',
        ...result.outcomes.map(
          (outcome) =>
            `  ${outcome.table}: ${
              outcome.action === 'validated'
                ? 'post-validation reinspection'
                : 'preflight snapshot (not rescanned)'
            }`,
        ),
        '',
        formatEvidence(result.after, 'after-apply'),
      ].join('\n'),
    );

    console.log('');
    console.log(
      `[${CTX}] APPLY COMPLETE — see the independent per-table GO/NO-GO ` +
        'verdicts above. No ownership rows were rewritten and no legacy ' +
        'tenant_id column was removed.',
    );
  } finally {
    await close();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/db-ownership-disposition-gate.ts');

if (isMain) {
  run().catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[${CTX}] Fatal error:`, err.message);
    process.exit(1);
  });
}
