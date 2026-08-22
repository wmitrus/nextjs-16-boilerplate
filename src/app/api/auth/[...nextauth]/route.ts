import { type NextRequest, connection } from 'next/server';
import NextAuth from 'next-auth/next';

import { env } from '@/core/env';

import { getIP } from '@/shared/lib/network/get-ip';
import {
  apiRateLimit,
  checkUpstashRateLimit,
} from '@/shared/lib/rate-limit/rate-limit';
import { parseDurationToMs } from '@/shared/lib/rate-limit/rate-limit-helper';
import { localRateLimit } from '@/shared/lib/rate-limit/rate-limit-local';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';

/**
 * IP bucket for the Credentials sign-in endpoint only -- a dedicated,
 * deliberately-tighter limit than the generic `API_RATE_LIMIT_*` used
 * everywhere else (this is a login endpoint, not general API traffic). The
 * account (email) bucket lives in `authorize()` itself
 * (`src/modules/auth/infrastructure/authjs/auth.ts`), as a progressive
 * failure-counter (CAPTCHA / delay / lock) rather than a second flat
 * sliding window -- see SEC-34 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 *
 * Skipped entirely under `E2E_ENABLED`: this endpoint's fixed IP (the test
 * runner/CI host) would otherwise trip a tight per-IP window across a full
 * E2E suite run, unrelated to any real abuse.
 */
async function checkSignInIpRateLimit(ip: string): Promise<boolean> {
  if (env.E2E_ENABLED) {
    return true;
  }

  const windowMs = parseDurationToMs(env.LOGIN_RATE_LIMIT_IP_WINDOW);
  const identifier = `login-ip:${ip}`;

  if (apiRateLimit) {
    try {
      const result = await checkUpstashRateLimit(identifier);
      return result.success;
    } catch {
      // Same fail-open-to-local-fallback shape as checkRateLimit() in
      // rate-limit-helper.ts.
    }
  }

  const result = await localRateLimit(
    identifier,
    env.LOGIN_RATE_LIMIT_IP_REQUESTS,
    windowMs,
  );
  return result.success;
}

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> },
): Promise<Response> {
  await connection();

  const params = await ctx.params;
  const isCredentialsCallback =
    params.nextauth[0] === 'callback' &&
    params.nextauth[1] === 'credentials' &&
    req.method === 'POST';

  if (isCredentialsCallback) {
    const ip = await getIP(req.headers);
    const allowed = await checkSignInIpRateLimit(ip);

    if (!allowed) {
      return new Response(
        JSON.stringify({
          error:
            'Too many sign-in attempts from this network. Please try again later.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  return NextAuth(req, ctx, authOptions) as unknown as Promise<Response>;
}

export { handler as GET, handler as POST };
