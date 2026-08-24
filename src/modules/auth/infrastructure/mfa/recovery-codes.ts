/**
 * Single-use MFA recovery codes (SEC-48).
 *
 * Format: `XXXXXX-YYYYYYYYYYYYYYYY`
 *
 * The left half is a **public** code id, the right half is the credential.
 * That split is the whole design: the id selects exactly one row, so
 * verification costs exactly one Argon2id call. Storing ten opaque hashes and
 * trying each of them would cost ten -- roughly a second of CPU per attempt
 * on an unauthenticated-ish endpoint, which is a denial-of-service knob
 * handed to the attacker.
 *
 * Hashing is Argon2id (SEC-47's `hashPassword`), not a fast hash: NIST
 * SP 800-63B requires look-up secrets with less than 112 bits of entropy to
 * be stored under a password hashing scheme, and these are deliberately short
 * enough for a human to transcribe (~80 bits).
 *
 * Neither the generated code nor a submitted one is ever logged.
 */

import {
  hashPassword,
  verifyPassword,
} from '@/modules/auth/infrastructure/credentials/password-hasher';

/**
 * Crockford-style alphabet: no `I`, `L`, `O`, `U`, `0` or `1`, so a code read
 * off a screen and typed on a phone does not fail on an ambiguous glyph.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_ID_LENGTH = 6;
const SECRET_LENGTH = 16;

export const RECOVERY_CODE_COUNT = 10;

/** `XXXXXX-YYYYYYYYYYYYYYYY`, uppercase, exactly one separator. */
const RECOVERY_CODE_PATTERN = new RegExp(
  `^([${ALPHABET}]{${CODE_ID_LENGTH}})-([${ALPHABET}]{${SECRET_LENGTH}})$`,
);

export interface RecoveryCodeRecord {
  readonly codeId: string;
  readonly secretHash: string;
}

export interface GeneratedRecoveryCodes {
  /** Shown to the user exactly once, at enrollment or regeneration. */
  readonly display: readonly string[];
  /** What is persisted. Contains no recoverable secret. */
  readonly records: readonly RecoveryCodeRecord[];
}

export interface ParsedRecoveryCode {
  readonly codeId: string;
  readonly secret: string;
}

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // Rejection-free modulo bias is irrelevant at this scale relative to the
  // alphabet size, but the alphabet is deliberately 30 characters -- close
  // enough to a power of two that the bias is far below any practical
  // guessing advantage, and each code still carries ~78 bits.
  return Array.from(
    bytes,
    (byte) => ALPHABET[byte % ALPHABET.length] as string,
  ).join('');
}

export async function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT,
): Promise<GeneratedRecoveryCodes> {
  const display: string[] = [];
  const records: RecoveryCodeRecord[] = [];
  const usedIds = new Set<string>();

  while (display.length < count) {
    const codeId = randomString(CODE_ID_LENGTH);
    // A duplicate id within one set would make the primary key collide and
    // silently drop a code.
    if (usedIds.has(codeId)) continue;
    usedIds.add(codeId);

    const secret = randomString(SECRET_LENGTH);
    display.push(`${codeId}-${secret}`);
    records.push({ codeId, secretHash: await hashPassword(secret) });
  }

  return { display, records };
}

/**
 * Splits a submitted code. Accepts the code with or without its separator and
 * in any case, because that is how it will be re-typed; anything else is
 * rejected here rather than reaching the database.
 */
export function parseRecoveryCode(raw: string): ParsedRecoveryCode | undefined {
  const compact = raw.trim().toUpperCase().replace(/\s+/g, '');
  const withSeparator =
    compact.includes('-') || compact.length !== CODE_ID_LENGTH + SECRET_LENGTH
      ? compact
      : `${compact.slice(0, CODE_ID_LENGTH)}-${compact.slice(CODE_ID_LENGTH)}`;

  const match = RECOVERY_CODE_PATTERN.exec(withSeparator);
  if (!match) return undefined;

  return { codeId: match[1] as string, secret: match[2] as string };
}

export async function verifyRecoveryCodeSecret(
  secret: string,
  storedHash: string,
): Promise<boolean> {
  const result = await verifyPassword(secret, storedHash);
  return result.valid;
}
