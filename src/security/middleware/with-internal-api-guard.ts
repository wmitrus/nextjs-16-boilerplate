import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { env } from '@/core/env';
import { logger as baseLogger } from '@/core/logger/edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';

import type { RouteContext } from './route-classification';

const logger = baseLogger.child({
  type: 'Security',
  category: 'internal-api-guard',
  module: 'with-internal-api-guard',
});

/**
 * Protects internal-only API routes.
 */
export function withInternalApiGuard(
  req: NextRequest,
  res: NextResponse,
  ctx: RouteContext,
): NextResponse | null {
  if (!ctx.isInternalApi) return null;

  const internalKey = req.headers.get('x-internal-key');

  if (!env.INTERNAL_API_KEY || internalKey !== env.INTERNAL_API_KEY) {
    logger.error(
      {
        path: req.nextUrl.pathname,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      },
      'Unauthorized Internal API Access Attempt',
    );
    return createServerErrorResponse(
      'Forbidden: Internal Access Only',
      403,
      'FORBIDDEN',
    );
  }

  return null;
}
