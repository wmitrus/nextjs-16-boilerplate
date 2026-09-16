import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, LockHeldError, StaleLockError } from './lock';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lock-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('acquireLock', () => {
  it('acquires and releases cleanly', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    const lock = acquireLock(lockPath, dir);
    lock.release();
    // Re-acquiring after release must succeed.
    const second = acquireLock(lockPath, dir);
    second.release();
  });

  it('fails fast when a second process (still alive) holds the lock', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    // Simulate a live holder: our own pid is definitely alive.
    writeFileSync(lockPath, String(process.pid));
    expect(() => acquireLock(lockPath, dir)).toThrow(LockHeldError);
  });

  it('fails CLOSED on a stale lock (dead pid) rather than auto-clearing it, and leaves the file byte-identical', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    // A pid that is virtually guaranteed not to exist.
    const staleContent = '999999';
    writeFileSync(lockPath, staleContent);
    expect(() => acquireLock(lockPath, dir)).toThrow(StaleLockError);
    expect(() => acquireLock(lockPath, dir)).toThrow(
      /automatic stale-lock reclamation is not performed/i,
    );
    // No rename, unlink, or replace happened — the stale file is untouched.
    expect(readFileSync(lockPath, 'utf8')).toBe(staleContent);
  });

  it('creates a not-yet-existing parent directory (fresh install / new AI_INBOX_LEDGER_DIR)', () => {
    // Regression: the ledger dir does not exist yet on a first run against
    // the documented default location, or any new AI_INBOX_LEDGER_DIR — the
    // lock path's parent must not be assumed to pre-exist.
    const lockPath = path.join(dir, 'fresh-ledger-dir', 'reconcile.lock');
    const lock = acquireLock(lockPath, dir);
    lock.release();
  });

  it('rejects a lockPath outside ledgerDir before any filesystem access — path.resolve() alone does not confine', () => {
    const outside = path.join(tmpdir(), 'lock-test-outside.lock');
    expect(() => acquireLock(outside, dir)).toThrow(
      /escapes the allowed directory/,
    );
  });

  it('records own pid+start-time and blocks a second acquire against that exact record', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    const lock = acquireLock(lockPath, dir);
    // acquireLock encodes "<pid>:<starttime>" for our own process — a second
    // acquire against the file it just wrote must see it as genuinely held.
    expect(() => acquireLock(lockPath, dir)).toThrow(LockHeldError);
    lock.release();
  });

  it('PID-reuse guard: a lock whose pid is alive but whose recorded start time no longer matches (simulated reuse) fails CLOSED as stale, not auto-cleared', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    // Our own pid IS alive, but pairing it with a start time that cannot
    // possibly be ours simulates "this pid now belongs to a different,
    // unrelated process than the one that wrote the lock" — the scenario a
    // naive pid-only liveness check would incorrectly treat as still held.
    const staleContent = `${process.pid}:0`;
    writeFileSync(lockPath, staleContent);
    expect(() => acquireLock(lockPath, dir)).toThrow(StaleLockError);
    expect(readFileSync(lockPath, 'utf8')).toBe(staleContent);
  });

  it('release() is idempotent: a second call on the SAME handle is a no-op and cannot affect a later acquisition', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    const first = acquireLock(lockPath, dir);
    first.release();
    first.release(); // must not throw, must not touch the filesystem

    // A brand-new acquisition after the (single, effective) release must
    // succeed normally.
    const second = acquireLock(lockPath, dir);
    // The extra release() call above must not have interfered with it.
    first.release(); // still a no-op, even now that `second` is live
    second.release();
  });
});
