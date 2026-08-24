import {
  hash as argon2HashRaw,
  verify as argon2VerifySpy,
} from '@node-rs/argon2';
import {
  compare as bcryptCompareSpy,
  hashSync as bcryptHashSync,
} from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { hashPassword, verifyPassword } from './password-hasher';

// Pass-through spies, not stubs: both wrap the real implementation so every
// other test in this file still runs against real bcrypt/Argon2, while the
// "unrecognized format" test below can assert which one (if either) the
// dispatch actually reached for.
vi.mock('bcryptjs', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    compare: typeof bcryptCompareSpy;
  };
  return { ...actual, compare: vi.fn(actual.compare) };
});
vi.mock('@node-rs/argon2', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    verify: typeof argon2VerifySpy;
  };
  return { ...actual, verify: vi.fn(actual.verify) };
});

// Real bcrypt/Argon2 calls -- this is exactly the algorithm-detection and
// migration logic the module exists for, and it is cheap enough (a low
// bcrypt cost factor for the legacy fixtures, and Argon2's own default
// memory/time cost) to run for real rather than mock away the thing under
// test.
const BCRYPT_TEST_COST = 4;

describe('hashPassword / verifyPassword (Argon2id)', () => {
  it('round-trips a correct password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    const result = await verifyPassword('correct horse battery staple', stored);
    expect(result.valid).toBe(true);
    expect(result.rehash).toBeNull();
  });

  it('produces a self-describing $argon2id$ hash', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    const result = await verifyPassword('wrong horse battery staple', stored);
    expect(result.valid).toBe(false);
    expect(result.rehash).toBeNull();
  });

  it('normalizes the candidate the same way as hashing before comparing', async () => {
    // "e" + combining acute accent vs single precomposed code point.
    const decomposed = 'caf' + 'é' + '-passphrase-sixteen';
    const precomposed = 'caf' + 'é' + '-passphrase-sixteen';
    const stored = await hashPassword(decomposed);
    const result = await verifyPassword(precomposed, stored);
    expect(result.valid).toBe(true);
  });

  it('flags an Argon2 hash with outdated parameters for rehash', async () => {
    // A real hash minted under a weaker policy that has since been raised
    // (lower time cost) -- not string surgery on a current hash, which
    // would desync the header from the digest it actually encodes and
    // fail verification for the wrong reason.
    const downgraded = await argon2HashRaw('correct horse battery staple', {
      algorithm: 2, // Algorithm.Argon2id -- see password-hasher.ts for why
      version: 1, // Version.V0x13
      memoryCost: 19456,
      timeCost: 1,
      parallelism: 1,
      outputLen: 32,
    });
    expect(downgraded).toContain('$m=19456,t=1,p=1$');

    const result = await verifyPassword(
      'correct horse battery staple',
      downgraded,
    );
    expect(result.valid).toBe(true);
    expect(result.rehash).toBe('argon2-params-outdated');
  });
});

describe('verifyPassword (legacy bcrypt compatibility path)', () => {
  it('accepts a correct legacy bcrypt hash and flags it for rehash', async () => {
    const stored = bcryptHashSync(
      'correct horse battery staple',
      BCRYPT_TEST_COST,
    );
    const result = await verifyPassword('correct horse battery staple', stored);
    expect(result.valid).toBe(true);
    expect(result.rehash).toBe('legacy-bcrypt');
    expect(result.legacyBcryptTruncated).toBe(false);
  });

  it('rejects an incorrect legacy bcrypt candidate', async () => {
    const stored = bcryptHashSync(
      'correct horse battery staple',
      BCRYPT_TEST_COST,
    );
    const result = await verifyPassword('wrong horse battery staple', stored);
    expect(result.valid).toBe(false);
    expect(result.rehash).toBeNull();
  });

  it('does NOT normalize the legacy bcrypt candidate before comparing', async () => {
    // The stored hash was made from the *decomposed* form, exactly as an
    // old, pre-policy signup would have hashed whatever the browser sent.
    // A normalizing verify would compose the login-time candidate and fail
    // to match a hash created from the unnormalized original.
    const decomposed = 'caf' + 'é' + '-passphrase-sixteen';
    const stored = bcryptHashSync(decomposed, BCRYPT_TEST_COST);
    const result = await verifyPassword(decomposed, stored);
    expect(result.valid).toBe(true);
  });

  it('skips rehash for a candidate bcrypt silently truncated at 72 bytes', async () => {
    // Every byte past 72 is a distinct '9' rune -- long enough that bcrypt
    // truncation kicks in for a plain ASCII string.
    const longPassword = 'a'.repeat(80);
    const stored = bcryptHashSync(longPassword, BCRYPT_TEST_COST);
    const result = await verifyPassword(longPassword, stored);
    expect(result.valid).toBe(true);
    expect(result.legacyBcryptTruncated).toBe(true);
    expect(result.rehash).toBeNull();
  });
});

describe('verifyPassword (unrecognized hash format)', () => {
  it('returns invalid for a malformed stored hash', async () => {
    const result = await verifyPassword('anything', 'not-a-real-hash');
    expect(result.valid).toBe(false);
    expect(result.rehash).toBeNull();
    expect(result.legacyBcryptTruncated).toBe(false);
  });

  it('returns invalid for an empty stored hash', async () => {
    const result = await verifyPassword('anything', '');
    expect(result.valid).toBe(false);
  });

  it('does not invoke either verifier for an unrecognized format -- proves the dispatch fails closed rather than defaulting to a guess', async () => {
    vi.mocked(bcryptCompareSpy).mockClear();
    vi.mocked(argon2VerifySpy).mockClear();

    await verifyPassword('anything', 'not-a-real-hash');

    expect(bcryptCompareSpy).not.toHaveBeenCalled();
    expect(argon2VerifySpy).not.toHaveBeenCalled();
  });
});
