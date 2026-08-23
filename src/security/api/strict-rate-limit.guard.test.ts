/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();

/**
 * SEC-42 static guard.
 *
 * Strict mode is a rule about which helper a pre-auth endpoint calls, and a
 * rule of that shape decays silently: swapping `checkStrictRateLimit` back to
 * `checkRateLimit` leaves every other test green while the control quietly
 * becomes per-instance again. So the list is asserted here.
 *
 * Deliberately an explicit list rather than a walk of `src/app/api/auth/**`.
 * Not every route under that prefix is a security-critical entry point --
 * `active-org` switches an already-authenticated session's org, for instance
 * -- and a walk would either flag those or need an exclusion list that is
 * just this list inverted. Naming the endpoints keeps the reason for each one
 * next to it, and adding a new pre-auth endpoint should be a deliberate edit
 * here.
 */
const STRICT_ENDPOINTS: Array<{ file: string; why: string }> = [
  {
    file: 'src/app/api/auth/[...nextauth]/route.ts',
    why: 'credentials sign-in: the per-IP bucket in front of bcrypt',
  },
  {
    file: 'src/app/api/auth/signup/route.ts',
    why: 'creates rows, sends mail, runs bcrypt, consumes invitation tokens',
  },
  {
    file: 'src/app/api/auth/forgot-password/route.ts',
    why: 'issues reset tokens and mail to any address supplied',
  },
  {
    file: 'src/app/api/auth/reset-password/route.ts',
    why: 'redeems a reset token, then runs bcrypt -- a guessing oracle',
  },
  {
    file: 'src/app/api/auth/resend-verification/route.ts',
    why: 'issues verification mail to any address supplied',
  },
  {
    file: 'src/app/api/auth/invite/route.ts',
    why: 'invitation abuse: spends the org sending reputation, keyed on the actor',
  },
  {
    file: 'src/app/api/auth/waitlist/route.ts',
    why: 'unauthenticated write path open to the public internet',
  },
];

function read(file: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return readFileSync(join(REPO_ROOT, file), 'utf8');
}

function toRepoPath(file: string): string {
  return relative(REPO_ROOT, join(REPO_ROOT, file)).split(sep).join('/');
}

describe('SEC-42: security-critical endpoints use strict rate limiting', () => {
  it.each(STRICT_ENDPOINTS.map((e) => [toRepoPath(e.file), e] as const))(
    '%s calls checkStrictRateLimit',
    (repoPath, entry) => {
      const source = read(entry.file);

      expect(
        source.includes('checkStrictRateLimit'),
        `${repoPath} must rate-limit through \`checkStrictRateLimit\` -- ${entry.why}. ` +
          `Plain \`checkRateLimit\` falls back to a process-local counter when ` +
          `Upstash is unreachable, which on serverless grants the whole ` +
          `allowance once per instance an attacker can reach. See SEC-42.`,
      ).toBe(true);
    },
  );

  it.each(STRICT_ENDPOINTS.map((e) => [toRepoPath(e.file), e] as const))(
    '%s does not also call the non-strict helper',
    (repoPath, entry) => {
      const source = read(entry.file);
      // `checkStrictRateLimit` contains the substring `RateLimit` but not
      // `checkRateLimit(`, so this only matches a genuine direct call.
      expect(
        source.includes('checkRateLimit('),
        `${repoPath} still calls \`checkRateLimit(\` directly. A strict endpoint ` +
          `with a second, non-strict check has the weaker of the two. See SEC-42.`,
      ).toBe(false);
    },
  );

  it('lists every endpoint that imports the strict helper', () => {
    // Catches the reverse drift: a new endpoint adopts strict mode but is
    // never added here, so nothing would notice if it later regressed.
    const listed = new Set(STRICT_ENDPOINTS.map((e) => e.file));
    const importers = [
      'src/app/api/auth/[...nextauth]/route.ts',
      'src/app/api/auth/signup/route.ts',
      'src/app/api/auth/forgot-password/route.ts',
      'src/app/api/auth/reset-password/route.ts',
      'src/app/api/auth/resend-verification/route.ts',
      'src/app/api/auth/invite/route.ts',
      'src/app/api/auth/waitlist/route.ts',
    ].filter((f) => read(f).includes('checkStrictRateLimit'));

    for (const f of importers) {
      expect(
        listed.has(f),
        `${f} uses strict mode but is not in the list`,
      ).toBe(true);
    }
    expect(importers).toHaveLength(STRICT_ENDPOINTS.length);
  });
});
