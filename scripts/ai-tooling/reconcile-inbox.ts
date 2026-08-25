/**
 * CLI entrypoint for the inbox-to-Linear reconciliation workflow.
 *
 * Usage:
 *   AI_INBOX_PATH=/path/to/inbox.md tsx scripts/ai-tooling/reconcile-inbox.ts
 *   AI_INBOX_PATH=/path/to/inbox.md tsx scripts/ai-tooling/reconcile-inbox.ts --apply <fingerprint>
 *
 * Dry-run is the default and performs zero Linear mutations. `--apply`
 * requires the fingerprint printed by the preceding dry-run — approval is
 * bound to that exact plan (OZI-28 §Dry-run/approval).
 */

import { loadConfig } from './lib/config';
import { linearApiAdapterFromEnv } from './lib/linear-api-adapter';
import { acquireLock, LockHeldError } from './lib/lock';
import { applyPlan, buildPlan, runNormalization } from './lib/reconcile';
import type { LinearAdapter } from './lib/types';

async function main(): Promise<void> {
  const config = loadConfig();
  const adapter: LinearAdapter | null = linearApiAdapterFromEnv();
  if (!adapter) {
    console.error(
      '[reconcile-inbox] LINEAR_API_KEY/LINEAR_TEAM_ID/LINEAR_PROJECT_ID are not ' +
        'all set in the local environment. See scripts/ai-tooling/linear.env.example. Refusing to run ' +
        'without a real Linear adapter.',
    );
    process.exitCode = 1;
    return;
  }

  const lock = acquireLock(config.lockPath, config.ledgerDir);
  try {
    const normalization = runNormalization(config);
    if (normalization.changed) {
      console.log(
        `[reconcile-inbox] Normalized ${normalization.assignedIds.length} new entr${
          normalization.assignedIds.length === 1 ? 'y' : 'ies'
        }: ${normalization.assignedIds.join(', ')}`,
      );
    }

    const applyIndex = process.argv.indexOf('--apply');
    if (applyIndex === -1) {
      const plan = await buildPlan(config, adapter);
      printPlan(plan.fingerprint, plan.rows);
      console.log(
        '\n[reconcile-inbox] Dry-run only — no Linear mutations performed. ' +
          `Re-run with "--apply ${plan.fingerprint}" to apply this exact plan.`,
      );
      return;
    }

    const approvedFingerprint = process.argv[applyIndex + 1];
    if (!approvedFingerprint) {
      console.error(
        '[reconcile-inbox] --apply requires the fingerprint from a prior dry-run.',
      );
      process.exitCode = 1;
      return;
    }

    const result = await applyPlan(config, adapter, approvedFingerprint);
    console.log(
      `[reconcile-inbox] created=${result.created.length} linked=${result.linked.length} ` +
        `manual_review=${result.manualReview.length} failed=${result.failed.length}`,
    );
    for (const m of result.manualReview)
      console.log(`  MANUAL_REVIEW ${m.inboxId}: ${m.reason}`);
    for (const f of result.failed)
      console.log(`  FAILED ${f.inboxId}: ${f.reason}`);
    // A per-row failure does not throw (applyPlan isolates rows) — surface
    // it as a nonzero exit so shell automation and operators relying on the
    // exit code see an incomplete reconciliation instead of false success.
    if (result.failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    lock.release();
  }
}

function printPlan(
  fingerprint: string,
  rows: Awaited<ReturnType<typeof buildPlan>>['rows'],
): void {
  console.log(`[reconcile-inbox] Plan fingerprint: ${fingerprint}`);
  for (const row of rows) {
    console.log(
      `  ${row.action.padEnd(14)} ${row.inboxId}  "${row.title}"  (${row.reason})`,
    );
  }
  if (rows.length === 0) console.log('  (no NEW entries to reconcile)');
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('/reconcile-inbox.ts');

if (isMainModule) {
  main().catch((err) => {
    if (err instanceof LockHeldError) {
      console.error(`[reconcile-inbox] ${err.message}`);
      process.exitCode = 1;
      return;
    }
    console.error('[reconcile-inbox] Fatal error:', (err as Error).message);
    process.exitCode = 1;
  });
}
