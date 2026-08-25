/**
 * Local-only configuration for the reconciliation workflow. Every path is
 * read from a static env-var reference (never dynamic `process.env[key]`
 * access) and never hardcoded to a personal filesystem path in a tracked
 * repo file (OZI-28 §Desktop config).
 */

import path from 'node:path';

export type ReconcileConfig = {
  inboxPath: string;
  inboxDir: string;
  ledgerPath: string;
  ledgerDir: string;
  lockPath: string;
};

export class MissingConfigError extends Error {
  constructor(varName: string) {
    super(
      `${varName} is not set. Configure it in your local shell profile ` +
        `(never in a tracked repo file) before running the reconciliation workflow.`,
    );
    this.name = 'MissingConfigError';
  }
}

/**
 * Expands a leading `~` (or `~/...`) to the current user's home directory.
 * Needed because Node's native `--env-file` loader does NOT perform shell
 * tilde-expansion — verified directly: a `.env` value of `~/foo` lands in
 * `process.env` as the literal string `~/foo`, not an expanded path. Every
 * account-local path in this config goes through this before `path.resolve`
 * so `.env.linear` values like `~/.linear/inbox/capture.md` work as written,
 * per-account, without hardcoding anyone's actual home directory anywhere.
 */
export function expandHome(inputPath: string): string {
  if (inputPath === '~') return homeDir();
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return path.join(homeDir(), inputPath.slice(2));
  }
  return inputPath;
}

function homeDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) {
    throw new Error(
      'Cannot expand "~": neither HOME nor USERPROFILE is set in the environment.',
    );
  }
  return home;
}

export function loadConfig(): ReconcileConfig {
  const inboxPath = process.env.AI_INBOX_PATH;
  if (!inboxPath) throw new MissingConfigError('AI_INBOX_PATH');

  const resolvedInbox = path.resolve(expandHome(inboxPath));
  const inboxDir = path.dirname(resolvedInbox);

  // Ledger lives local-only, outside the (possibly synced) inbox directory
  // by default, so its durability never depends on sync propagation timing.
  const ledgerDir = process.env.AI_INBOX_LEDGER_DIR
    ? path.resolve(expandHome(process.env.AI_INBOX_LEDGER_DIR))
    : path.join(homeLocalStateDir(), 'inbox-reconcile');

  return {
    inboxPath: resolvedInbox,
    inboxDir,
    ledgerPath: path.join(ledgerDir, 'reconcile-map.json'),
    ledgerDir,
    lockPath: path.join(ledgerDir, 'reconcile.lock'),
  };
}

function homeLocalStateDir(): string {
  return path.join(homeDir(), '.local', 'state', 'ai-inbox-reconcile');
}
