import { env } from '@/core/env';

import { STEP_UP_TTL_SECONDS } from './policy';

/**
 * Transport for the step-up proof (SEC-48).
 *
 * One stable cookie name, not a `__Host-`-prefixed variant in production and
 * an unprefixed one in development. The prefix exists to stop a sibling
 * subdomain from *planting* a cookie the app would then trust -- and this
 * cookie is not trusted on possession: it carries an HMAC the application
 * itself signed, bound to the caller's internal user id and logical session.
 * A planted value fails the signature check like any other forgery, so the
 * prefix would buy a second cookie name and no additional protection.
 *
 * `sameSite: 'strict'` matters more here: a step-up proof must never ride
 * along on a cross-site request, which is exactly the CSRF shape this
 * mechanism is supposed to make expensive.
 */
export const STEP_UP_COOKIE_NAME = 'step_up_proof';

export interface StepUpCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: 'strict';
  readonly path: '/';
  readonly secure: boolean;
  readonly maxAge: number;
}

export function buildStepUpCookieOptions(): StepUpCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    // Mirrors the repository's existing cookie convention (see
    // `/api/auth/active-org`): local development and the Playwright origin
    // are plain http, and a `Secure` cookie there would simply be dropped.
    secure: env.NODE_ENV === 'production',
    maxAge: STEP_UP_TTL_SECONDS,
  };
}

/** Options that expire the cookie immediately. */
export function buildStepUpCookieClearOptions(): StepUpCookieOptions {
  return { ...buildStepUpCookieOptions(), maxAge: 0 };
}
