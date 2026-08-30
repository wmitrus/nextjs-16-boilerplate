import { connection, NextResponse } from 'next/server';

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };

function unavailable(status: 404 | 500) {
  return NextResponse.json(
    { error: 'Unavailable' },
    { headers: noStoreHeaders, status },
  );
}

export async function GET() {
  await connection();
  if (process.env.VERCEL_ENV !== 'preview') return unavailable(404);
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return unavailable(500);
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      return unavailable(500);
    }
    return NextResponse.json(
      { databaseHost: parsed.hostname },
      { headers: noStoreHeaders },
    );
  } catch {
    return unavailable(500);
  }
}
