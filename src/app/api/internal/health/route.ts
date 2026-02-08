import { NextResponse } from 'next/server';

/**
 * Example internal-only health check.
 * Protected by InternalApiGuard in middleware.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    scope: 'internal',
    timestamp: new Date().toISOString(),
  });
}
