/**
 * OS-level exclusive lock via a `link(2)`-published, fully-pre-written file
 * (portable on Linux/WSL) — no new dependency.
 *
 * This is deliberately NOT `flock()`: `flock()` locks are tied to an open
 * file description and are released automatically by the kernel if the
 * holding process dies, with no manual bookkeeping. A plain lock file has
 * no such auto-release — a crashed holder leaves the file behind. This
 * module records who holds it (PID + process start time, for diagnostics
 * and to distinguish a live holder from a stale record) but deliberately
 * does NOT act on that automatically: see below.
 *
 * Race analysis:
 * - Fresh publish (no existing lock file): the holder record
 *   (`<pid>:<startTime>`) is written IN FULL to a private temp sibling
 *   first ({@link writeNewFileDurablyWithinBase}), then `link(2)`'d onto
 *   the lock path ({@link publishFileAtomicallyWithinBase}). `link(2)`
 *   fails closed with `EEXIST` if the destination already exists, and is
 *   the true linearization point: only one process can ever win that link
 *   for a given path. An earlier design published via `open(path, 'wx')`
 *   immediately followed by a SEPARATE `writeSync`, which left a window
 *   where a second process could observe the just-created (still EMPTY)
 *   file and misread it — fixed by the write-before-publish ordering
 *   above.
 * - Existing lock file, holder confirmed live: fails closed with
 *   `LockHeldError`, as always.
 * - Existing lock file, holder stale (process gone, or a start-time
 *   mismatch indicating PID reuse): ALSO fails closed, with
 *   `StaleLockError`, rather than reclaiming it automatically. This
 *   module previously attempted automatic reclamation and went through
 *   two increasingly careful designs, both of which turned out to still
 *   be exploitable with two or more concurrent contenders:
 *     1. Reclaim via a plain `unlink` of the stale path: a second
 *        contender that read the SAME stale record could unlink the
 *        FIRST contender's freshly published, live generation instead of
 *        the stale one it actually validated (a lost-update on the
 *        directory entry).
 *     2. Reclaim via `rename(2)`-grab-then-verify (move whatever is at
 *        the path into a private sibling, compare its content against the
 *        stale record actually observed, restore on mismatch): this closed
 *        (1) for exactly two contenders, but the grab step itself leaves
 *        the lock path OBSERVABLY ABSENT while the grabbed file is being
 *        verified. With a THIRD contender in flight, that vacancy window
 *        is a real acquisition opportunity: contender A reclaims and
 *        publishes; contender B (still acting on its stale, pre-reclaim
 *        observation) grabs A's fresh generation, finds a content
 *        mismatch, and while trying to restore it, contender C observes
 *        the lock path as vacant (B's grab briefly removed the only entry)
 *        and publishes its own generation — B's restore attempt then
 *        loses to C's fresh `link`, and A, B's restore-failure path, and C
 *        can all end up believing they hold a valid lock. There is no
 *        atomic primitive available here ("remove path P only if it still
 *        holds exactly the generation I validated") that avoids this
 *        vacancy window — `unlink`/`rename` unconditionally vacate the
 *        directory entry as their first, uninterruptible effect.
 *   Given no safe automatic reclamation protocol exists with the
 *   filesystem primitives available (portable, no new dependency), the
 *   safety invariant wins over convenience: a stale lock is left exactly
 *   as found, and `StaleLockError` tells the operator to confirm the
 *   previous run is genuinely gone and remove it manually.
 * - Release is one-shot at the acquisition-handle level (a `released`
 *   guard flag in the closure): calling the SAME handle's `release()`
 *   more than once only unlinks the path on the FIRST call. Because
 *   automatic reclamation no longer exists, a compliant contender can
 *   never publish a successor generation while this holder's own
 *   generation is still live and unreleased — `LockHeldError` blocks it
 *   unconditionally — so there is no scenario in normal operation where a
 *   second `release()` call could ever remove someone else's generation;
 *   the one-shot guard exists to make that invariant explicit and cheap
 *   rather than to compensate for a race. (Manually deleting a live lock
 *   file out from under a still-running process is the documented,
 *   deliberate operator escape hatch for a stuck reconciliation and is
 *   outside what this module can or should protect against.)
 * - PID reuse: checking `process.kill(pid, 0)` alone is not sufficient —
 *   after a crash, the OS can eventually reassign the recorded PID to an
 *   unrelated, live process, which would make a stale lock look "held" by
 *   a process that has nothing to do with the original reconciler. To
 *   close this gap, the lock file also records the holder's process start
 *   time (from `/proc/<pid>/stat`, Linux/WSL-native, no dependency) and
 *   liveness is only trusted when both the PID is alive AND its start
 *   time still matches what was recorded — this affects only WHICH error
 *   (`LockHeldError` vs `StaleLockError`) an operator sees, never whether
 *   an automatic destructive cleanup happens (it never does).
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

/**
 * Thrown when an existing lock file's recorded holder is NOT confirmed
 * live (the process is gone, or a start-time mismatch indicates PID
 * reuse). Deliberately NOT auto-cleared — see the file-level doc comment
 * for why no automatic reclamation protocol here is safe under 3+-way
 * contention. The operator must confirm the previous run is genuinely gone
 * and remove the lock file manually before retrying.
 */
export class StaleLockError extends Error {
  constructor(lockPath: string, holderRecord: string) {
    super(
      `Reconciliation lock at ${lockPath} appears STALE (recorded holder: ` +
        `${holderRecord}) — automatic stale-lock reclamation is not ` +
        'performed (safety over automatic crash recovery). Confirm the ' +
        'previous run is genuinely gone, then remove this lock file ' +
        'manually before retrying.',
    );
    this.name = 'StaleLockError';
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

/** `<pid>:<startTime>`, or bare `<pid>` when the start time is unavailable — diagnostics only, not a generation identity/comparison key. */
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

function currentHolderLabel(targetPath: string, ledgerDir: string): string {
  if (!pathExistsWithinBase(targetPath, ledgerDir, 'lock file'))
    return 'unknown';
  const holder = readTextFileWithinBase(
    targetPath,
    ledgerDir,
    'lock file',
  ).trim();
  return holder || 'unknown';
}

/**
 * Acquire the lock or throw `LockHeldError` (live holder) /
 * `StaleLockError` (stale holder — requires manual cleanup; see the
 * file-level doc comment for why this is not reclaimed automatically).
 * Caller must call the returned `release()`. `lockPath` is confined to
 * `ledgerDir` at every filesystem sink — `path.resolve()` alone normalizes
 * but does not confine, and `ledgerDir` is fully operator-configurable
 * (`AI_INBOX_LEDGER_DIR`).
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
    // Stale holder record: FAIL CLOSED. No rename, unlink, replace, or
    // automatic reclamation of this entry — see the file-level doc comment.
    throw new StaleLockError(resolved, holder || 'unparseable');
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
      throw new LockHeldError(
        resolved,
        currentHolderLabel(resolved, ledgerDir),
      );
    }
    throw err;
  }

  // One-shot at the acquisition-handle level: a second call on the SAME
  // handle is a no-op. See the file-level doc comment for why this alone
  // is sufficient now that automatic reclamation no longer exists.
  let released = false;

  return {
    release: () => {
      if (released) return;
      released = true;
      if (pathExistsWithinBase(resolved, ledgerDir, 'lock file')) {
        unlinkSyncWithinBase(resolved, ledgerDir, 'lock file');
      }
    },
  };
}
