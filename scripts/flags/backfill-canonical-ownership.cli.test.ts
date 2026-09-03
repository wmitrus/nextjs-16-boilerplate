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

import type { LegacyOwnershipEvidence } from '@/core/contracts/legacy-ownership-classification';

import {
  ensureDirectorySyncWithinBase,
  pathExistsWithinBase,
  publishFileAtomicallyWithinBase,
  readTextFileWithinBase,
  writeNewFileDurablyWithinBase,
  writeTextFileSyncWithinBase,
} from '../lib/fs-guards-shared';

vi.mock('../load-env', () => ({}));
vi.mock('@/core/db/create-db', () => ({ createDb: vi.fn() }));

import {
  checkArtifactPathIsNew,
  finalizeBackfillReport,
  normalizeEvidence,
  parseBackfillCliArgs,
  reserveBackfillArtifacts,
  resolveArtifactPaths,
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

  it('atomic publish: durable temp write -> link produces a complete file, no .partial left', () => {
    const finalRel = relative(CWD, join(dir, 'summary.json'));
    const tmpRel = `${finalRel}.partial`;
    const body = `${JSON.stringify({ runId: 'x', done: true })}\n`;

    writeNewFileDurablyWithinBase(tmpRel, CWD, body, 'report (temp)');
    expect(pathExistsWithinBase(tmpRel, CWD, 'report (temp)')).toBe(true);
    publishFileAtomicallyWithinBase(tmpRel, finalRel, CWD, 'report');

    expect(pathExistsWithinBase(tmpRel, CWD, 'report (temp)')).toBe(false); // temp gone
    expect(readTextFileWithinBase(finalRel, CWD, 'report')).toBe(body); // complete
  });

  it('no-clobber: publish refuses when the destination already exists at publication time, and leaves it byte-for-byte unchanged', () => {
    const finalRel = relative(CWD, join(dir, 'preexisting.json'));
    const tmpRel = `${finalRel}.partial`;
    const ORIGINAL_DEST = `${JSON.stringify({ from: 'a concurrent writer' })}\n`;

    // Destination is created AFTER a caller might have checked it was absent —
    // exactly the check-then-act window `link(2)` closes.
    writeTextFileSyncWithinBase(finalRel, CWD, ORIGINAL_DEST, 'dest fixture');
    writeNewFileDurablyWithinBase(tmpRel, CWD, 'newer body\n', 'report (temp)');

    expect(() =>
      publishFileAtomicallyWithinBase(tmpRel, finalRel, CWD, 'report'),
    ).toThrow(/Refusing to overwrite/i);
    expect(readTextFileWithinBase(finalRel, CWD, 'dest fixture')).toBe(
      ORIGINAL_DEST,
    ); // untouched
    expect(pathExistsWithinBase(tmpRel, CWD, 'report (temp)')).toBe(true); // temp preserved for retry
  });
});

describe('resolveArtifactPaths — physical alias / confinement preflight (finding P2)', () => {
  const CWD = process.cwd();
  const BASE_REL = join('node_modules', '.cache', 'ffc-alias-test');
  let runDir: string; // absolute mkdtemp dir under the repo
  let realRel: string; // repo-relative real directory
  let linkRel: string; // repo-relative symlink -> realRel (same physical dir)
  let escapeRel: string; // repo-relative symlink -> a dir OUTSIDE the repo
  let outsideDir: string; // that outside dir (under os.tmpdir())

  beforeAll(() => {
    ensureDirectorySyncWithinBase(join(CWD, BASE_REL), CWD, 'alias-test base');
    runDir = mkdtempSync(join(CWD, BASE_REL, 'run-'));
    const real = join(runDir, 'real');
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- this suite's own mkdtemp scratch dir
    mkdirSync(real);
    realRel = relative(CWD, real);

    const link = join(runDir, 'link');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- suite-owned scratch symlink
    symlinkSync(real, link); // link/ and real/ are the same physical dir
    linkRel = relative(CWD, link);

    outsideDir = mkdtempSync(join(tmpdir(), 'ffc-escape-'));
    const escape = join(runDir, 'escape');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- suite-owned scratch symlink pointing outside the repo on purpose
    symlinkSync(outsideDir, escape); // escape/ points outside the repo
    escapeRel = relative(CWD, escape);
  });

  afterAll(() => {
    // eslint-disable-next-line no-restricted-syntax -- test's own mkdtempSync() dirs
    rmSync(runDir, { recursive: true, force: true });
    // eslint-disable-next-line no-restricted-syntax -- test's own mkdtempSync() dir
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it('three distinct repo-contained paths -> ok, with validated PHYSICAL targets', () => {
    const r = resolveArtifactPaths(
      join(realRel, 'd.ndjson'),
      join(realRel, 'r.json'),
      CWD,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.paths.physicalDecisions).toBe(join(runDir, 'real', 'd.ndjson'));
      expect(r.paths.physicalReport).toBe(join(runDir, 'real', 'r.json'));
      expect(r.paths.physicalTmpReport).toBe(
        join(runDir, 'real', 'r.json.partial'),
      );
    }
  });

  it('identical decisions/report -> rejected before any WAL / DB access', () => {
    const r = resolveArtifactPaths(
      join(realRel, 'same.json'),
      join(realRel, 'same.json'),
      CWD,
    );
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/same physical path/i);
  });

  it('--decisions equals <report>.partial -> rejected', () => {
    const r = resolveArtifactPaths(
      join(realRel, 'r.json.partial'),
      join(realRel, 'r.json'),
      CWD,
    );
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/--report \(temp\)/i);
  });

  it('lexical alias (out/../report.json vs report.json) -> still rejected', () => {
    const r = resolveArtifactPaths(
      `${realRel}/sub/../d.ndjson`,
      join(realRel, 'd.ndjson'),
      CWD,
    );
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/same physical path/i);
  });

  it('decisions through a SYMLINKED parent + report through the REAL parent resolving to the same inode -> rejected', () => {
    const r = resolveArtifactPaths(
      join(linkRel, 'x.json'), // link/ -> real/
      join(realRel, 'x.json'),
      CWD,
    );
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/same physical path/i);
  });

  it('a symlinked parent directory that escapes the repo -> rejected (physical confinement)', () => {
    const r = resolveArtifactPaths(
      join(escapeRel, 'd.ndjson'), // escape/ -> os.tmpdir()/...
      join(realRel, 'r.json'),
      CWD,
    );
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/physical/i);
  });

  it('a missing parent directory -> rejected (open() cannot create it)', () => {
    const r = resolveArtifactPaths(
      join(realRel, 'nope', 'd.ndjson'),
      join(realRel, 'r.json'),
      CWD,
    );
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/parent directory does not exist/i);
  });
});

describe('reserveBackfillArtifacts / finalizeBackfillReport — reserve temp BEFORE DB (finding: artifact-gate)', () => {
  const CWD = process.cwd();
  const BASE_REL = join('node_modules', '.cache', 'ffc-reserve-test');
  let runDir: string;
  let relOf: (name: string) => string;

  beforeAll(() => {
    ensureDirectorySyncWithinBase(
      join(CWD, BASE_REL),
      CWD,
      'reserve-test base',
    );
    runDir = mkdtempSync(join(CWD, BASE_REL, 'run-'));
    relOf = (name: string) => relative(CWD, join(runDir, name));
  });

  afterAll(() => {
    // eslint-disable-next-line no-restricted-syntax -- test's own mkdtempSync() dir
    rmSync(runDir, { recursive: true, force: true });
  });

  it('A — report parent cannot be resolved: fails BEFORE any fd is opened / DB touched', () => {
    const decisionsRel = relOf('A-d.ndjson');
    expect(() =>
      reserveBackfillArtifacts(decisionsRel, relOf('A-missing/r.json'), CWD),
    ).toThrow(/parent directory does not exist/i);
    // resolution throws before opening ANYTHING — the decisions WAL is absent
    expect(pathExistsWithinBase(decisionsRel, CWD, 'decisions')).toBe(false);
  });

  it('B — normal apply: <report>.partial is reserved up front; final --report is NOT pre-created; finalize publishes it and removes the temp', () => {
    const decisionsRel = relOf('B-d.ndjson');
    const reportRel = relOf('B-r.json');
    const tmpRel = `${reportRel}.partial`;

    const reserved = reserveBackfillArtifacts(decisionsRel, reportRel, CWD);
    expect(reserved.decisionsFd).not.toBeNull();
    expect(reserved.reportTmpFd).not.toBeNull();
    expect(pathExistsWithinBase(tmpRel, CWD, 'temp')).toBe(true); // reserved before DB
    expect(pathExistsWithinBase(reportRel, CWD, 'report')).toBe(false); // NOT pre-created

    finalizeBackfillReport(
      reserved,
      `${JSON.stringify({ runId: 'B', done: true }, null, 2)}\n`,
    );
    closeSync(reserved.decisionsFd!);
    closeSync(reserved.reportTmpFd!);

    expect(pathExistsWithinBase(reportRel, CWD, 'report')).toBe(true); // final appears
    expect(pathExistsWithinBase(tmpRel, CWD, 'temp')).toBe(false); // temp gone
    expect(
      JSON.parse(readTextFileWithinBase(reportRel, CWD, 'report')),
    ).toMatchObject({ runId: 'B', done: true });
  });

  it('C — interrupted after reservation (finalize never runs): final --report absent, <report>.partial remains as incomplete-run evidence', () => {
    const decisionsRel = relOf('C-d.ndjson');
    const reportRel = relOf('C-r.json');
    const tmpRel = `${reportRel}.partial`;

    const reserved = reserveBackfillArtifacts(decisionsRel, reportRel, CWD);
    // simulate the backfill throwing before finalize: run()'s finally just closes fds
    closeSync(reserved.decisionsFd!);
    closeSync(reserved.reportTmpFd!);

    expect(pathExistsWithinBase(reportRel, CWD, 'report')).toBe(false); // never published
    expect(pathExistsWithinBase(tmpRel, CWD, 'temp')).toBe(true); // evidence
    expect(pathExistsWithinBase(decisionsRel, CWD, 'decisions')).toBe(true);
  });

  it('rejects when --decisions / --report / <report>.partial already exists (no truncation), closing any fd already opened', () => {
    const decisionsRel = relOf('D-d.ndjson');
    const reportRel = relOf('D-r.json');
    writeTextFileSyncWithinBase(reportRel, CWD, 'prior\n', 'D fixture');

    expect(() =>
      reserveBackfillArtifacts(decisionsRel, reportRel, CWD),
    ).toThrow(/already exists/i);
    // the decisions WAL must not have been left behind
    expect(pathExistsWithinBase(decisionsRel, CWD, 'decisions')).toBe(false);
  });
});

describe('normalizeEvidence — deterministic multiset snapshot (finding P2 / C)', () => {
  const org = (id: string, parent: string) => ({
    organizationId: id,
    parentTenantId: parent,
  });
  const base = (
    mappings: LegacyOwnershipEvidence['providerMappings'],
  ): LegacyOwnershipEvidence => ({
    legacyValue: 'ext-x',
    nullSemantics: 'proven_intentional_global',
    directInternalOrganization: null,
    isKnownTenantId: false,
    providerMappings: mappings,
  });

  it('provider mappings in a DIFFERENT order normalize to the SAME string', () => {
    const a = base([
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
      {
        provider: 'authjs',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
    ]);
    const b = base([
      {
        provider: 'authjs',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
    ]);
    expect(normalizeEvidence(a)).toBe(normalizeEvidence(b));
  });

  it('a DUPLICATE mapping is preserved (multiset, not a Set) — one vs two identical rows normalize DIFFERENTLY', () => {
    const one = base([
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
    ]);
    const two = base([
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
    ]);
    expect(normalizeEvidence(one)).not.toBe(normalizeEvidence(two));
  });

  it('a changed verified parent tenant changes the snapshot', () => {
    const a = base([
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
    ]);
    const b = base([
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't2'),
      },
    ]);
    expect(normalizeEvidence(a)).not.toBe(normalizeEvidence(b));
  });

  it('an unverified mapping (verified: null) is distinct from a verified one', () => {
    const unver = base([
      { provider: 'clerk', mappedOrganizationId: 'o1', verified: null },
    ]);
    const ver = base([
      {
        provider: 'clerk',
        mappedOrganizationId: 'o1',
        verified: org('o1', 't1'),
      },
    ]);
    expect(normalizeEvidence(unver)).not.toBe(normalizeEvidence(ver));
  });
});
