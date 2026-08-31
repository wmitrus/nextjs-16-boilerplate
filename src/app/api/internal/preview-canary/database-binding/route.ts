import { connection, NextResponse } from 'next/server';

import { env } from '@/core/env';
import { resolveEffectiveDbRuntime } from '@/core/runtime/db-runtime';

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };
// PostgreSQL's identifier limit (NAMEDATALEN - 1) is a *byte* limit, not a
// JS-character count -- mirrors isValidDatabaseName in scripts/neon/cli.ts
// so this route never hands the canary evidence bounded differently than
// the Neon-authoritative name it will later be compared against.
const MAX_DATABASE_NAME_BYTES = 63;

function isValidDatabaseName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !/[\s\u0000-\u001f\u007f]/.test(value) &&
    new TextEncoder().encode(value).byteLength <= MAX_DATABASE_NAME_BYTES
  );
}

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
    // Resolved via the same authoritative resolver bootstrap uses to build
    // the actual DB client -- a raw DB_PROVIDER/DB_DRIVER env read would not
    // reflect defaulting (e.g. DB_DRIVER unset -> pglite outside
    // production), and this route must attest to what the application
    // effectively runs, not merely what was explicitly configured. A
    // resolution failure (invalid provider/driver combination) fails closed
    // exactly like a malformed DATABASE_URL below.
    const { driver: dbDriver, provider: dbProvider } =
      resolveEffectiveDbRuntime({
        databaseUrl: env.DATABASE_URL,
        dbDriver: env.DB_DRIVER,
        dbProvider: env.DB_PROVIDER,
        nodeEnv: env.NODE_ENV,
      });
    const parsed = new URL(databaseUrl);
    if (
      (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
      parsed.hostname.length === 0
    ) {
      return unavailable(500);
    }
    // A correct endpoint host is not proof of the correct database: one
    // Neon branch/endpoint can serve more than one database. Decode and
    // validate a bounded database name from the URL path here; host-only,
    // malformed, or missing-database configuration fails closed at this
    // boundary. Exact database identity is independently verified downstream
    // against the expected Neon Preview branch -- but only after the caller
    // has separately confirmed dbProvider/dbDriver actually resolve to
    // drizzle/postgres: a correct-looking Neon URL proves nothing when the
    // runtime is actually using PGlite (or an unsupported Prisma provider).
    let databaseName: string;
    try {
      databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    } catch {
      return unavailable(500);
    }
    if (!isValidDatabaseName(databaseName)) {
      return unavailable(500);
    }
    return NextResponse.json(
      {
        authProvider: env.AUTH_PROVIDER,
        clerkKeysTest: env.AUTH_PROVIDER === 'clerk' ? clerkKeysTest() : null,
        databaseHost: parsed.hostname,
        databaseName,
        dbDriver,
        dbProvider,
      },
      { headers: noStoreHeaders },
    );
  } catch {
    return unavailable(500);
  }
}
