import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { logger } from '@/core/logger/edge';

import { classifyRequest } from './route-classification';
import { withAuth } from './with-auth';
import { withHeaders } from './with-headers';
import { withInternalApiGuard } from './with-internal-api-guard';
import { withRateLimit } from './with-rate-limit';

/**
 * Main security middleware pipeline entry point.
 * Wraps clerkMiddleware and executes security guards in sequence.
 */
export function withSecurity() {
  return clerkMiddleware(async (auth, request) => {
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
    let response = NextResponse.next();

    // 1. Internal API Guard (Short-circuit if fails)
    const internalGuardRes = withInternalApiGuard(request, response, ctx);
    if (internalGuardRes) return internalGuardRes;

    // 2. Auth & Redirects (Short-circuit if fails)
    const authRes = await withAuth(auth, request, ctx);
    if (authRes) return authRes;

    // 3. Rate Limiting (Short-circuit if fails)
    const rateLimitRes = await withRateLimit(
      request,
      response,
      ctx,
      correlationId,
    );
    if (rateLimitRes) return rateLimitRes;

    // 4. Protection check for non-public routes (Terminal protection)
    const e2eEnabled = process.env.E2E_ENABLED === 'true';
    const isE2eRoute =
      request.nextUrl.pathname.startsWith('/e2e-error') ||
      request.nextUrl.pathname.startsWith('/users');

    if (
      !ctx.isPublicRoute &&
      !ctx.isInternalApi &&
      !(e2eEnabled && isE2eRoute)
    ) {
      await auth.protect();
    }

    // 5. Apply Security Headers
    response = withHeaders(request, response);

    // 6. Set Metadata Headers
    response.headers.set('x-correlation-id', correlationId);

    return response;
  });
}
