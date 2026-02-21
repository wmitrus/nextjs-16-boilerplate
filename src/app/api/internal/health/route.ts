import { NextResponse } from 'next/server';

import { logger } from '@/core/logger/server';

/**
 * Example internal-only health check.
 * Protected by InternalApiGuard in middleware.
 */
export async function GET() {
  logger.debug(
    { path: '/api/internal/health' },
    'Internal health route entered',
  );

  const payload = {
    status: 'ok',
    scope: 'internal',
    timestamp: new Date().toISOString(),
  };

  logger.debug(
    { path: '/api/internal/health' },
    'Internal health route responding',
  );

  return NextResponse.json({
    ...payload,
  });
}
