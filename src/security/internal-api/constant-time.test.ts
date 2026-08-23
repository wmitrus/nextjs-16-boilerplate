/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { constantTimeEquals, verifyAgainstKeys } from './constant-time';

describe('constantTimeEquals', () => {
  it('accepts identical secrets', async () => {
    await expect(
      constantTimeEquals('s3cret-value', 's3cret-value'),
    ).resolves.toBe(true);
  });

  it('rejects a value differing only in the last character', async () => {
    await expect(
      constantTimeEquals('s3cret-value', 's3cret-valuf'),
    ).resolves.toBe(false);
  });

  it('rejects a value differing only in the first character', async () => {
    await expect(
      constantTimeEquals('s3cret-value', 't3cret-value'),
    ).resolves.toBe(false);
  });

  it('rejects a prefix of the real secret', async () => {
    // The shape a naive comparison is most likely to get wrong.
    await expect(constantTimeEquals('s3cret-value', 's3cret')).resolves.toBe(
      false,
    );
  });

  it('rejects a value that extends the real secret', async () => {
    await expect(
      constantTimeEquals('s3cret-value', 's3cret-value-extra'),
    ).resolves.toBe(false);
  });

  it('handles the empty string on either side', async () => {
    await expect(constantTimeEquals('', 's3cret')).resolves.toBe(false);
    await expect(constantTimeEquals('s3cret', '')).resolves.toBe(false);
    await expect(constantTimeEquals('', '')).resolves.toBe(true);
  });

  it('is not confused by non-ASCII input', async () => {
    await expect(constantTimeEquals('klucz-żółć', 'klucz-żółć')).resolves.toBe(
      true,
    );
    await expect(constantTimeEquals('klucz-żółć', 'klucz-zolc')).resolves.toBe(
      false,
    );
  });
});

describe('verifyAgainstKeys', () => {
  const current = 'current-key-aaaaaaaaaaaaaaaaaaaaaaaa';
  const previous = 'previous-key-bbbbbbbbbbbbbbbbbbbbbbb';

  it('matches the current key and reports index 0', async () => {
    await expect(
      verifyAgainstKeys(current, [current, previous]),
    ).resolves.toEqual({ matched: true, matchedIndex: 0 });
  });

  it('matches the previous key and reports which one matched', async () => {
    // The index is what lets the guard warn that a rotation is unfinished.
    await expect(
      verifyAgainstKeys(previous, [current, previous]),
    ).resolves.toEqual({ matched: true, matchedIndex: 1 });
  });

  it('rejects a key that is neither', async () => {
    await expect(
      verifyAgainstKeys('something-else', [current, previous]),
    ).resolves.toEqual({ matched: false, matchedIndex: -1 });
  });

  it('rejects everything when no keys are configured', async () => {
    // An unconfigured deployment must accept nothing -- including the empty
    // string a missing header collapses to.
    await expect(verifyAgainstKeys('', [])).resolves.toEqual({
      matched: false,
      matchedIndex: -1,
    });
    await expect(verifyAgainstKeys(current, [])).resolves.toEqual({
      matched: false,
      matchedIndex: -1,
    });
  });

  it('compares every candidate even after the first one matches', async () => {
    // Returning early on the current key would make "matched current" and
    // "matched previous" distinguishable by timing, which during a rotation
    // tells an attacker which half of the window they are in.
    //
    // Counted rather than timed: a clock-based assertion on two SHA-256
    // digests would be pure flake. If the loop ever gains an early exit, the
    // second key stops being read and this drops to 1.
    const raw = [current, previous];
    let elementReads = 0;
    const counted = new Proxy(raw, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) elementReads += 1;
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = await verifyAgainstKeys(current, counted);

    expect(result).toEqual({ matched: true, matchedIndex: 0 });
    expect(elementReads).toBe(raw.length);
  });
});
