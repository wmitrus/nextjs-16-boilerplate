/**
 * Password length/shape policy for AuthJS credentials (signup, reset,
 * bootstrap admin, E2E provisioning fixture). SEC-47.
 *
 * Follows NIST SP 800-63B-4 for a password used as a single authentication
 * factor (this repo's Credentials provider has no second factor):
 *
 * - minimum 15 Unicode code points (NIST's single-factor floor; 8 is only
 *   acceptable when the password is one of at least two factors)
 * - no composition rules ("1 uppercase + 1 digit + 1 symbol") -- NIST
 *   explicitly tells verifiers not to impose them, and they push users
 *   toward predictable substitutions instead of length/entropy
 * - the full password is significant: no silent truncation
 * - Unicode is allowed, including spaces, and NFC-normalized before it is
 *   ever hashed or compared, so a passphrase typed on two keyboards/IMEs
 *   that produce different combining-character sequences for the same
 *   visible text still verifies
 *
 * Length is counted in Unicode code points (`Array.from`), not
 * `string.length` (UTF-16 code units) or UTF-8 bytes -- a `string.length`
 * or byte-based check would reject or admit passwords at the wrong visible
 * length for anything outside the BMP (many emoji, some scripts).
 *
 * This module is Argon2/bcrypt-agnostic on purpose: it governs what a
 * caller is allowed to submit as a new password, not how it gets hashed.
 * See `password-hasher.ts` for hashing/verification.
 */
import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * NFC-normalizes a password before it is hashed or compared. Must be
 * applied identically at every site that creates or checks an Argon2
 * credential -- hashing a non-normalized form and later comparing against
 * a normalized candidate (or vice versa) fails verification for any
 * password containing decomposable Unicode.
 *
 * Deliberately NOT applied to legacy bcrypt verification -- see
 * `password-hasher.ts` for why.
 */
export function normalizePassword(raw: string): string {
  return raw.normalize('NFC');
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

export const passwordSchema = z
  .string()
  .transform((raw) => normalizePassword(raw))
  .superRefine((value, ctx) => {
    const length = codePointLength(value);

    if (length < PASSWORD_MIN_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      });
    }

    if (length > PASSWORD_MAX_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
      });
    }
  });
