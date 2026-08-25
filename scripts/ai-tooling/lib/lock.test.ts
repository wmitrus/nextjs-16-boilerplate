import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, LockHeldError } from './lock';

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
    const lock = acquireLock(lockPath);
    lock.release();
    // Re-acquiring after release must succeed.
    const second = acquireLock(lockPath);
    second.release();
  });

  it('fails fast when a second process (still alive) holds the lock', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    // Simulate a live holder: our own pid is definitely alive.
    writeFileSync(lockPath, String(process.pid));
    expect(() => acquireLock(lockPath)).toThrow(LockHeldError);
  });

  it('clears a stale lock left by a dead process and acquires successfully', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    // A pid that is virtually guaranteed not to exist.
    writeFileSync(lockPath, '999999');
    const lock = acquireLock(lockPath);
    lock.release();
  });

  it('creates a not-yet-existing parent directory (fresh install / new AI_INBOX_LEDGER_DIR)', () => {
    // Regression: the ledger dir does not exist yet on a first run against
    // the documented default location, or any new AI_INBOX_LEDGER_DIR — the
    // lock path's parent must not be assumed to pre-exist.
    const lockPath = path.join(dir, 'fresh-ledger-dir', 'reconcile.lock');
    const lock = acquireLock(lockPath);
    lock.release();
  });

  it('records own pid+start-time and blocks a second acquire against that exact record', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    const lock = acquireLock(lockPath);
    // acquireLock encodes "<pid>:<starttime>" for our own process — a second
    // acquire against the file it just wrote must see it as genuinely held.
    expect(() => acquireLock(lockPath)).toThrow(LockHeldError);
    lock.release();
  });

  it('PID-reuse guard: treats a lock as stale when the pid is alive but its recorded start time no longer matches (simulated reuse)', () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    // Our own pid IS alive, but pairing it with a start time that cannot
    // possibly be ours simulates "this pid now belongs to a different,
    // unrelated process than the one that wrote the lock" — the scenario a
    // naive pid-only liveness check would incorrectly treat as still held.
    writeFileSync(lockPath, `${process.pid}:0`);
    const lock = acquireLock(lockPath); // must NOT throw — must clear the stale record
    lock.release();
  });
});
