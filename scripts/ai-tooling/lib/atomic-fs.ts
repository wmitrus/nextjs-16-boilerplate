/**
 * Atomic, sink-confined filesystem primitives for the reconciliation
 * workflow: temp-file + fsync + rename, never truncate-then-rewrite.
 *
 * Reuses the repo's existing sink-confinement helper
 * (`scripts/lib/fs-guards-shared.ts`) rather than re-inventing path
 * validation; adds the atomic-rename write primitive that helper does not
 * provide.
 */

import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

import { assertPathWithinBase } from '../../lib/fs-guards-shared';

export type FileFingerprint = {
  content: string;
  hash: string;
};

export function hashContent(content: string): string {
  // Not cryptographic use — cheap change-detection fingerprint only.
  let h = 0;
  for (let i = 0; i < content.length; i += 1) {
    h = (Math.imul(31, h) + content.charCodeAt(i)) | 0;
  }
  return `${h}:${content.length}`;
}

/** Read a file (confined to `baseDir`) and capture a fingerprint for later change-detection. */
export function readWithFingerprint(
  filePath: string,
  baseDir: string,
  label = 'file',
): FileFingerprint {
  const safePath = assertPathWithinBase(path.resolve(filePath), baseDir, label);
  const content = readFileSync(safePath, 'utf8');
  return { content, hash: hashContent(content) };
}

/**
 * Atomically replace `filePath` with `content`: write to a sibling temp
 * file, fsync, then rename over the original. Never truncates the source
 * before the replacement content is durable.
 */
export function atomicWriteWithinBase(
  filePath: string,
  baseDir: string,
  content: string,
  label = 'file',
): void {
  const safePath = assertPathWithinBase(path.resolve(filePath), baseDir, label);
  const dir = path.dirname(safePath);
  mkdirSync(assertPathWithinBase(dir, baseDir, `${label} directory`), {
    recursive: true,
  });
  const tmpPath = assertPathWithinBase(
    path.resolve(
      dir,
      `.${path.basename(safePath)}.tmp.${randomBytes(4).toString('hex')}`,
    ),
    baseDir,
    `${label} temp file`,
  );

  const fd = openSync(tmpPath, 'w');
  try {
    writeSync(fd, content, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  renameSync(tmpPath, safePath);
}
