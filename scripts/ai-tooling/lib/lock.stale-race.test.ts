/**
 * Deterministic regression for the STALE-GENERATION reclaim race (follow-up
 * to the create/write TOCTOU fixed by the `acquireLock` rewrite): the
 * create/write fix alone does not stop two contenders that both observe the
 * SAME stale lock generation from racing to reclaim it — whichever
 * contender's cleanup+republish runs LAST could `unlink` (or blindly
 * overwrite) the FIRST contender's freshly published, live generation
 * instead of the stale one it actually validated.
 *
 * Unlike `lock.concurrency.test.ts` (real, non-deterministic two-process
 * timing), this test forces the exact interleaving deterministically, in a
 * single process, via `acquireLock`'s test-only `afterStaleDetected` hook:
 * contender A pauses there (having already read+validated the stale
 * generation, but before touching the filesystem), contender B runs its
 * ENTIRE reclaim-and-publish to completion, then A resumes and attempts its
 * own reclaim of what it still believes is the same stale generation.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, LockHeldError } from './lock';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lock-stale-race-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DEAD_PID = '999999'; // virtually guaranteed not to exist

describe('acquireLock — stale-generation reclaim race (deterministic)', () => {
  it("two independent contenders that observe the SAME stale generation: exactly one reclaims and acquires, the other fails closed WITHOUT destroying the winner's generation", () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    // Pre-create one stale lock (dead pid) — the generation BOTH contenders
    // below will independently read and validate as stale.
    writeFileSync(lockPath, DEAD_PID);

    let contenderB:
      | { ok: true; release: () => void }
      | { ok: false; error: unknown }
      | undefined;

    // Contender A. Its hook fires the instant it has determined the
    // pre-created lock is stale, but BEFORE it has touched the filesystem
    // to reclaim it — exactly the window the original bug exploited.
    let resultA:
      | { ok: true; release: () => void }
      | { ok: false; error: unknown };
    try {
      const lockA = acquireLock(lockPath, dir, {
        afterStaleDetected: () => {
          // Contender B starts here, independently observes the SAME
          // still-untouched stale file A just read, and runs its ENTIRE
          // reclaim-and-publish to completion before A resumes.
          try {
            const lockB = acquireLock(lockPath, dir);
            contenderB = { ok: true, release: lockB.release };
          } catch (error) {
            contenderB = { ok: false, error };
          }
        },
      });
      resultA = { ok: true, release: lockA.release };
    } catch (error) {
      resultA = { ok: false, error };
    }

    if (!contenderB) throw new Error('afterStaleDetected hook did not fire');

    // Exactly one of {A, B} acquired.
    const acquired = [resultA, contenderB].filter((r) => r.ok);
    const failed = [resultA, contenderB].filter((r) => !r.ok);
    expect(acquired).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // The loser failed CLOSED with LockHeldError, not silently or via some
    // other unrelated crash.
    const loserError = (failed[0] as { ok: false; error: unknown }).error;
    expect(loserError).toBeInstanceOf(LockHeldError);

    // The winner's generation is genuinely intact on disk RIGHT NOW: it was
    // never destroyed by the loser's failed reclaim attempt (proves the
    // loser's grab-and-verify correctly restored it instead of discarding
    // it).
    expect(existsSync(lockPath)).toBe(true);
    const survivingContent = readFileSync(lockPath, 'utf8').trim();
    expect(survivingContent).not.toBe(DEAD_PID);
    expect(survivingContent).toContain(String(process.pid));

    // The winner can still cleanly release its OWN (surviving, untouched)
    // generation.
    const winner = (acquired[0] as { ok: true; release: () => void }).release;
    winner();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("the loser's failed reclaim attempt cannot be laundered into deleting the winner's generation via release() either", () => {
    // Defense in depth for the related release problem: even if some
    // future bug produced a `release` handle bound to a generation that no
    // longer occupies the lock path (because it was reclaimed as stale and
    // replaced by a different, live generation), release() must verify
    // identity via the same grab-and-verify primitive rather than blindly
    // unlinking whatever is currently there.
    const lockPath = path.join(dir, 'reconcile.lock');
    const lockA = acquireLock(lockPath, dir);
    const generationAContent = readFileSync(lockPath, 'utf8').trim();

    // Simulate A's generation being reclaimed-and-replaced by a different,
    // legitimate generation B (exactly what a correct reclaim by another
    // contender produces) while A still holds its (now stale) release
    // handle. Content, not filesystem inode identity, is the fingerprint
    // this module actually compares (see lock.ts's file-level doc comment
    // on why inode identity is unsafe — the OS is free to reuse an inode
    // number immediately after it is freed), so distinguish the two
    // generations the same way: by their full recorded content, which
    // differs even though both come from this same test process (each
    // `acquireLock` call mints a fresh random nonce).
    rmSync(lockPath);
    const lockB = acquireLock(lockPath, dir);
    const generationBContent = readFileSync(lockPath, 'utf8').trim();
    expect(generationBContent).not.toBe(generationAContent);

    // A's stale release handle must NOT be able to remove B's generation.
    lockA.release();

    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(generationBContent);

    // B can still cleanly release its own, untouched generation.
    lockB.release();
    expect(existsSync(lockPath)).toBe(false);
  });
});
