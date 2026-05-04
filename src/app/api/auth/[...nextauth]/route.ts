import { createHash } from 'node:crypto';

import { type NextRequest, connection } from 'next/server';
import NextAuth from 'next-auth/next';

import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

import { authOptions } from '@/modules/auth/infrastructure/authjs/auth';

const SIGN_IN_PATH = '/api/auth/callback/credentials';

function normalizeIdentifierHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
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

    let identifierHash: string | null = null;
    try {
      const cloned = req.clone();
      const body = await cloned.text();
      const parsed = new URLSearchParams(body);
      const email = parsed.get('email');
      if (email) {
        identifierHash = normalizeIdentifierHash(email);
      }
    } catch {}

    const [ipLimit, identifierLimit] = await Promise.all([
      checkRateLimit(`signin:ip:${ip}`, { path: SIGN_IN_PATH }),
      identifierHash
        ? checkRateLimit(`signin:identifier:${identifierHash}`, {
            path: SIGN_IN_PATH,
          })
        : Promise.resolve({ success: true }),
    ]);

    if (!ipLimit.success || !identifierLimit.success) {
      return new Response(
        JSON.stringify({
          error: 'Too many sign-in attempts. Please try again later.',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  return NextAuth(req, ctx, authOptions) as unknown as Promise<Response>;
}

export { handler as GET, handler as POST };
