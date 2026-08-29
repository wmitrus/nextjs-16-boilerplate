import { chmod, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  assertPathWithinBase,
  ensureDirectoryWithinBase,
  readTextFileWithinBase,
  writeTextFileWithinBase,
} from '../lib/fs-guards-shared';

const chmodAsync = promisify(chmod);

/**
 * Raw, environment-specific evidence never lives in the repo (per OZI-75's
 * evidence-storage constraint) -- it goes here instead, outside any git
 * working tree. `staging`/`production` (OZI-79) are structurally supported
 * -- the type below and the confinement/permission logic apply identically
 * to all three. As of OZI-79 Phase B2, `cli.ts`'s `plan --target=staging|
 * production --execute-remote-explain` does write here for real, behind
 * its own fail-closed acknowledgement/clean-tree/resolvable-commit
 * preconditions -- see that command's doc comment. This module's
 * confinement/permission logic was already reviewed for all three
 * environments before that command existed; nothing about it changed to
 * accommodate the command.
 */
const EVIDENCE_ROOT = path.resolve(
  homedir(),
  '.local',
  'share',
  'nextjs-16-boilerplate',
  'ozi-75',
);

export type EvidenceEnvironment = 'local' | 'staging' | 'production';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

/**
 * `assertPathWithinBase` (used by `ensureDirectoryWithinBase`/
 * `writeTextFileWithinBase` below) is a lexical check: `path.resolve()`
 * plus a string-prefix comparison. It does not detect a symlink planted at
 * or under `EVIDENCE_ROOT` that points somewhere else entirely -- a
 * `writeFile` call happily follows such a symlink, silently writing
 * outside the intended, confined directory despite the lexical check
 * passing. This walks every already-existing path segment from
 * `EVIDENCE_ROOT` down to (and including) the target itself with
 * `lstatSync` -- which, unlike `statSync`, reports the symlink itself
 * rather than following it -- and refuses if any of them is one. A
 * segment that doesn't exist yet is fine (this function runs before the
 * directory/file is created).
 */
function assertNoSymlinkInPath(
  targetPath: string,
  root: string,
  label: string,
): void {
  const relative = path.relative(root, targetPath);
  const segments = relative.split(path.sep).filter(Boolean);

  // Check `root` itself, then each path segment from `root` down to
  // (and including) `targetPath`.
  const pathsToCheck = [root];
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    pathsToCheck.push(current);
  }

  for (const candidate of pathsToCheck) {
    let stat;
    try {
      // `candidate` is built exclusively from `root` plus the segments of
      // `path.relative(root, targetPath)` above -- it is this function's
      // own confinement check, not an unconfined caller-supplied path.
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- see comment above
      stat = lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }

    if (stat.isSymbolicLink()) {
      throw new Error(
        `Security: ${label} contains a symlink at ${candidate} -- refusing to ` +
          `write through it. The confined evidence directory must not contain ` +
          `symlinks at any level.`,
      );
    }
  }
}

/**
 * Writes `content` to `<EVIDENCE_ROOT>/<environment>/<fileName>`, confined
 * to `EVIDENCE_ROOT` both lexically (SEC-16, via `assertPathWithinBase`
 * inside the shared helpers) and against symlinks (`assertNoSymlinkInPath`
 * above) -- `fileName` is caller-supplied (a timestamped name built by the
 * CLI), so confinement is enforced here rather than trusted from the call
 * site. The directory and file are also given explicit, restrictive
 * permissions (0700/0600) rather than relying on the process umask, since
 * this evidence may eventually include production-environment output.
 */
export async function writeEvidence(
  environment: EvidenceEnvironment,
  fileName: string,
  content: string,
): Promise<string> {
  const targetDir = path.resolve(EVIDENCE_ROOT, environment);
  // Constrain before inspecting symlinks: a filename that lexically escapes
  // the evidence root must not make even an `lstat` call outside it.
  const targetFile = assertPathWithinBase(
    path.resolve(targetDir, fileName),
    EVIDENCE_ROOT,
    'ozi-75 evidence file',
  );

  assertNoSymlinkInPath(targetDir, EVIDENCE_ROOT, 'ozi-75 evidence directory');
  assertNoSymlinkInPath(targetFile, EVIDENCE_ROOT, 'ozi-75 evidence file');

  const envDir = await ensureDirectoryWithinBase(
    targetDir,
    EVIDENCE_ROOT,
    'ozi-75 evidence directory',
  );
  await chmodAsync(envDir, DIRECTORY_MODE);

  const written = await writeTextFileWithinBase(
    targetFile,
    EVIDENCE_ROOT,
    content,
    'ozi-75 evidence file',
  );
  await chmodAsync(written, FILE_MODE);

  return written;
}

/**
 * Reads a previously persisted evidence file from the same confined,
 * environment-specific store `writeEvidence` owns. Remote inventory scans
 * deliberately accept an evidence *file name*, never an arbitrary path: the
 * approved EXPLAIN artifact must already have crossed this boundary before it
 * can authorize a scan. Keep the symlink checks on reads too -- confinement
 * is a property of the filesystem sink/source, not merely of writes.
 */
export async function readEvidence(
  environment: Exclude<EvidenceEnvironment, 'local'>,
  fileName: string,
): Promise<string> {
  const targetDir = path.resolve(EVIDENCE_ROOT, environment);
  const targetFile = path.resolve(targetDir, fileName);

  assertNoSymlinkInPath(targetDir, EVIDENCE_ROOT, 'ozi-75 evidence directory');
  assertNoSymlinkInPath(targetFile, EVIDENCE_ROOT, 'ozi-75 evidence file');

  const safeTargetDir = path.resolve(targetDir);
  if (
    targetFile === safeTargetDir ||
    !targetFile.startsWith(`${safeTargetDir}${path.sep}`)
  ) {
    throw new Error(
      'Security: approved evidence file must remain within its target evidence directory.',
    );
  }

  return readTextFileWithinBase(
    targetFile,
    EVIDENCE_ROOT,
    'ozi-75 evidence file',
  );
}

export function describeEvidenceRoot(): string {
  return EVIDENCE_ROOT;
}

/** Exposed for tests only -- not part of the module's real usage surface. */
export const __test__ = { assertNoSymlinkInPath };
