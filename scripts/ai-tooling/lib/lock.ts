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
 * - Fresh publish (no existing lock file): the holder record
 *   (`<pid>:<startTime>:<nonce>`) is written IN FULL to a private temp
 *   sibling first ({@link writeNewFileDurablyWithinBase}), then `link(2)`'d
 *   onto the lock path ({@link publishFileAtomicallyWithinBase}). `link(2)`
 *   fails closed with `EEXIST` if the destination already exists, and is
 *   the true linearization point: only one process can ever win that link
 *   for a given path. An earlier design published via `open(path, 'wx')`
 *   immediately followed by a SEPARATE `writeSync`, which left a window
 *   where a second process could observe the just-created (still EMPTY)
 *   file, read `''`, decode no holder from it, conclude the lock was
 *   stale, delete it, and create its own — letting two processes acquire
 *   at once (OZI-28 real two-process contention regression, fixed by the
 *   write-before-publish ordering above).
 * - Stale-lock reclamation and release both need to REMOVE an existing
 *   directory entry, and removal is where a second, more subtle race
 *   lives: `unlink(2)` (and `rename(2)`, used as a clobbering "publish")
 *   are PATHNAME-based — they act on whatever CURRENTLY occupies a path,
 *   not on the specific generation a caller earlier read and validated.
 *   A plain "read the holder, decide it's stale, `unlink` the path" (or
 *   "release: `unlink` whatever is at the path") is a genuine TOCTOU: a
 *   second contender can observe the SAME stale generation, and whichever
 *   of the two runs its cleanup+republish LAST can `unlink` the FIRST
 *   one's freshly published, live generation instead of the stale one it
 *   actually validated — a lost-update on the directory entry, not on the
 *   file content. No amount of re-reading immediately before the `unlink`
 *   closes this: the read and the removal are still two separate syscalls
 *   with a window between them.
 *
 *   The fix: {@link grabAndVerifyGeneration} never removes a path by name
 *   alone. It first calls `rename(2)` ({@link renameSyncWithinBase}) to
 *   ATOMICALLY move whatever currently occupies the path into a private,
 *   uniquely-named sibling only this call knows about — ONE syscall, so
 *   there is no window where a second caller could grab the same
 *   directory entry (a second `rename(2)` against an already-moved source
 *   fails closed with `ENOENT`). Only AFTER exclusively possessing
 *   whatever was grabbed does it compare that file's FULL CONTENT against
 *   the generation the caller actually validated (observed as stale
 *   moments earlier for reclaim; the exact record this call itself
 *   published for release). A match means it is genuinely safe to
 *   discard. A mismatch means this call is holding a DIFFERENT (possibly
 *   live, possibly a just-published successor) generation than the one it
 *   validated — never once decided to discard blind — so it restores that
 *   exact file with a no-clobber `link(2)` publish and reports the loss,
 *   instead of destroying it.
 *
 *   Content, not filesystem `(dev, ino)` identity, is the comparison key:
 *   an inode number is NOT a safe proxy for "same generation" here —
 *   once a generation's last link is unlinked (during the 'owned' cleanup
 *   below), the kernel is free to hand that EXACT inode number to the very
 *   next file created on the same filesystem (observed directly while
 *   building this fix: two `acquireLock` calls back-to-back on a tmpfs
 *   temp dir reused the same inode). Comparing `(dev, ino)` alone would
 *   therefore risk a false "match" against an unrelated, brand-new
 *   generation that happened to recycle the old generation's inode number
 *   — an ABA problem. The holder record's random per-acquisition nonce
 *   makes full-content equality a safe, ABA-proof generation fingerprint
 *   instead: two DIFFERENT `acquireLock` calls can never produce the same
 *   content.
 *
 *   This preserves the original design's mutual-exclusion guarantee
 *   (still exactly one winning `link(2)` per generation) while also
 *   making reclaim and release safe against the ordering the create/write
 *   fix alone did not cover.
 * - No safe way to make an automatic reclaim retry indefinitely without
 *   risking starvation under sustained contention, so a lost reclaim (or a
 *   `grabAndVerifyGeneration` call that finds nothing left to grab because
 *   another contender already won) fails closed with `LockHeldError`
 *   rather than looping — matching the module's existing "fail fast, do
 *   not retry" contract.
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
  renameSyncWithinBase,
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
 * Testing-only seams for `lock.stale-race`-style deterministic regression
 * tests. Never used in production — every hook defaults to a no-op, so
 * omitting the third argument (as every real caller does) is behaviorally
 * identical to the hookless version of this module.
 */
export interface AcquireLockHooks {
  /**
   * Invoked synchronously immediately after `acquireLock` has determined an
   * EXISTING lock file is stale, but BEFORE it attempts to reclaim it. Lets
   * a test deterministically force a second, independent contender to fully
   * reclaim-and-publish its own generation while this call is "paused"
   * here — proving the reclaim below correctly detects and safely loses
   * that race (restoring the second contender's fresh generation) instead
   * of destroying it.
   */
  afterStaleDetected?: () => void;
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

/**
 * `<pid>:<startTime>:<nonce>` — the trailing nonce is NOT used for liveness
 * ({@link holderStillValid} only ever looks at the first two fields); it
 * exists purely so every acquisition's record is unique even when the same
 * process (same pid, same start time) re-acquires the same path, making
 * full-content equality a safe generation fingerprint for
 * {@link grabAndVerifyGeneration} (see the file-level doc comment on why
 * filesystem inode identity is NOT safe for that comparison).
 */
function encodeHolder(pid: number): string {
  const startTime = processStartTime(pid);
  const nonce = randomBytes(8).toString('hex');
  return `${pid}:${startTime ?? ''}:${nonce}`;
}

function decodeHolder(
  content: string,
): { pid: number; startTime: string | null } | null {
  const [pidPart, startTimePart] = content.trim().split(':');
  const pid = Number.parseInt(pidPart, 10);
  if (!Number.isFinite(pid)) return null;
  return {
    pid,
    startTime:
      startTimePart === undefined || startTimePart === ''
        ? null
        : startTimePart,
  };
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

type GrabOutcome = 'absent' | 'owned' | 'foreign';

/**
 * Atomically grab whatever currently occupies `targetPath` into a private,
 * uniquely-named sibling, then verify — by comparing that file's FULL
 * CONTENT, never by re-reading/re-trusting `targetPath` a second time —
 * whether what was grabbed is the SAME generation the caller already
 * validated (`expectedContent`). See the file-level doc comment for the
 * full race analysis, including why content (not filesystem inode
 * identity) is the safe comparison key.
 *
 * - `'absent'`: nothing was at `targetPath` any more (`ENOENT`) — this call
 *   never got exclusive possession of anything; it lost the contention
 *   entirely and must not act as though it succeeded.
 * - `'owned'`: what was grabbed matches `expectedContent` exactly —
 *   discarded; the caller may now safely proceed (reclaim: publish a fresh
 *   generation; release: done).
 * - `'foreign'`: what was grabbed has DIFFERENT content — restored
 *   (no-clobber `link(2)`) so its rightful owner still finds it; the caller
 *   has lost this contention and must not act as though it succeeded.
 */
function grabAndVerifyGeneration(
  targetPath: string,
  ledgerDir: string,
  expectedContent: string,
  label: string,
): GrabOutcome {
  const grabPath = `${targetPath}.${process.pid}.${randomBytes(4).toString('hex')}.grab`;

  try {
    renameSyncWithinBase(targetPath, grabPath, ledgerDir, `${label} (grab)`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw err;
  }

  const grabbedContent = readTextFileWithinBase(
    grabPath,
    ledgerDir,
    `${label} (grab)`,
  ).trim();

  if (grabbedContent === expectedContent) {
    removeCreatedArtifactsWithinBase(
      [grabPath],
      ledgerDir,
      `${label} (grab cleanup)`,
    );
    return 'owned';
  }

  try {
    publishFileAtomicallyWithinBase(
      grabPath,
      targetPath,
      ledgerDir,
      `${label} (restore)`,
    );
  } catch (restoreErr) {
    // Pathological: a THIRD generation has since appeared at `targetPath`
    // too, so even the no-clobber restore lost its own race. Never
    // silently drop the (possibly live) generation still sitting in
    // `grabPath` — surface loudly instead.
    throw new Error(
      `[lock] internal consistency failure at ${targetPath}: grabbed a foreign generation and could not restore it (${(restoreErr as Error).message}).`,
    );
  }
  return 'foreign';
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
  hooks: AcquireLockHooks = {},
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

    hooks.afterStaleDetected?.();

    // Stale lock: owning process is gone (or confirmed to be a different
    // process via start-time mismatch). Reclaim it SAFELY — never by a
    // blind path-based unlink, which could delete a different generation
    // published after `holder` was read above (see the file-level doc
    // comment).
    const outcome = grabAndVerifyGeneration(
      resolved,
      ledgerDir,
      holder,
      'lock file',
    );
    if (outcome !== 'owned') {
      // 'absent': another contender's reclaim-and-republish already won
      // and grabbed this generation before we could. 'foreign': we grabbed
      // (and already restored) a DIFFERENT, newer generation than the one
      // we validated as stale. Either way we lost this round — fail
      // closed rather than retry (avoids unbounded retry loops / potential
      // starvation under sustained contention).
      throw new LockHeldError(
        resolved,
        currentHolderLabel(resolved, ledgerDir),
      );
    }
    // outcome === 'owned': genuinely the stale generation we validated,
    // safely discarded — fall through to publish our own fresh generation.
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
  const ownRecord = encodeHolder(process.pid);
  const tempPath = `${resolved}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeNewFileDurablyWithinBase(
    tempPath,
    ledgerDir,
    ownRecord,
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

  return {
    release: () => {
      try {
        // Verify — via the same grab-and-verify primitive, comparing the
        // EXACT record this acquisition published above (`ownRecord`) —
        // that this call only ever removes its own generation, never a
        // successor's.
        grabAndVerifyGeneration(
          resolved,
          ledgerDir,
          ownRecord,
          'lock file (release)',
        );
        // 'owned': our own generation was discarded (released). 'absent':
        // already gone (nothing to do). 'foreign': NOT ours — already
        // restored inside grabAndVerifyGeneration; must not be touched.
      } catch (err) {
        // release() typically runs in a caller's `finally` — never let a
        // pathological internal-consistency failure here mask an in-flight
        // exception. Loud, but non-fatal to the caller.
        console.error(
          `[lock] release() failed to safely clear ${resolved}: ${(err as Error).message}`,
        );
      }
    },
  };
}
