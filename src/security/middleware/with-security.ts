import { type NextRequest, NextResponse } from 'next/server';

import { resolveEdgeLogger } from '@/core/logger/di';

import {
  classifyRequest,
  type RouteContext,
} from '@/security/middleware/route-classification';
import { withHeaders } from '@/security/middleware/with-headers';

const logger = resolveEdgeLogger().child({
  type: 'Security',
  category: 'middleware',
  module: 'with-security',
});

/**
 * Main security middleware pipeline entry point.
 * Executes security guards in sequence via composition.
 *
 * This function is provider-agnostic and does not wrap framework-specific auth middleware.
 * Framework adapters (e.g. Clerk) should be applied at the proxy boundary.
 */
export function withSecurity(
  handler: (
    req: NextRequest,
    ctx: RouteContext,
  ) => Promise<NextResponse> = async () => NextResponse.next(),
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const ctx = classifyRequest(request);
    logger.debug(
      { path: request.nextUrl.pathname },
      'Security Middleware Processing',
    );

    // Skip security logic for static files to optimize performance
    if (ctx.isStaticFile) {
      return NextResponse.next();
    }

    const correlationId =
      request.headers.get('x-correlation-id') || crypto.randomUUID();

    // Execute the composed middleware pipeline
    let response = await handler(request, ctx);

    // Apply Security Headers & Metadata
    response = withHeaders(request, response);
    response.headers.set('x-correlation-id', correlationId);

    return response;
  };
}
