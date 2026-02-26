import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { container } from '@/core/container';
import { AUTH } from '@/core/contracts';
import type { Identity } from '@/core/contracts/identity';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';

import type { RouteContext } from '@/security/middleware/route-classification';

/**
 * Middleware to enforce authentication, onboarding, and authorization.
 * - Uses IdentityProvider to get current user
 * - Uses UserRepository for onboarding status
 * - Optionally integrates with AuthorizationService (can be added)
 *
 * Rules:
 * 1️⃣ Auth routes: redirect signed-in users
 * 2️⃣ Private routes: enforce onboarding
 * 3️⃣ API routes: return JSON error on unauthorized
 * 4️⃣ E2E routes bypass auth if env.E2E_ENABLED
 */
export function withAuth(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
  options?: {
    resolveIdentity?: () => Promise<Identity | null>;
  },
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    // Internal API routes are handled by withInternalApiGuard
    if (ctx.isInternalApi) {
      return handler(req, ctx);
    }

    const identityProvider = container.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    );
    const identity = options?.resolveIdentity
      ? await options.resolveIdentity()
      : await identityProvider.getCurrentIdentity();
    const userId = identity?.id;

    let onboardingComplete = false;

    if (userId) {
      const userRepository = container.resolve<UserRepository>(
        AUTH.USER_REPOSITORY,
      );
      const user = await userRepository.findById(userId);
      onboardingComplete = Boolean(user?.onboardingComplete);
    }

    // 1. Redirect authenticated users away from auth routes (sign-in/sign-up)
    if (userId && ctx.isAuthRoute) {
      const redirectUrl = onboardingComplete
        ? new URL('/', req.url)
        : new URL('/onboarding', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    // 2. Enforce onboarding for private routes
    if (userId && !ctx.isOnboardingRoute && !ctx.isPublicRoute && !ctx.isApi) {
      if (!onboardingComplete) {
        return NextResponse.redirect(new URL('/onboarding', req.url));
      }
    }

    // 3. Protect private routes
    const isE2eRoute =
      req.nextUrl.pathname.startsWith('/e2e-error') ||
      req.nextUrl.pathname.startsWith('/users');

    if (!userId && !ctx.isPublicRoute && !(env.E2E_ENABLED && isE2eRoute)) {
      if (ctx.isApi) {
        /* Think and decide wheter to return
          return NextResponse.json(
            { status: 'error', code: 'UNAUTHORIZED', message: 'Unauthorized' },
            { status: 401 },
          );
        */
        return NextResponse.json(
          {
            status: 'server_error',
            error: 'Unauthorized',
            code: 'UNAUTHORIZED',
          },
          { status: 401 },
        );
      }

      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }

    // Optional: Authorization check
    // const authService = container.resolve<AuthorizationService>(AUTH.AUTHORIZATION_SERVICE);
    // const context: AuthorizationContext = { ... };
    // const allowed = await authService.can(context);
    // if (!allowed) return NextResponse.redirect(new URL('/unauthorized', req.url));

    return handler(req, ctx);
  };
}
