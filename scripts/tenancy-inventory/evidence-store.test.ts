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
  writeLocalEvidence,
} from './evidence-store';

const EVIDENCE_ROOT = path.resolve(
  homedir(),
  '.local',
  'share',
  'nextjs-16-boilerplate',
  'ozi-75',
);

describe('writeLocalEvidence', () => {
  it('is confined to the evidence root, outside the repository', () => {
    expect(describeEvidenceRoot()).toBe(EVIDENCE_ROOT);
    expect(EVIDENCE_ROOT.startsWith(process.cwd())).toBe(false);
  });

  it('writes an allowed file name under local/ with restrictive permissions', async () => {
    const written = await writeLocalEvidence(
      'local',
      '__test__.json',
      '{"ok":true}',
    );

    expect(written).toBe(path.resolve(EVIDENCE_ROOT, 'local', '__test__.json'));

    // `written` is this test's own return value from `writeLocalEvidence`,
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
      writeLocalEvidence('local', '../../../etc/passwd', 'pwned'),
    ).rejects.toThrow('escapes the allowed directory');
  });
});

/**
 * `assertNoSymlinkInPath` is tested in isolation against a disposable
 * temp directory it does not know is not the real `EVIDENCE_ROOT` -- it
 * only cares about the (root, target) pair it's given. Exercising the
 * symlink-rejection path through `writeLocalEvidence` itself would require
 * planting a symlink at the real, shared `EVIDENCE_ROOT/local` (which may
 * already hold real prior scan output) or making `EVIDENCE_ROOT`
 * injectable purely for testability -- neither is worth the risk/cost, and
 * this function is the entire enforcement surface `writeLocalEvidence`
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
