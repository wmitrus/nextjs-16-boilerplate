/**
 * OS-level exclusive lock via a `link(2)`-published, fully-pre-written file
 * (portable on Linux/WSL) — no new dependency.
 *
 * This is deliberately NOT `flock()`: `flock()` locks are tied to an open
 * file description and are released automatically by the kernel if the
 * holding process dies, with no manual bookkeeping. A plain lock file has
 * no such auto-release — a crashed holder leaves the file behind, which is
 * exactly why this module also records who holds it and checks liveness
 * before treating an existing lock file as stale.
 *
 * Race analysis:
 * - The lock is published with {@link publishFileAtomicallyWithinBase}:
 *   the holder record (`<pid>:<startTime>`) is written IN FULL to a private
 *   temp sibling first, then `link(2)`'d onto the lock path. `link(2)`
 *   fails closed with `EEXIST` if the destination already exists — the
 *   SAME no-clobber guarantee a raw `open(path, 'wx')` gives — and it is
 *   the true linearization point: only one process can ever win that link
 *   for a given path. The earlier design published via
 *   `open(path, 'wx')` immediately followed by a SEPARATE `writeSync` for
 *   the holder record, which left a real window: a second process could
 *   observe the just-created (still EMPTY) lock file between those two
 *   steps, read `''`, fail to decode a holder from it, conclude the lock
 *   was stale, delete it, and create its own — letting two processes
 *   acquire at once (OZI-28 real two-process contention regression). By
 *   the time `link(2)` makes the destination visible under this design,
 *   the full holder record is already durable in the source inode, so no
 *   reader can ever observe a partially-written lock file. Losing the
 *   `link(2)` race after our own staleness check just passed means another
 *   process's publish won it in between — that is reported as a genuine
 *   `LockHeldError`, not retried, matching the "fail fast" contract.
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

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  assertPathWithinBase,
  ensureDirectorySyncWithinBase,
  pathExistsWithinBase,
  publishFileAtomicallyWithinBase,
  readTextFileWithinBase,
  removeCreatedArtifactsWithinBase,
  unlinkSyncWithinBase,
  writeNewFileDurablyWithinBase,
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
    // process via start-time mismatch). Clear it and retry once. Another
    // process may have already cleared the SAME stale lock a moment ago —
    // ENOENT here just means we lost that harmless cleanup race, not a
    // real failure.
    try {
      unlinkSyncWithinBase(resolved, ledgerDir, 'lock file');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  // First run against the documented default ledger dir (or any new
  // AI_INBOX_LEDGER_DIR) has no parent directory yet — create it before the
  // publish below, or that publish throws ENOENT instead of the intended
  // EEXIST/success outcomes.
  ensureDirectorySyncWithinBase(
    path.dirname(resolved),
    ledgerDir,
    'lock directory',
  );

  // Write the FULL holder record to a private temp sibling first, then
  // publish it onto `resolved` with a genuine no-clobber `link(2)` (see the
  // file-level doc comment) — no reader can ever observe `resolved` with
  // partial/empty content.
  const tempPath = `${resolved}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeNewFileDurablyWithinBase(
    tempPath,
    ledgerDir,
    encodeHolder(process.pid),
    'lock file (temp)',
  );
  try {
    publishFileAtomicallyWithinBase(tempPath, resolved, ledgerDir, 'lock file');
  } catch (err) {
    removeCreatedArtifactsWithinBase(
      [tempPath],
      ledgerDir,
      'lock file (temp cleanup)',
    );
    // Only a lost publish race (the destination now exists — someone else's
    // link won) maps to LockHeldError; any other failure is unexpected and
    // must propagate unmasked.
    if (pathExistsWithinBase(resolved, ledgerDir, 'lock file')) {
      const holder = readTextFileWithinBase(
        resolved,
        ledgerDir,
        'lock file',
      ).trim();
      throw new LockHeldError(resolved, holder || 'unknown');
    }
    throw err;
  }

  return {
    release: () => {
      if (pathExistsWithinBase(resolved, ledgerDir, 'lock file')) {
        unlinkSyncWithinBase(resolved, ledgerDir, 'lock file');
      }
    },
  };
}
