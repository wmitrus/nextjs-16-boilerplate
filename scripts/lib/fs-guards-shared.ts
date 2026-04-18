import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
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
