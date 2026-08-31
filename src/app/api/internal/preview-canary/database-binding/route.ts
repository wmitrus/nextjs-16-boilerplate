import { connection, NextResponse } from 'next/server';

import { env } from '@/core/env';

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };

function clerkKeysTest(): boolean {
  return (
    env.CLERK_SECRET_KEY?.startsWith('sk_test_') === true &&
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') === true
  );
}

function unavailable(status: 404 | 500) {
  return NextResponse.json(
    { error: 'Unavailable' },
    { headers: noStoreHeaders, status },
  );
}

export async function GET() {
  await connection();
  if (env.VERCEL_ENV !== 'preview') return unavailable(404);
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return unavailable(500);
  try {
    const parsed = new URL(databaseUrl);
    if (
      (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
      parsed.hostname.length === 0
    ) {
      return unavailable(500);
    }
    return NextResponse.json(
      {
        authProvider: env.AUTH_PROVIDER,
        clerkKeysTest: env.AUTH_PROVIDER === 'clerk' ? clerkKeysTest() : null,
        databaseHost: parsed.hostname,
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return unavailable(500);
  }
}
