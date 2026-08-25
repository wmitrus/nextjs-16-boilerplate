/**
 * Real cross-process lock-contention test (OZI-28 test #12 / Case H).
 * Spawns two genuinely separate OS processes racing for the same lock
 * file — not a single-process unit test of the lock helper in isolation.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const FIXTURE = path.join(
  REPO_ROOT,
  'scripts/ai-tooling/lib/lock-contender-fixture.ts',
);

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lock-concurrency-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runContender(lockPath: string, holdMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', FIXTURE, lockPath, String(holdMs)], {
      cwd: REPO_ROOT,
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', () => resolve(out.trim()));
  });
}

describe('acquireLock — real two-process contention', () => {
  it('exactly one of two simultaneously-started processes acquires the lock, the other fails fast without mutating anything', async () => {
    const lockPath = path.join(dir, 'reconcile.lock');

    const [resultA, resultB] = await Promise.all([
      runContender(lockPath, 300),
      runContender(lockPath, 300),
    ]);

    const results = [resultA, resultB];
    const acquired = results.filter((r) => r.includes('ACQUIRED'));
    const blocked = results.filter((r) => r.startsWith('BLOCKED:'));

    expect(acquired).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatch(/Reconciliation already running/);

    // The winner released cleanly; the lock file must not be left behind.
    expect(existsSync(lockPath)).toBe(false);
  }, 15000);

  it('a third process started after the first releases can acquire cleanly', async () => {
    const lockPath = path.join(dir, 'reconcile.lock');
    const first = await runContender(lockPath, 50);
    expect(first).toBe('ACQUIRED');
    expect(existsSync(lockPath)).toBe(false);

    const second = await runContender(lockPath, 50);
    expect(second).toBe('ACQUIRED');
  }, 15000);
});
