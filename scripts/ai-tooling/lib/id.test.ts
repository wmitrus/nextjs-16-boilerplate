import { describe, expect, it } from 'vitest';

import { formatStableId, generateUniqueStableId, isCanonicalId } from './id';

const AT = new Date('2026-08-25T14:35:01.000Z');

describe('formatStableId', () => {
  it('formats INBOX-YYYYMMDD-HHMMSS-suffix in UTC', () => {
    expect(formatStableId(AT, 'a1b2')).toBe('INBOX-20260825-143501-a1b2');
  });
});

describe('isCanonicalId', () => {
  it('accepts a well-formed id and rejects others', () => {
    expect(isCanonicalId('INBOX-20260825-143501-a1b2')).toBe(true);
    expect(isCanonicalId('NEW')).toBe(false);
    expect(isCanonicalId('INBOX-2026-14-a1b2')).toBe(false);
  });
});

describe('generateUniqueStableId — collision handling', () => {
  it('retries with a new suffix when the first candidate collides with an existing id', () => {
    const colliding = formatStableId(AT, 'aaaa');
    const existing = new Set([colliding]);
    const suffixes = ['aaaa', 'bbbb'];
    let i = 0;
    const nextSuffix = () => suffixes[i++];

    const result = generateUniqueStableId(
      AT,
      existing,
      new Set(),
      10,
      nextSuffix,
    );
    expect(result).toBe(formatStableId(AT, 'bbbb'));
  });

  it('retries against ids generated earlier in the same batch', () => {
    const suffixes = ['cccc', 'cccc', 'dddd'];
    let i = 0;
    const nextSuffix = () => suffixes[i++];
    const batch = new Set([formatStableId(AT, 'cccc')]);

    const result = generateUniqueStableId(AT, new Set(), batch, 10, nextSuffix);
    expect(result).toBe(formatStableId(AT, 'dddd'));
  });

  it('throws after exhausting maxAttempts', () => {
    const nextSuffix = () => 'aaaa';
    const existing = new Set([formatStableId(AT, 'aaaa')]);
    expect(() =>
      generateUniqueStableId(AT, existing, new Set(), 3, nextSuffix),
    ).toThrow(/Could not generate a unique Inbox ID/);
  });
});
