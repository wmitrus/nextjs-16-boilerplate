import { readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { describeEvidenceRoot, writeLocalEvidence } from './evidence-store';

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

  it('writes an allowed file name under local/', async () => {
    const written = await writeLocalEvidence(
      'local',
      '__test__.json',
      '{"ok":true}',
    );

    expect(written).toBe(path.resolve(EVIDENCE_ROOT, 'local', '__test__.json'));

    // `written` is this test's own return value from `writeLocalEvidence`,
    // already confined to EVIDENCE_ROOT by that function -- read back and
    // clean up the exact file this test just created and owns.
    // eslint-disable-next-line security/detect-non-literal-fs-filename, no-restricted-syntax -- see comment above
    expect(readFileSync(written, 'utf8')).toBe('{"ok":true}');
    // eslint-disable-next-line no-restricted-syntax -- see comment above
    rmSync(written, { force: true });
  });

  it('rejects a file name that attempts to escape the evidence root', async () => {
    await expect(
      writeLocalEvidence('local', '../../../etc/passwd', 'pwned'),
    ).rejects.toThrow('escapes the allowed directory');
  });
});
