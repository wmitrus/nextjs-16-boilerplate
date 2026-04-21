import { randomBytes } from 'node:crypto';

/**
 * Generates a cryptographically secure invitation token.
 *
 * 32 random bytes → 64-character hex string.
 * Token is stored directly in the DB and sent in the invitation URL.
 * The unique DB constraint prevents replay; the token space (2^256) prevents brute-force.
 *
 * Default expiry: 72 hours.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

export const DEFAULT_INVITATION_EXPIRY_HOURS = 72;

export function buildInvitationExpiry(
  hours = DEFAULT_INVITATION_EXPIRY_HOURS,
): Date {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hours);
  return expiry;
}
