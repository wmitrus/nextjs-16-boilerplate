import type { NextRequest, NextResponse } from 'next/server';

import { logger as baseLogger } from '@/core/logger/edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';
import type { RateLimitResult } from '@/shared/lib/rate-limit/rate-limit-local';

import type { RouteContext } from './route-classification';

const logger = baseLogger.child({
  type: 'Security',
  category: 'rate-limit',
  module: 'with-rate-limit',
});
/**
 * Enforces rate limiting on API routes.
 * Ports logic from the original proxy.ts.
 */
export async function withRateLimit(
  req: NextRequest,
  res: NextResponse,
  ctx: RouteContext,
  correlationId: string,
): Promise<NextResponse | null> {
  if (!ctx.isApi || ctx.isWebhook) return null;

  const ip = await getIP(req.headers);
  const result: RateLimitResult = await checkRateLimit(ip);

  if (!result.success) {
    logger.warn(
      {
        type: 'SECURITY_AUDIT',
        category: 'rate-limit',
        ip,
        correlationId,
        path: req.nextUrl.pathname,
        limit: result.limit,
        reset: result.reset,
      },
      'Rate Limit Exceeded',
    );

    const errorResponse = createServerErrorResponse(
      'Rate limit exceeded. Please try again later.',
      429,
      'RATE_LIMITED',
    );

    errorResponse.headers.set(
      'Retry-After',
      Math.ceil((result.reset.getTime() - Date.now()) / 1000).toString(),
    );
    setRateLimitHeaders(errorResponse, result);
    return errorResponse;
  }

  // Set headers on the ongoing response
  setRateLimitHeaders(res, result);
  return null;
}

function setRateLimitHeaders(res: NextResponse, result: RateLimitResult) {
  res.headers.set('X-RateLimit-Limit', result.limit.toString());
  res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  res.headers.set('X-RateLimit-Reset', result.reset.getTime().toString());
}
