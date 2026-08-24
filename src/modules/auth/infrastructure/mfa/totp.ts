import { generateSecret, generateURI, verify } from 'otplib';

import { env } from '@/core/env';

/**
 * TOTP policy for application-owned factors (SEC-48).
 *
 * `otplib` v13's functional API is used deliberately -- no global mutable
 * configuration singleton -- and **every** security-relevant parameter is
 * pinned here rather than left to the library's defaults. Same reasoning as
 * SEC-47's Argon2 parameters: a dependency upgrade that changes its own
 * defaults must never silently change this repository's policy.
 *
 * The library stays behind this module. Nothing outside
 * `src/modules/auth/infrastructure/mfa/` imports `otplib`, and the
 * provider-neutral `MfaService` contract never mentions time steps at all.
 */
const TOTP_POLICY = {
  /**
   * SHA-1, not SHA-256. Not a strength choice: RFC 6238's own default, and
   * the only algorithm every mainstream authenticator app reliably imports
   * from a QR code. The security of TOTP here rests on the seed's secrecy
   * and the 30-second window, not on the HMAC hash.
   */
  algorithm: 'sha1',
  digits: 6,
  /** Seconds per time step (RFC 6238 `X`). */
  period: 30,
  /** 160 bits, the size RFC 4226 §4 requires as a minimum for the shared key. */
  secretBytes: 20,
  /**
   * Acceptance window, in **seconds**, symmetric: exactly one time step in
   * each direction, which is RFC 6238 §5.2's recommended allowance for clock
   * drift. Widening this multiplies the number of codes valid at any instant.
   */
  epochToleranceSeconds: 30,
} as const;

/** A submitted code, once normalized: exactly six digits. */
const TOTP_CODE_PATTERN = /^\d{6}$/;

export type TotpVerification =
  | { readonly valid: true; readonly timeStep: number }
  | { readonly valid: false };

export function generateTotpSecret(): string {
  return generateSecret({ length: TOTP_POLICY.secretBytes });
}

/**
 * Issuer shown in the authenticator app. Derived from the app URL rather
 * than introduced as another environment variable -- one fewer thing to get
 * wrong per environment, and it keeps Preview and Production visually
 * distinct in the user's authenticator list.
 */
function resolveIssuer(): string {
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return 'app';

  try {
    return new URL(appUrl).hostname;
  } catch {
    return 'app';
  }
}

export function buildTotpEnrollmentUri(
  secret: string,
  accountLabel: string,
): string {
  return generateURI({
    strategy: 'totp',
    issuer: resolveIssuer(),
    label: accountLabel,
    secret,
    algorithm: TOTP_POLICY.algorithm,
    digits: TOTP_POLICY.digits,
    period: TOTP_POLICY.period,
  });
}

/**
 * Strips the spacing authenticator apps display (`123 456`) before matching.
 * Anything that is not then exactly six digits is rejected without touching
 * the crypto path at all.
 */
export function normalizeTotpCode(raw: string): string | undefined {
  const compact = raw.replace(/[\s-]/g, '');
  return TOTP_CODE_PATTERN.test(compact) ? compact : undefined;
}

export interface VerifyTotpInput {
  readonly secret: string;
  readonly code: string;
}

/**
 * Verifies a code and reports which RFC 6238 time step it belonged to.
 *
 * Replay is deliberately **not** enforced here, even though otplib offers an
 * `afterTimeStep` option: the caller owns the replay marker, has to
 * distinguish a replayed code from a wrong one for the audit trail, and
 * resolves the concurrent case in the same statement that stores the marker
 * (see `DrizzleAuthJsMfaService.verifyTotp`). This function answers only
 * "is this code cryptographically valid right now, and when".
 */
export async function verifyTotpCode(
  input: VerifyTotpInput,
): Promise<TotpVerification> {
  const code = normalizeTotpCode(input.code);
  if (!code) return { valid: false };

  const result = await verify({
    strategy: 'totp',
    secret: input.secret,
    token: code,
    algorithm: TOTP_POLICY.algorithm,
    digits: TOTP_POLICY.digits,
    period: TOTP_POLICY.period,
    epochTolerance: TOTP_POLICY.epochToleranceSeconds,
  });

  if (!result.valid) return { valid: false };

  // `timeStep` is only present on the TOTP branch of the result union; HOTP
  // cannot reach here because the strategy is pinned above.
  const timeStep = 'timeStep' in result ? result.timeStep : undefined;
  if (typeof timeStep !== 'number') return { valid: false };

  return { valid: true, timeStep };
}

export { TOTP_POLICY };
