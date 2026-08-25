import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  atomicWriteWithinBase,
  hashContent,
  readWithFingerprint,
} from './atomic-fs';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'atomic-fs-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('atomicWriteWithinBase', () => {
  it('writes content and leaves no stray temp files behind', () => {
    const target = path.join(dir, 'file.txt');
    atomicWriteWithinBase(target, dir, 'hello');
    expect(readFileSync(target, 'utf8')).toBe('hello');

    const entries = readdirSync(dir);
    expect(entries).toEqual(['file.txt']);
  });

  it('replaces existing content atomically (never leaves a truncated file)', () => {
    const target = path.join(dir, 'file.txt');
    atomicWriteWithinBase(target, dir, 'first');
    atomicWriteWithinBase(target, dir, 'second, longer content');
    expect(readFileSync(target, 'utf8')).toBe('second, longer content');
  });

  it('refuses to write outside the confined base directory', () => {
    const outside = path.join(tmpdir(), 'escape-attempt.txt');
    expect(() => atomicWriteWithinBase(outside, dir, 'nope')).toThrow(
      /escapes the allowed directory/,
    );
  });
});

describe('readWithFingerprint / hashContent', () => {
  it('produces a stable hash for identical content and a different one for changed content', () => {
    expect(hashContent('a')).toBe(hashContent('a'));
    expect(hashContent('a')).not.toBe(hashContent('b'));
  });

  it('reads content and a matching fingerprint', () => {
    const target = path.join(dir, 'file.txt');
    atomicWriteWithinBase(target, dir, 'content');
    const { content, hash } = readWithFingerprint(target, dir);
    expect(content).toBe('content');
    expect(hash).toBe(hashContent('content'));
  });
});
