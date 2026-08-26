import { randomBytes } from 'node:crypto';

const CANONICAL_ID_RE = /^INBOX-(\d{8})-(\d{6})-([0-9a-f]{4})$/;

/** `INBOX-YYYYMMDD-HHMMSS-xxxx` for the given instant. */
export function formatStableId(at: Date, suffix: string): string {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  const y = at.getUTCFullYear();
  const mo = pad(at.getUTCMonth() + 1);
  const d = pad(at.getUTCDate());
  const h = pad(at.getUTCHours());
  const mi = pad(at.getUTCMinutes());
  const s = pad(at.getUTCSeconds());
  return `INBOX-${y}${mo}${d}-${h}${mi}${s}-${suffix}`;
}

export function randomSuffix(): string {
  return randomBytes(2).toString('hex');
}

/**
 * Generate a stable ID that collides with neither `existingIds` (already in
 * the file) nor `batchIds` (generated earlier in this same normalization
 * pass). Purely local uniqueness — never queries Linear to "validate"
 * suffix uniqueness (OZI-28 §Normalization semantics).
 */
export function generateUniqueStableId(
  at: Date,
  existingIds: ReadonlySet<string>,
  batchIds: ReadonlySet<string>,
  maxAttempts = 50,
  nextSuffix: () => string = randomSuffix,
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = formatStableId(at, nextSuffix());
    if (!existingIds.has(candidate) && !batchIds.has(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Could not generate a unique Inbox ID after ${maxAttempts} attempts.`,
  );
}

export function isCanonicalId(value: string): boolean {
  return CANONICAL_ID_RE.test(value);
}
