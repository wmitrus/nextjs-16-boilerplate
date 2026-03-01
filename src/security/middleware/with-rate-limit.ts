import type { NextRequest, NextResponse } from 'next/server';

import { resolveEdgeLogger } from '@/core/logger/di';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';
import type { RateLimitResult } from '@/shared/lib/rate-limit/rate-limit-local';

import type { RouteContext } from './route-classification';

let _logger:
  | ReturnType<ReturnType<typeof resolveEdgeLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger().child({
    type: 'Security',
    category: 'rate-limit',
    module: 'with-rate-limit',
  });
  return _logger;
}
/**
 * Enforces rate limiting on API routes.
 */
export function withRateLimit(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    if (!ctx.isApi || ctx.isWebhook) {
      return handler(req, ctx);
    }

    const ip = await getIP(req.headers);
    const result: RateLimitResult = await checkRateLimit(ip);

    if (!result.success) {
      getLogger().warn(
        {
          type: 'SECURITY_AUDIT',
          category: 'rate-limit',
          ip,
          correlationId: ctx.correlationId,
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

    const response = await handler(req, ctx);
    setRateLimitHeaders(response, result);
    return response;
  };
}

function setRateLimitHeaders(res: NextResponse, result: RateLimitResult) {
  res.headers.set('X-RateLimit-Limit', result.limit.toString());
  res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  res.headers.set('X-RateLimit-Reset', result.reset.getTime().toString());
}
