import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { logger } from '@/core/logger/server';

import { getIP } from '@/shared/lib/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit-helper';

/**
 * Proxy to enforce rate limiting on all API routes.
 * In Next.js 16, proxy.ts replaces middleware.ts for Node.js runtime use cases.
 */
export async function proxy(request: NextRequest) {
  // Only apply to API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const ip = await getIP(request.headers);
    const result = await checkRateLimit(ip);

    if (!result.success) {
      logger.warn(
        {
          ip,
          path: request.nextUrl.pathname,
          limit: result.limit,
          reset: result.reset,
        },
        'Rate limit exceeded',
      );

      return new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil(
              (result.reset.getTime() - Date.now()) / 1000,
            ).toString(),
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.reset.getTime().toString(),
          },
        },
      );
    }

    // Add rate limit headers to the successful response
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', result.limit.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set(
      'X-RateLimit-Reset',
      result.reset.getTime().toString(),
    );

    return response;
  }

  return NextResponse.next();
}

/**
 * Configure the middleware to match all API routes.
 */
export const config = {
  matcher: '/api/:path*',
};
