/**
 * Regression for the STALE-LOCK area, updated for the fail-closed design:
 * `acquireLock` no longer attempts automatic reclamation of a stale lock at
 * all (two earlier reclaim protocols — plain unlink, then a
 * rename-grab-verify-restore scheme — were each found exploitable under
 * 2-way and 3-way contention respectively; see lock.ts's file-level doc
 * comment). With reclamation removed entirely, "two contenders observing
 * the same stale lock" no longer needs a forced interleaving to test: ANY
 * number of contenders against a stale lock all fail closed deterministically,
 * every time, without touching the filesystem.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, StaleLockError } from './lock';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lock-stale-race-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DEAD_PID = '999999'; // virtually guaranteed not to exist

describe('acquireLock — stale lock, fail-closed (no automatic reclamation)', () => {
  it('two independent contenders that observe the SAME stale lock: NEITHER can automatically reclaim/delete it — both fail closed, the file is left byte-identical throughout', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    writeFileSync(lockPath, DEAD_PID);

    // Contender A.
    expect(() => acquireLock(lockPath, dir)).toThrow(StaleLockError);
    expect(readFileSync(lockPath, 'utf8')).toBe(DEAD_PID);

    // Contender B, independently, against the exact same still-untouched
    // stale file.
    expect(() => acquireLock(lockPath, dir)).toThrow(StaleLockError);
    expect(readFileSync(lockPath, 'utf8')).toBe(DEAD_PID);

    // A third, for good measure — fail-closed is not a one-shot side
    // effect; it is the permanent state until an operator intervenes.
    expect(() => acquireLock(lockPath, dir)).toThrow(StaleLockError);
    expect(readFileSync(lockPath, 'utf8')).toBe(DEAD_PID);

    // Nothing in the ledger dir besides the untouched stale lock itself —
    // no temp/grab artifacts of any kind, because no reclaim protocol runs.
    expect(readdirSync(dir)).toEqual(['reconcile.lock']);
  });

  it('a stale lock only ever yields to an OPERATOR removing it manually — acquisition then proceeds normally', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    writeFileSync(lockPath, DEAD_PID);

    expect(() => acquireLock(lockPath, dir)).toThrow(StaleLockError);

    // The documented manual-cleanup step.
    rmSync(lockPath);

    const lock = acquireLock(lockPath, dir);
    lock.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('no `.tmp` or `.grab` artifacts remain in the ledger dir after a normal acquire+release cycle', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    const lock = acquireLock(lockPath, dir);
    // While held, only the published lock file itself exists — the private
    // temp sibling used to durably write the holder record before
    // publishing is cleaned up as part of the publish step.
    expect(readdirSync(dir)).toEqual(['reconcile.lock']);
    lock.release();
    expect(readdirSync(dir)).toEqual([]);
  });
});
