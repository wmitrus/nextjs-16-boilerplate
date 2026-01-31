import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { logger } from '@/core/logger/server';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

/**
 * Proxy to enforce rate limiting on all API routes.
 * In Next.js 16, proxy.ts replaces middleware.ts for Node.js runtime use cases.
 */
export async function proxy(request: NextRequest) {
  const correlationId =
    request.headers.get('x-correlation-id') || crypto.randomUUID();

  // Create base response
  let response = NextResponse.next();

  // Apply to API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const ip = await getIP(request.headers);
    const result = await checkRateLimit(ip);

    if (!result.success) {
      logger.warn(
        {
          ip,
          correlationId,
          path: request.nextUrl.pathname,
          limit: result.limit,
          reset: result.reset,
        },
        'Rate limit exceeded',
      );

      response = createServerErrorResponse(
        'Rate limit exceeded. Please try again later.',
        429,
        'RATE_LIMITED',
      );
      response.headers.set(
        'Retry-After',
        Math.ceil((result.reset.getTime() - Date.now()) / 1000).toString(),
      );
      response.headers.set('X-RateLimit-Limit', result.limit.toString());
      response.headers.set(
        'X-RateLimit-Remaining',
        result.remaining.toString(),
      );
      response.headers.set(
        'X-RateLimit-Reset',
        result.reset.getTime().toString(),
      );
    } else {
      // Add rate limit headers to the successful response
      response.headers.set('X-RateLimit-Limit', result.limit.toString());
      response.headers.set(
        'X-RateLimit-Remaining',
        result.remaining.toString(),
      );
      response.headers.set(
        'X-RateLimit-Reset',
        result.reset.getTime().toString(),
      );
    }
  }

  // Set Correlation ID on both request and response
  response.headers.set('x-correlation-id', correlationId);

  return response;
}

/**
 * Configure the middleware to match all API routes.
 */
export const config = {
  matcher: '/api/:path*',
};
