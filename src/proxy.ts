import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';
import { logger } from '@/core/logger/edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

import {
  AUTH_ROUTE_PREFIXES,
  PUBLIC_ROUTE_PREFIXES,
  toRouteMatcherPatterns,
} from '@/security/middleware/route-policy';
import { withHeaders } from '@/security/middleware/with-headers';

const isPublicRoute = createRouteMatcher(
  toRouteMatcherPatterns([...AUTH_ROUTE_PREFIXES, ...PUBLIC_ROUTE_PREFIXES]),
);
const isE2eRoute = createRouteMatcher(['/e2e-error(.*)', '/users(.*)']);
const isAuthRoute = createRouteMatcher(
  toRouteMatcherPatterns(AUTH_ROUTE_PREFIXES),
);
const isOnboardingRoute = createRouteMatcher(['/onboarding(.*)']);

/**
 * Proxy to enforce rate limiting on all API routes and Clerk authentication.
 * In Next.js 16, proxy.ts replaces middleware.ts for Node.js runtime use cases.
 */
export default clerkMiddleware(async (auth, request) => {
  const isInternalApi = request.nextUrl.pathname.startsWith('/api/internal');
  const isPublic = isPublicRoute(request);
  const isAuth = isAuthRoute(request);
  const isOnboarding = isOnboardingRoute(request);
  const correlationId =
    request.headers.get('x-correlation-id') || crypto.randomUUID();

  const finalize = (response: NextResponse) => {
    const secured = withHeaders(request, response);
    secured.headers.set('x-correlation-id', correlationId);
    return secured;
  };

  if (isInternalApi) {
    const internalKey = request.headers.get('x-internal-key');
    logger.debug(
      {
        path: request.nextUrl.pathname,
        hasInternalKey: Boolean(internalKey),
        keyMatched: internalKey === env.INTERNAL_API_KEY,
      },
      'Internal API key validation',
    );

    if (!env.INTERNAL_API_KEY || internalKey !== env.INTERNAL_API_KEY) {
      logger.error(
        {
          path: request.nextUrl.pathname,
          ip: request.headers.get('x-forwarded-for') || 'unknown',
        },
        'Unauthorized Internal API Access Attempt',
      );

      return finalize(
        createServerErrorResponse(
          'Forbidden: Internal Access Only',
          403,
          'FORBIDDEN',
        ),
      );
    }
  }

  if (!isInternalApi) {
    const requiresAuthEvaluation = isAuth || isOnboarding || !isPublic;

    if (requiresAuthEvaluation) {
      const { userId, sessionClaims } = await auth();

      if (userId && isAuth) {
        let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;

        if (!onboardingComplete) {
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          onboardingComplete = user.publicMetadata
            ?.onboardingComplete as boolean;
        }

        const redirectUrl = onboardingComplete
          ? new URL('/', request.url)
          : new URL('/onboarding', request.url);
        return finalize(NextResponse.redirect(redirectUrl));
      }

      if (userId && isOnboarding) {
        return finalize(NextResponse.next());
      }

      if (userId && !isOnboarding && !isPublic) {
        let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;

        if (!onboardingComplete) {
          const client = await clerkClient();
          const user = await client.users.getUser(userId);
          onboardingComplete = user.publicMetadata
            ?.onboardingComplete as boolean;
        }

        if (!onboardingComplete) {
          const onboardingUrl = new URL('/onboarding', request.url);
          return finalize(NextResponse.redirect(onboardingUrl));
        }
      }

      const e2eEnabled = process.env.E2E_ENABLED === 'true';

      if (!isPublic && !(e2eEnabled && isE2eRoute(request))) {
        await auth.protect();
      }
    }
  }

  let response = NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api')) {
    const ip = await getIP(request.headers);
    const startedAt = Date.now();
    logger.debug(
      {
        path: request.nextUrl.pathname,
        ip,
      },
      'Rate limit check started',
    );
    const result = await checkRateLimit(ip);
    logger.debug(
      {
        path: request.nextUrl.pathname,
        ip,
        success: result.success,
        durationMs: Date.now() - startedAt,
      },
      'Rate limit check completed',
    );

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

  return finalize(response);
});

/**
 * Configure the middleware to match all routes except static files and internals.
 */
export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
