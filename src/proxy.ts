import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { logger } from '@/core/logger/server';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import { getIP } from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/']);
const isAuthRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);
const isOnboardingRoute = createRouteMatcher(['/onboarding(.*)']);

/**
 * Proxy to enforce rate limiting on all API routes and Clerk authentication.
 * In Next.js 16, proxy.ts replaces middleware.ts for Node.js runtime use cases.
 */
export default clerkMiddleware(async (auth, request) => {
  const { userId, sessionClaims } = await auth();

  // 1. Redirect authenticated users away from auth routes (sign-in/sign-up)
  if (userId && isAuthRoute(request)) {
    // We check sessionClaims first for performance
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;

    // If sessionClaims says incomplete, we check the backend to avoid "read your writes" stale JWT issues
    if (!onboardingComplete) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
    }

    const redirectUrl = onboardingComplete
      ? new URL('/', request.url)
      : new URL('/onboarding', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. For users visiting /onboarding, don't try to redirect further
  if (userId && isOnboardingRoute(request)) {
    return NextResponse.next();
  }

  // 3. Catch users who do not have `onboardingComplete: true` in their publicMetadata
  // Redirect them to the /onboarding route to complete onboarding
  if (userId && !isOnboardingRoute(request)) {
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;

    // If sessionClaims says incomplete, check backend to prevent loop if user JUST finished onboarding
    if (!onboardingComplete) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
    }

    if (!onboardingComplete) {
      const onboardingUrl = new URL('/onboarding', request.url);
      return NextResponse.redirect(onboardingUrl);
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }

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
