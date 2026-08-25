/**
 * Content-safety checks before anything from the inbox reaches Linear.
 *
 * Deliberately simple pattern matching, not "clever" redaction: anything
 * that looks credential-shaped stops the entry for MANUAL_REVIEW instead of
 * trying to auto-redact (OZI-28 §Security).
 */

const CREDENTIAL_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{16,}\b/, // generic API-secret-key shape
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id shape
  /\bghp_[A-Za-z0-9]{20,}\b/, // GitHub token shape
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT shape
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
  /password\s*[:=]\s*\S+/i,
  /\btoken\s*[:=]\s*[A-Za-z0-9._-]{16,}/i,
];

export type SecurityScanResult = {
  safe: boolean;
  matchedPatterns: string[];
};

export function scanForCredentialShapedContent(
  text: string,
): SecurityScanResult {
  const matched: string[] = [];
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) matched.push(pattern.source);
  }
  return { safe: matched.length === 0, matchedPatterns: matched };
}

/** Fields that are free-text and therefore require a security scan before copying into Linear. */
export const FREE_TEXT_FIELDS = ['why', 'notes', 'title'] as const;
