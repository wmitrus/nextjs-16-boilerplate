import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

export function assertPathWithinBase(filePath, baseDir, label = 'path') {
  const normalizedBase = resolve(baseDir);
  const normalizedPath = resolve(filePath);

  if (
    normalizedPath !== normalizedBase &&
    !normalizedPath.startsWith(`${normalizedBase}/`)
  ) {
    throw new Error(`${label} must resolve inside ${normalizedBase}.`);
  }

  return normalizedPath;
}

export function pathExistsWithinBase(filePath, baseDir, label = 'path') {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return existsSync(safePath);
}

export function ensureDirectoryWithinBase(dirPath, baseDir, label = 'path') {
  const safePath = assertPathWithinBase(dirPath, baseDir, label);
  mkdirSync(safePath, { recursive: true });
  return safePath;
}

export function readTextFileWithinBase(filePath, baseDir, label = 'path') {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  return readFileSync(safePath, 'utf8');
}

export function writeTextFileWithinBase(
  filePath,
  baseDir,
  content,
  label = 'path',
) {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  writeFileSync(safePath, content, 'utf8');
  return safePath;
}

export function removeFileWithinBase(filePath, baseDir, label = 'path') {
  const safePath = assertPathWithinBase(filePath, baseDir, label);
  if (existsSync(safePath)) {
    unlinkSync(safePath);
  }
}
