import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  readFileSync,
} from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function assertPathWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): string {
  const normalizedBase = path.resolve(baseDir);
  const normalizedPath = path.resolve(filePath);
  const expectedPrefix = normalizedBase.endsWith(path.sep)
    ? normalizedBase
    : normalizedBase + path.sep;

  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(expectedPrefix)
  ) {
    throw new Error(
      `Security: ${label} escapes the allowed directory.\n` +
        `  Allowed base : ${normalizedBase}\n` +
        `  Resolved path: ${normalizedPath}\n`,
    );
  }

  return normalizedPath;
}

export function pathExistsWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): boolean {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return existsSync(safePath);
}

export function ensureDirectorySyncWithinBase(
  dirPath: string,
  baseDir: string,
  label = 'path',
): string {
  const safePath = assertPathWithinBase(dirPath, baseDir, label);
  mkdirSync(safePath, { recursive: true });
  return safePath;
}

export async function ensureDirectoryWithinBase(
  dirPath: string,
  baseDir: string,
  label = 'path',
): Promise<string> {
  const safePath = assertPathWithinBase(dirPath, baseDir, label);
  await mkdir(safePath, { recursive: true });
  return safePath;
}

export function readTextFileWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): string {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return readFileSync(safePath, 'utf8');
}

export function writeTextFileSyncWithinBase(
  filePath: string,
  baseDir: string,
  content: string,
  label = 'path',
): string {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  writeFileSync(safePath, content, 'utf8');
  return safePath;
}

export async function writeTextFileWithinBase(
  filePath: string,
  baseDir: string,
  content: string,
  label = 'path',
): Promise<string> {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  await writeFile(safePath, content, 'utf8');
  return safePath;
}

export function statPathWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): ReturnType<typeof statSync> {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return statSync(safePath);
}

export async function statWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): Promise<Stats> {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return stat(safePath);
}

export async function readDirentsWithinBase(
  dirPath: string,
  baseDir: string,
  label = 'path',
): Promise<Dirent[]> {
  const safePath = assertPathWithinBase(dirPath, baseDir, label);
  return readdir(safePath, { withFileTypes: true });
}

export function createReadStreamWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): ReturnType<typeof createReadStream> {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return createReadStream(safePath);
}

export function unlinkSyncWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): void {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  unlinkSync(safePath);
}

/** For sinks that need the raw fd (e.g. an exclusive `O_CREAT|O_EXCL` create-lock). */
export function openSyncWithinBase(
  filePath: string,
  baseDir: string,
  flags: Parameters<typeof openSync>[1],
  label = 'path',
): number {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return openSync(safePath, flags);
}

/** `fsync` a directory so a newly created / removed entry in it is durable. */
function fsyncDir(dirPath: string): void {
  const dirFd = openSync(dirPath, 'r');
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

/**
 * Publish `fromPath` (a fully written + `fsync`'d temp sibling) to `toPath`
 * with a GENUINE no-clobber guarantee, both endpoints confined to `baseDir`.
 *
 * Uses `link(2)`, not `rename(2)`: the kernel refuses the link with `EEXIST`
 * if `toPath` already exists — there is no check-then-act window a concurrent
 * writer could slip through (POSIX `rename` silently overwrites). Sequence:
 * atomically `link` the temp inode to the final name (EEXIST => fail closed,
 * never overwrite) -> `fsync` the directory (final entry durable) -> unlink the
 * temp name -> `fsync` the directory again (temp removal durable). The final
 * path therefore only ever names a complete file, and only ever appears once.
 */
export function publishFileAtomicallyWithinBase(
  fromPath: string,
  toPath: string,
  baseDir: string,
  label = 'path',
): void {
  const safeFrom = assertPathWithinBase(fromPath, baseDir, `${label} (from)`);
  const safeTo = assertPathWithinBase(toPath, baseDir, `${label} (to)`);
  try {
    linkSync(safeFrom, safeTo);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Refusing to overwrite an existing file on publish: ${safeTo}`,
      );
    }
    throw error;
  }
  const dir = path.dirname(safeTo);
  fsyncDir(dir);
  unlinkSync(safeFrom);
  fsyncDir(dir);
}

/**
 * Write the whole of `buf` to `fd`, looping over short writes. Throws if a
 * `writeSync` makes no forward progress (a 0-byte return) rather than spinning
 * forever.
 */
function writeAllOrThrow(fd: number, buf: Buffer, label: string): void {
  let off = 0;
  while (off < buf.length) {
    const n = writeSync(fd, buf, off, buf.length - off);
    if (n <= 0) {
      throw new Error(
        `${label}: write made no forward progress (${off}/${buf.length} bytes) — refusing a partial durable record.`,
      );
    }
    off += n;
  }
}

/**
 * Write `content` in full to a NEW confined file, `fsync` the file, then
 * `fsync` its containing directory so the new directory entry is durable.
 * Fails closed if the path already exists or a write stalls.
 */
export function writeNewFileDurablyWithinBase(
  filePath: string,
  baseDir: string,
  content: string,
  label = 'path',
): void {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  const fd = openSync(safePath, 'wx');
  try {
    writeAllOrThrow(fd, Buffer.from(content, 'utf8'), label);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  fsyncDir(path.dirname(safePath));
}

/**
 * Exclusive-create a NEW confined write-ahead-log file and `fsync` its
 * containing directory so the new directory entry itself is durable before the
 * first record is written. Returns the raw fd for {@link appendRecordDurably}.
 * Fails closed (`wx`) if the path already exists.
 */
export function openNewWalFileWithinBase(
  filePath: string,
  baseDir: string,
  label = 'path',
): number {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  const fd = openSync(safePath, 'wx');
  fsyncDir(path.dirname(safePath));
  return fd;
}

/**
 * Append one already-formatted record to an open fd, writing the ENTIRE record
 * (looping over short writes, throwing if a write stalls so a partial record is
 * never silently accepted), then `fsync` it — used for the write-ahead
 * decisions stream (an `intent` line must be on storage before the DB
 * mutation).
 */
export function appendRecordDurably(fd: number, text: string): void {
  writeAllOrThrow(fd, Buffer.from(text, 'utf8'), 'appendRecordDurably');
  fsyncSync(fd);
}
