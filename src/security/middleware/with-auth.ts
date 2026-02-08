import { clerkClient, type ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { RouteContext } from './route-classification';

/**
 * Handles Authentication and Onboarding redirects.
 * Ports logic from the original proxy.ts.
 */
export async function withAuth(
  auth: ClerkMiddlewareAuth,
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse | null> {
  const { userId, sessionClaims } = await auth();

  // 1. Redirect authenticated users away from auth routes (sign-in/sign-up)
  if (userId && ctx.isAuthRoute) {
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;

    if (!onboardingComplete) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
    }

    const redirectUrl = onboardingComplete
      ? new URL('/', req.url)
      : new URL('/onboarding', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Enforce onboarding for private routes
  if (userId && !ctx.isOnboardingRoute && !ctx.isPublicRoute && !ctx.isApi) {
    let onboardingComplete = sessionClaims?.metadata?.onboardingComplete;

    if (!onboardingComplete) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      onboardingComplete = user.publicMetadata?.onboardingComplete as boolean;
    }

    if (!onboardingComplete) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }
  }

  // 3. Protect private routes
  const e2eEnabled = process.env.E2E_ENABLED === 'true';
  const isE2eRoute =
    req.nextUrl.pathname.startsWith('/e2e-error') ||
    req.nextUrl.pathname.startsWith('/users');

  if (!userId && !ctx.isPublicRoute && !(e2eEnabled && isE2eRoute)) {
    // Clerk's protect() throws a redirect or 401, but we can't easily call it inside our composable flow
    // without it being the terminal middleware. Instead, we let Clerk handle the protection
    // via auth.protect() if we return null here, or we can manually redirect.
    // However, to keep it clean, we return null and let the terminal stage handle it.
  }

  return null;
}
