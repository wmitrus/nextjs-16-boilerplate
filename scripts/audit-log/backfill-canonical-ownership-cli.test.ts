import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ensureDirectorySyncWithinBase,
  pathEntryExistsWithinBase,
  pathExistsWithinBase,
  readTextFileWithinBase,
  writeTextFileSyncWithinBase,
} from '../lib/fs-guards-shared';

vi.mock('../load-env', () => ({}));
vi.mock('@/core/db/create-db', () => ({ createDb: vi.fn() }));

import {
  finalizeAuditBackfillReport,
  parseAuditBackfillCliArgs,
  reserveAuditBackfillArtifacts,
  resolveAuditBackfillArtifactPaths,
} from './backfill-canonical-ownership-cli';

describe('parseAuditBackfillCliArgs', () => {
  it('defaults to dry-run', () => {
    expect(parseAuditBackfillCliArgs([])).toEqual({
      ok: true,
      invocation: {
        mode: 'dry-run',
        applyWithoutConfirm: false,
        batchSize: 500,
        settingsStartAfterId: null,
        eventsStartAfterId: null,
        decisionsPath: null,
        reportPath: null,
      },
    });
  });

  it('--apply without --confirm remains dry-run', () => {
    const parsed = parseAuditBackfillCliArgs(['--apply']);
    expect(parsed).toMatchObject({
      ok: true,
      invocation: {
        mode: 'dry-run',
        applyWithoutConfirm: true,
      },
    });
  });

  it('requires both evidence paths for confirmed apply', () => {
    expect(
      parseAuditBackfillCliArgs(['--apply', '--confirm']),
    ).toMatchObject({ ok: false });

    expect(
      parseAuditBackfillCliArgs([
        '--apply',
        '--confirm',
        '--decisions=out/decisions.ndjson',
      ]),
    ).toMatchObject({ ok: false });
  });

  it('accepts separate resumability cursors', () => {
    expect(
      parseAuditBackfillCliArgs([
        '--apply',
        '--confirm',
        '--decisions=out/decisions.ndjson',
        '--report=out/report.json',
        '--batch-size=250',
        '--settings-start-after=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '--events-start-after=12345',
      ]),
    ).toEqual({
      ok: true,
      invocation: {
        mode: 'apply',
        applyWithoutConfirm: false,
        batchSize: 250,
        settingsStartAfterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        eventsStartAfterId: 12345,
        decisionsPath: 'out/decisions.ndjson',
        reportPath: 'out/report.json',
      },
    });
  });

  it('rejects an unsafe audit_events cursor', () => {
    expect(
      parseAuditBackfillCliArgs([
        '--events-start-after=9007199254740992',
      ]),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('Number.MAX_SAFE_INTEGER'),
    });
  });
});

describe('AUD·C artifact reservation', () => {
  const CWD = process.cwd();
  const BASE_REL = join('node_modules', '.cache', 'aud-c-cli-test');
  let runDir: string;
  let outsideDir: string;
  const relOf = (name: string): string => relative(CWD, join(runDir, name));

  beforeAll(() => {
    ensureDirectorySyncWithinBase(
      join(CWD, BASE_REL),
      CWD,
      'AUD-C CLI test base',
    );
    runDir = mkdtempSync(join(CWD, BASE_REL, 'run-'));
    outsideDir = mkdtempSync(join(tmpdir(), 'aud-c-cli-outside-'));
  });

  afterAll(() => {
    rmSync(runDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it('resolves distinct in-repo artifact targets', () => {
    const resolved = resolveAuditBackfillArtifactPaths(
      relOf('d.ndjson'),
      relOf('r.json'),
      CWD,
    );
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.paths.physicalDecisions).not.toBe(
        resolved.paths.physicalReport,
      );
      expect(resolved.paths.physicalTmpReport).toMatch(/r\.json\.partial$/);
    }
  });

  it('rejects aliased paths', () => {
    const resolved = resolveAuditBackfillArtifactPaths(
      relOf('same.json'),
      relOf('same.json'),
      CWD,
    );
    expect(resolved).toMatchObject({ ok: false });
  });

  it('rejects a symlinked parent escaping the repo', () => {
    const escape = join(runDir, 'escape');
    symlinkSync(outsideDir, escape);

    const resolved = resolveAuditBackfillArtifactPaths(
      relative(CWD, join(escape, 'd.ndjson')),
      relOf('r.json'),
      CWD,
    );
    expect(resolved).toMatchObject({ ok: false });
  });

  it('reserves WAL + partial report before DB work and atomically publishes report', () => {
    const decisionsRel = relOf('reserved.ndjson');
    const reportRel = relOf('reserved.json');
    const partialRel = `${reportRel}.partial`;

    const reserved = reserveAuditBackfillArtifacts(
      decisionsRel,
      reportRel,
      CWD,
    );

    expect(pathExistsWithinBase(decisionsRel, CWD, 'decisions')).toBe(true);
    expect(pathExistsWithinBase(partialRel, CWD, 'partial')).toBe(true);
    expect(pathEntryExistsWithinBase(reportRel, CWD, 'report')).toBe(false);

    finalizeAuditBackfillReport(
      reserved,
      JSON.stringify({ runId: 'aud-c', done: true }, null, 2),
    );

    closeSync(reserved.decisionsFd!);
    closeSync(reserved.reportTmpFd!);

    expect(pathExistsWithinBase(reportRel, CWD, 'report')).toBe(true);
    expect(pathExistsWithinBase(partialRel, CWD, 'partial')).toBe(false);
    expect(
      JSON.parse(readTextFileWithinBase(reportRel, CWD, 'report')),
    ).toMatchObject({ runId: 'aud-c', done: true });
  });

  it('never overwrites an existing evidence path', () => {
    const decisionsRel = relOf('existing.ndjson');
    const reportRel = relOf('existing.json');
    writeTextFileSyncWithinBase(
      decisionsRel,
      CWD,
      'prior evidence\n',
      'fixture',
    );

    expect(() =>
      reserveAuditBackfillArtifacts(decisionsRel, reportRel, CWD),
    ).toThrow(/already exists/i);

    expect(
      readTextFileWithinBase(decisionsRel, CWD, 'fixture'),
    ).toBe('prior evidence\n');
  });

  it('rejects a dangling symlink occupying the final report name', () => {
    const reportRel = relOf('dangling.json');
    const target = join(runDir, 'missing-target');
    symlinkSync(target, join(runDir, 'dangling.json'));

    expect(() =>
      reserveAuditBackfillArtifacts(
        relOf('dangling.ndjson'),
        reportRel,
        CWD,
      ),
    ).toThrow(/already exists/i);
  });
});
