import { describe, expect, it } from 'vitest';

import {
  normalizePassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from './password-policy';

// Built from explicit \u escapes rather than a literal accented character in
// the source -- a typed "e-acute" glyph is ambiguous about which encoding it
// actually is, which would silently defeat the point of this test.
const E_ACUTE_DECOMPOSED = 'é'; // "e" + combining acute accent (NFD)
const E_ACUTE_PRECOMPOSED = 'é'; // single precomposed code point (NFC)

describe('normalizePassword', () => {
  it('composes a decomposed (NFD) sequence into its NFC form', () => {
    const decomposed = `caf${E_ACUTE_DECOMPOSED}`;
    const precomposed = `caf${E_ACUTE_PRECOMPOSED}`;
    expect(decomposed).not.toBe(precomposed);
    expect(decomposed.length).toBeGreaterThan(precomposed.length);
    expect(normalizePassword(decomposed)).toBe(precomposed);
  });

  it('is a no-op for an already-composed string', () => {
    const value = `already-composed-caf${E_ACUTE_PRECOMPOSED}-passphrase`;
    expect(normalizePassword(value)).toBe(value);
  });
});

describe('passwordSchema', () => {
  it(`accepts a password of exactly the ${PASSWORD_MIN_LENGTH}-character minimum`, () => {
    const value = 'a'.repeat(PASSWORD_MIN_LENGTH);
    const result = passwordSchema.safeParse(value);
    expect(result.success).toBe(true);
  });

  it(`rejects a password one character under the ${PASSWORD_MIN_LENGTH}-character minimum`, () => {
    const value = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
    const result = passwordSchema.safeParse(value);
    expect(result.success).toBe(false);
  });

  it(`accepts a password of exactly the ${PASSWORD_MAX_LENGTH}-character maximum`, () => {
    const value = 'a'.repeat(PASSWORD_MAX_LENGTH);
    const result = passwordSchema.safeParse(value);
    expect(result.success).toBe(true);
  });

  it(`rejects a password one character over the ${PASSWORD_MAX_LENGTH}-character maximum`, () => {
    const value = 'a'.repeat(PASSWORD_MAX_LENGTH + 1);
    const result = passwordSchema.safeParse(value);
    expect(result.success).toBe(false);
  });

  it('does not impose composition rules on an all-lowercase passphrase', () => {
    const value = 'correct horse battery staple';
    expect(value.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
    const result = passwordSchema.safeParse(value);
    expect(result.success).toBe(true);
  });

  it('counts Unicode code points, not UTF-16 code units', () => {
    // 8 astral-plane emoji: 8 code points, but 16 UTF-16 code units. A
    // `.length`-based check would see 16 (>= minimum) and wrongly accept
    // it; the policy must reject it on its true 8-code-point length.
    const eightEmoji = '\u{1F600}'.repeat(8);
    expect(eightEmoji.length).toBe(16); // UTF-16 units, for contrast
    const result = passwordSchema.safeParse(eightEmoji);
    expect(result.success).toBe(false);
  });

  it('accepts a password long enough only when measured in code points', () => {
    // 15 astral-plane emoji: 15 code points (meets the minimum), 30 UTF-16
    // code units.
    const fifteenEmoji = '\u{1F600}'.repeat(PASSWORD_MIN_LENGTH);
    const result = passwordSchema.safeParse(fifteenEmoji);
    expect(result.success).toBe(true);
  });

  it('normalizes the parsed value before returning it', () => {
    const decomposed = `${E_ACUTE_DECOMPOSED}-passphrase-sixteen-chars`;
    const result = passwordSchema.safeParse(decomposed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(normalizePassword(decomposed));
      expect(result.data.startsWith(E_ACUTE_PRECOMPOSED)).toBe(true);
    }
  });
});
