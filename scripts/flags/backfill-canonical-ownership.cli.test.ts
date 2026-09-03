import { mkdtempSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ensureDirectorySyncWithinBase,
  readTextFileWithinBase,
  writeTextFileSyncWithinBase,
} from '../lib/fs-guards-shared';

vi.mock('../load-env', () => ({}));
vi.mock('@/core/db/create-db', () => ({ createDb: vi.fn() }));

import {
  checkArtifactPathIsNew,
  parseBackfillCliArgs,
} from './backfill-canonical-ownership';

describe('parseBackfillCliArgs — mode + operator gate', () => {
  it('no args -> dry-run', () => {
    const r = parseBackfillCliArgs([]);
    expect(r).toEqual({
      ok: true,
      invocation: expect.objectContaining({
        mode: 'dry-run',
        applyWithoutConfirm: false,
      }),
    });
  });

  it('--apply without --confirm -> dry-run, flagged', () => {
    const r = parseBackfillCliArgs(['--apply']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.invocation.mode).toBe('dry-run');
      expect(r.invocation.applyWithoutConfirm).toBe(true);
    }
  });

  it('--apply --confirm WITHOUT both evidence paths -> rejected (before any DB access)', () => {
    expect(parseBackfillCliArgs(['--apply', '--confirm'])).toMatchObject({
      ok: false,
      error: expect.stringContaining('requires BOTH --decisions'),
    });
    expect(
      parseBackfillCliArgs(['--apply', '--confirm', '--decisions=a.ndjson']),
    ).toMatchObject({ ok: false });
    expect(
      parseBackfillCliArgs(['--apply', '--confirm', '--report=a.json']),
    ).toMatchObject({ ok: false });
  });

  it('--apply --confirm WITH both evidence paths -> apply', () => {
    const r = parseBackfillCliArgs([
      '--apply',
      '--confirm',
      '--decisions=out/d.ndjson',
      '--report=out/r.json',
      '--batch-size=50',
      '--start-after=abc',
    ]);
    expect(r).toEqual({
      ok: true,
      invocation: {
        mode: 'apply',
        applyWithoutConfirm: false,
        batchSize: 50,
        startAfterId: 'abc',
        decisionsPath: 'out/d.ndjson',
        reportPath: 'out/r.json',
      },
    });
  });
});

describe('checkArtifactPathIsNew — no silent overwrite', () => {
  // Confined to a repo-relative dir because `checkArtifactPathIsNew` resolves
  // against `process.cwd()` (the same guard the CLI applies to operator paths).
  const CWD = process.cwd();
  const BASE_REL = join('node_modules', '.cache', 'ffc-cli-test');
  let dir: string;
  let existingRel: string;
  const ORIGINAL = 'prior dry-run audit evidence\n';

  beforeAll(() => {
    ensureDirectorySyncWithinBase(join(CWD, BASE_REL), CWD, 'cli-test base');
    dir = mkdtempSync(join(CWD, BASE_REL, 'run-'));
    existingRel = relative(CWD, join(dir, 'prior.ndjson'));
    writeTextFileSyncWithinBase(existingRel, CWD, ORIGINAL, 'cli-test fixture');
  });

  afterAll(() => {
    // eslint-disable-next-line no-restricted-syntax -- `dir` is this test's own mkdtempSync() result under the repo; never external
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a path that does not exist', () => {
    expect(
      checkArtifactPathIsNew(
        join(BASE_REL, 'nope', 'fresh.ndjson'),
        'decisions',
      ),
    ).toBeNull();
  });

  it('returns an error for an existing path and does NOT modify the file', () => {
    const err = checkArtifactPathIsNew(existingRel, 'decisions');
    expect(err).toEqual(expect.stringContaining('already exists'));
    expect(readTextFileWithinBase(existingRel, CWD, 'cli-test fixture')).toBe(
      ORIGINAL,
    );
  });

  it('an absolute in-repo path resolves the same way', () => {
    expect(checkArtifactPathIsNew(join(CWD, existingRel), 'report')).toEqual(
      expect.stringContaining('already exists'),
    );
    expect(readTextFileWithinBase(existingRel, CWD, 'cli-test fixture')).toBe(
      ORIGINAL,
    );
  });
});
