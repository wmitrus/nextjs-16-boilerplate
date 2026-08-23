import { type NextRequest, connection } from 'next/server';
import NextAuth from 'next-auth/next';

import { env } from '@/core/env';

import { getIP } from '@/shared/lib/network/get-ip';
import { parseDurationToMs } from '@/shared/lib/rate-limit/rate-limit-helper';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';
import { checkStrictRateLimit } from '@/security/api/strict-rate-limit';

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

  // SEC-42. This used to fall back to `localRateLimit` on any Upstash
  // failure, which on serverless means one allowance per instance -- an
  // attacker spread across instances got the limit several times over. Strict
  // mode reaches for the durable secondary first and refuses if neither store
  // answers.
  const result = await checkStrictRateLimit(`login-ip:${ip}`, {
    path: '/api/auth/callback/credentials',
    limit: env.LOGIN_RATE_LIMIT_IP_REQUESTS,
    windowMs,
  });
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
