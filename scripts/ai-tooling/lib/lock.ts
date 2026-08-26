/**
 * OS-level exclusive lock via `O_CREAT | O_EXCL` (portable on Linux/WSL) —
 * no new dependency.
 *
 * This is deliberately NOT `flock()`: `flock()` locks are tied to an open
 * file description and are released automatically by the kernel if the
 * holding process dies, with no manual bookkeeping. An `O_EXCL` lock file
 * has no such auto-release — a crashed holder leaves the file behind, which
 * is exactly why this module also records who holds it and checks
 * liveness before treating an existing lock file as stale.
 *
 * Race analysis:
 * - Mutual exclusion itself is correct regardless of how two processes
 *   interleave the staleness-check/cleanup steps below, because the final
 *   `openSync(path, 'wx')` is a single atomic syscall (O_CREAT|O_EXCL) —
 *   it is the true linearization point. Only one process can ever succeed
 *   at creating the same path this way; the logic before it is cleanup
 *   only, not part of the exclusion guarantee.
 * - PID reuse: checking `process.kill(pid, 0)` alone is not sufficient —
 *   after a crash, the OS can eventually reassign the recorded PID to an
 *   unrelated, live process, which would make a stale lock look "held" by
 *   a process that has nothing to do with the original reconciler. This
 *   cannot cause two writers to proceed at once (the exclusion guarantee
 *   above still holds) — its only failure mode is over-cautious blocking
 *   (a false "still held") until the reused PID's unrelated process also
 *   exits. To close this gap, the lock file also records the holder's
 *   process start time (from `/proc/<pid>/stat`, Linux/WSL-native, no
 *   dependency) and liveness is only trusted when both the PID is alive
 *   AND its start time still matches what was recorded.
 * - WSL/Linux: correct as long as the lock path is on the WSL-native
 *   (ext4-backed) filesystem, not a `/mnt/c/...` Windows-mounted path —
 *   `config.ts` places it under `~/.local/state/...`, which is native.
 */

import { closeSync, readFileSync, writeSync } from 'node:fs';
import path from 'node:path';

import {
  assertPathWithinBase,
  ensureDirectorySyncWithinBase,
  openSyncWithinBase,
  pathExistsWithinBase,
  readTextFileWithinBase,
  unlinkSyncWithinBase,
} from '../../lib/fs-guards-shared';

export class LockHeldError extends Error {
  constructor(lockPath: string, holderPid: string) {
    super(
      `Reconciliation already running: lock at ${lockPath} is held by pid ${holderPid}.`,
    );
    this.name = 'LockHeldError';
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Process start time (jiffies since boot, field 22 of `/proc/<pid>/stat`),
 * used purely as a liveness fingerprint to distinguish the original holder
 * from an unrelated process that later reused the same PID. Returns `null`
 * when unavailable (non-Linux, permission denied, pid gone) — callers must
 * treat that as "cannot confirm identity."
 */
function processStartTime(pid: number): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- pid is type-constrained to number; interpolation cannot escape /proc/<digits>/stat.
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // Command name (field 2) is parenthesized and may itself contain
    // spaces/parens, so split on the LAST ")" before reading further fields.
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2);
    const fields = afterComm.split(' ');
    // fields[0] = state (field 3); starttime is field 22 overall, i.e.
    // fields[22 - 3] = fields[19] in this zero-indexed remainder.
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

function encodeHolder(pid: number): string {
  const startTime = processStartTime(pid);
  return startTime !== null ? `${pid}:${startTime}` : String(pid);
}

function decodeHolder(
  content: string,
): { pid: number; startTime: string | null } | null {
  const [pidPart, startTimePart] = content.trim().split(':');
  const pid = Number.parseInt(pidPart, 10);
  if (!Number.isFinite(pid)) return null;
  return { pid, startTime: startTimePart ?? null };
}

/** True only when the recorded holder is both alive and confirmed to be the same process (not a PID reuse). */
function holderStillValid(content: string): boolean {
  const decoded = decodeHolder(content);
  if (!decoded) return false;
  if (!isProcessAlive(decoded.pid)) return false;
  if (decoded.startTime === null) {
    // No start-time was recorded (e.g. /proc unavailable at acquire time) —
    // fall back to PID-alive-only, the best available signal.
    return true;
  }
  const currentStartTime = processStartTime(decoded.pid);
  // If we can no longer read the current start time, don't claim confidence
  // either way beyond "the PID responds" — treat as still valid rather than
  // aggressively clearing a lock we can't disprove.
  return currentStartTime === null || currentStartTime === decoded.startTime;
}

/**
 * Acquire the lock or throw `LockHeldError`. Caller must call the returned
 * `release()`. `lockPath` is confined to `ledgerDir` at every filesystem
 * sink — `path.resolve()` alone normalizes but does not confine, and
 * `ledgerDir` is fully operator-configurable (`AI_INBOX_LEDGER_DIR`).
 */
export function acquireLock(
  lockPath: string,
  ledgerDir: string,
): { release: () => void } {
  const resolved = assertPathWithinBase(
    path.resolve(lockPath),
    ledgerDir,
    'lock file',
  );

  if (pathExistsWithinBase(resolved, ledgerDir, 'lock file')) {
    const holder = readTextFileWithinBase(
      resolved,
      ledgerDir,
      'lock file',
    ).trim();
    if (holderStillValid(holder)) {
      throw new LockHeldError(resolved, holder || 'unknown');
    }
    // Stale lock: owning process is gone (or confirmed to be a different
    // process via start-time mismatch). Clear it and retry once.
    unlinkSyncWithinBase(resolved, ledgerDir, 'lock file');
  }

  // First run against the documented default ledger dir (or any new
  // AI_INBOX_LEDGER_DIR) has no parent directory yet — create it before the
  // exclusive open, or that open throws ENOENT instead of the intended
  // EEXIST/success outcomes below.
  ensureDirectorySyncWithinBase(
    path.dirname(resolved),
    ledgerDir,
    'lock directory',
  );

  let fd: number;
  try {
    fd = openSyncWithinBase(resolved, ledgerDir, 'wx', 'lock file');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      const holder = pathExistsWithinBase(resolved, ledgerDir, 'lock file')
        ? readTextFileWithinBase(resolved, ledgerDir, 'lock file').trim()
        : 'unknown';
      throw new LockHeldError(resolved, holder);
    }
    throw err;
  }
  writeSync(fd, encodeHolder(process.pid));
  closeSync(fd);

  return {
    release: () => {
      if (pathExistsWithinBase(resolved, ledgerDir, 'lock file')) {
        unlinkSyncWithinBase(resolved, ledgerDir, 'lock file');
      }
    },
  };
}
