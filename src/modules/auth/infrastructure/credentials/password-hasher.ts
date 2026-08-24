/**
 * Password hashing/verification for AuthJS credentials. SEC-47.
 *
 * Argon2id is the only algorithm used to create new credential hashes
 * (signup, reset-password, bootstrap admin, E2E provisioning fixture).
 * bcrypt is kept as a **read-only compatibility path** for hashes created
 * before this change -- nothing in this repository hashes a new password
 * with bcrypt any more.
 *
 * Parameters are pinned explicitly rather than left to the library's
 * defaults, so a future `@node-rs/argon2` upgrade cannot silently change
 * this repo's cryptographic policy: Argon2id, version 19 (0x13),
 * memoryCost=19456 (19 MiB), timeCost=2, parallelism=1, outputLen=32 --
 * OWASP's current baseline recommendation.
 */
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import {
  compare as bcryptCompare,
  truncates as bcryptTruncates,
} from 'bcryptjs';

import { normalizePassword } from './password-policy';

// `@node-rs/argon2` exposes `Algorithm`/`Version` as an ambient
// `declare const enum`, which this repo's `isolatedModules` TypeScript
// setting refuses to let a consumer reference (TS2748) -- per-file
// transpilation can't safely inline a const enum defined in another
// module. The numeric values below are napi-rs's own public API (see the
// package's `index.d.ts`: `Algorithm.Argon2id = 2`, `Version.V0x13 = 1`)
// and are part of its stable ABI, not an implementation detail.
const ARGON2ID_ALGORITHM = 2;
const ARGON2_VERSION_0X13 = 1;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID_ALGORITHM,
  version: ARGON2_VERSION_0X13,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

const ARGON2_TARGET_VERSION = 19;

const ARGON2_HASH_PATTERN =
  /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$[^$]+\$([^$]+)$/;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

type HashFormat = 'argon2id' | 'bcrypt-legacy';

function detectHashFormat(storedHash: string): HashFormat | null {
  if (storedHash.startsWith('$argon2id$')) return 'argon2id';
  if (BCRYPT_HASH_PATTERN.test(storedHash)) return 'bcrypt-legacy';
  return null;
}

/** Hashes a new/changed password. Always Argon2id -- see module doc. */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(normalizePassword(password), ARGON2_OPTIONS);
}

export type PasswordRehashReason = 'legacy-bcrypt' | 'argon2-params-outdated';

export interface PasswordVerificationResult {
  valid: boolean;
  /**
   * Non-null only when `valid` is true and the caller should replace the
   * stored hash with a fresh `hashPassword(candidate)` on this same
   * request. This module never touches the database -- the caller
   * (AuthJS `authorize()`) owns persistence and must not let a rehash
   * failure fail the login it just approved.
   */
  rehash: PasswordRehashReason | null;
  /**
   * True only for a legacy bcrypt hash where the just-verified candidate
   * exceeds bcrypt's 72-UTF-8-byte input limit (`bcrypt.truncates()`).
   * `rehash` is deliberately `null` in this case -- see `verifyBcryptLegacy`
   * for why -- and callers should log this distinctly rather than treat it
   * as "nothing to do".
   */
  legacyBcryptTruncated: boolean;
}

const INVALID_RESULT: PasswordVerificationResult = {
  valid: false,
  rehash: null,
  legacyBcryptTruncated: false,
};

function argon2HashMatchesCurrentParams(storedHash: string): boolean {
  const match = ARGON2_HASH_PATTERN.exec(storedHash);
  if (!match) return false;
  const [, version, memoryCost, timeCost, parallelism, digestB64] = match;
  // The PHC header (v=/m=/t=/p=) says nothing about digest length -- two
  // hashes with an identical header can still carry different-length
  // digests (e.g. one imported from elsewhere, or minted under a since-
  // changed `outputLen`). Decode the digest segment itself rather than
  // trusting the header alone, or a future `outputLen` policy change would
  // silently leave every existing hash looking "current".
  const digestLength = Buffer.from(digestB64 ?? '', 'base64').length;
  return (
    Number(version) === ARGON2_TARGET_VERSION &&
    Number(memoryCost) === ARGON2_OPTIONS.memoryCost &&
    Number(timeCost) === ARGON2_OPTIONS.timeCost &&
    Number(parallelism) === ARGON2_OPTIONS.parallelism &&
    digestLength === ARGON2_OPTIONS.outputLen
  );
}

async function verifyArgon2(
  password: string,
  storedHash: string,
): Promise<PasswordVerificationResult> {
  const valid = await argon2Verify(storedHash, normalizePassword(password));
  if (!valid) return INVALID_RESULT;

  return {
    valid: true,
    rehash: argon2HashMatchesCurrentParams(storedHash)
      ? null
      : 'argon2-params-outdated',
    legacyBcryptTruncated: false,
  };
}

/**
 * Legacy bcrypt path. Deliberately verifies against the RAW, non-normalized
 * candidate: every bcrypt hash in this database was created before this
 * policy existed, from whatever the user originally typed. Normalizing the
 * login-time candidate now, while the stored hash was made from the
 * unnormalized original, would fail verification for any account whose
 * original password contained decomposable Unicode -- exactly the accounts
 * this repo cannot afford to silently lock out. New Argon2 credentials
 * normalize going forward (see `verifyArgon2` / `hashPassword`); this path
 * only has to keep matching what bcrypt already accepted.
 */
async function verifyBcryptLegacy(
  password: string,
  storedHash: string,
): Promise<PasswordVerificationResult> {
  const valid = await bcryptCompare(password, storedHash);
  if (!valid) return INVALID_RESULT;

  // bcrypt silently ignores anything past 72 UTF-8 bytes. If the candidate
  // that just verified is one of those, this stored hash may accept other,
  // different passwords sharing only the first 72 bytes -- rehashing *this*
  // candidate into Argon2 would, in effect, redefine the account's password
  // as that one candidate's truncated-length sibling under a stronger
  // algorithm, which looks like a fix but silently narrows what "the
  // password" means for the account. Leave it on bcrypt; a real reset
  // (which always hashes the full password) is the only safe migration
  // path for this account.
  if (bcryptTruncates(password)) {
    return { valid: true, rehash: null, legacyBcryptTruncated: true };
  }

  return { valid: true, rehash: 'legacy-bcrypt', legacyBcryptTruncated: false };
}

// A `Map` rather than a `Record` + bracket access (SEC-01): explicit
// dispatch on a two-member union is exactly the SEC-04 pattern, but
// `obj[key]()` bracket-call syntax still trips the repo's static
// object-injection guard regardless of how narrow `key`'s type is --
// `Map#get()` sidesteps that without losing the explicit dispatch.
const verifiers = new Map<
  HashFormat,
  (password: string, storedHash: string) => Promise<PasswordVerificationResult>
>([
  ['argon2id', verifyArgon2],
  ['bcrypt-legacy', verifyBcryptLegacy],
]);

/**
 * Verifies a login candidate against a stored credential hash of either
 * supported format (Argon2id or legacy bcrypt), detected from the hash's
 * own self-describing prefix. An unrecognized format fails closed -- it is
 * never guessed at or passed to a "best-effort" comparator.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<PasswordVerificationResult> {
  const format = detectHashFormat(storedHash);
  const verifier = format ? verifiers.get(format) : undefined;
  if (!verifier) {
    return INVALID_RESULT;
  }
  return verifier(password, storedHash);
}
