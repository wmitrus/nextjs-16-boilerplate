import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  __test__,
  describeEvidenceRoot,
  writeEvidence,
} from './evidence-store';

const EVIDENCE_ROOT = path.resolve(
  homedir(),
  '.local',
  'share',
  'nextjs-16-boilerplate',
  'ozi-75',
);

describe('writeEvidence', () => {
  it('is confined to the evidence root, outside the repository', () => {
    expect(describeEvidenceRoot()).toBe(EVIDENCE_ROOT);
    expect(EVIDENCE_ROOT.startsWith(process.cwd())).toBe(false);
  });

  it('writes an allowed file name under local/ with restrictive permissions', async () => {
    const written = await writeEvidence(
      'local',
      '__test__.json',
      '{"ok":true}',
    );

    expect(written).toBe(path.resolve(EVIDENCE_ROOT, 'local', '__test__.json'));

    // `written` is this test's own return value from `writeEvidence`,
    // already confined to EVIDENCE_ROOT by that function -- read back and
    // clean up the exact file this test just created and owns. The parent
    // `local/` directory is real, shared evidence storage (may already
    // hold prior real scan output) -- this test only ever touches the one
    // file it created, never the directory itself.
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- see comment above
    expect(readFileSync(written, 'utf8')).toBe('{"ok":true}');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
    expect(statSync(written).mode & 0o777).toBe(0o600);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
    expect(statSync(path.resolve(EVIDENCE_ROOT, 'local')).mode & 0o777).toBe(
      0o700,
    );

    // eslint-disable-next-line no-restricted-syntax -- see comment above
    rmSync(written, { force: true });
  });

  it('rejects a file name that attempts to escape the evidence root', async () => {
    await expect(
      writeEvidence('local', '../../../etc/passwd', 'pwned'),
    ).rejects.toThrow('escapes the allowed directory');
  });
});

/**
 * `assertNoSymlinkInPath` is tested in isolation against a disposable
 * temp directory it does not know is not the real `EVIDENCE_ROOT` -- it
 * only cares about the (root, target) pair it's given. Exercising the
 * symlink-rejection path through `writeEvidence` itself would require
 * planting a symlink at the real, shared `EVIDENCE_ROOT/local` (which may
 * already hold real prior scan output) or making `EVIDENCE_ROOT`
 * injectable purely for testability -- neither is worth the risk/cost, and
 * this function is the entire enforcement surface `writeEvidence`
 * delegates to, so testing it directly is equally strong evidence.
 */
describe('assertNoSymlinkInPath', () => {
  const scratchRoot = mkdtempSync(path.join(tmpdir(), 'ozi-75-symlink-test-'));

  afterAll(() => {
    // eslint-disable-next-line no-restricted-syntax -- this suite's own mkdtemp scratch directory
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('allows a path with no existing symlink anywhere along it', () => {
    expect(() =>
      __test__.assertNoSymlinkInPath(
        path.resolve(scratchRoot, 'sub', 'does-not-exist-yet.json'),
        scratchRoot,
        'test path',
      ),
    ).not.toThrow();
  });

  it('rejects when an intermediate directory is a symlink', () => {
    const realTarget = path.resolve(scratchRoot, 'real-target');
    const symlinkedDir = path.resolve(scratchRoot, 'symlinked-dir');
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- this suite's own mkdtemp scratch directory
    mkdirSync(realTarget, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
    symlinkSync(realTarget, symlinkedDir, 'dir');

    expect(() =>
      __test__.assertNoSymlinkInPath(
        path.resolve(symlinkedDir, 'evidence.json'),
        scratchRoot,
        'test path',
      ),
    ).toThrow('symlink');
  });

  it('rejects when the target file itself already exists as a symlink', () => {
    const realFile = path.resolve(scratchRoot, 'real-file.json');
    const symlinkedFile = path.resolve(scratchRoot, 'symlinked-file.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- test-owned scratch path
    writeFileSync(realFile, '{}');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
    symlinkSync(realFile, symlinkedFile);

    expect(() =>
      __test__.assertNoSymlinkInPath(symlinkedFile, scratchRoot, 'test path'),
    ).toThrow('symlink');
  });
});

describe('readEvidence confinement', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ozi-79-evidence-read-test-'));

  afterAll(() => {
    // eslint-disable-next-line no-restricted-syntax -- suite-owned temp root
    rmSync(root, { recursive: true, force: true });
  });

  function write(
    environment: 'staging' | 'production',
    fileName: string,
  ): void {
    const dir = path.resolve(root, environment);
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- suite-owned paths
    mkdirSync(dir, { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- suite-owned paths
    writeFileSync(path.resolve(dir, fileName), '{"version":2}');
  }

  it.each(['production', 'staging'] as const)(
    'reads a valid %s filename',
    (environment) => {
      write(environment, 'approved.json');
      expect(
        __test__.readEvidenceWithinRoot(root, environment, 'approved.json'),
      ).toBe('{"version":2}');
    },
  );

  it.each([
    '../approved.json',
    '../../outside.json',
    path.resolve(root, 'production', 'approved.json'),
    '../staging/approved.json',
    'nested/approved.json',
    'nested\\approved.json',
    '.',
    '..',
    '',
  ])('rejects non-filename artifact input without exposing it', (fileName) => {
    expect(() =>
      __test__.readEvidenceWithinRoot(root, 'production', fileName),
    ).toThrow(/must be a non-empty filename/);
  });

  it('rejects symlinked files and intermediate directories after confinement', () => {
    const production = path.resolve(root, 'production');
    const outside = path.resolve(root, 'outside.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- suite-owned paths
    writeFileSync(outside, '{}');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- suite-owned paths
    symlinkSync(outside, path.resolve(production, 'symlinked.json'));
    expect(() =>
      __test__.readEvidenceWithinRoot(root, 'production', 'symlinked.json'),
    ).toThrow(/symlink/);

    const symlinkRoot = path.resolve(root, 'symlink-root');
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- suite-owned paths
    mkdirSync(symlinkRoot);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- suite-owned paths
    symlinkSync(production, path.resolve(symlinkRoot, 'production'));
    expect(() =>
      __test__.readEvidenceWithinRoot(
        symlinkRoot,
        'production',
        'approved.json',
      ),
    ).toThrow(/symlink/);
  });
});
