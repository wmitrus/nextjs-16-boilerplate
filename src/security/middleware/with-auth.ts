import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createAction } from '@/core/contracts/authorization';
import type { Identity } from '@/core/contracts/identity';
import type { TenantContext } from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';

import {
  AuthorizationFacade,
  AuthorizationError,
} from '@/security/core/authorization-facade';
import { createRequestScopedContext } from '@/security/core/request-scoped-context';
import type { SecurityDependencies } from '@/security/core/security-dependencies';
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
  options: {
    dependencies: SecurityDependencies;
    userRepository: UserRepository;
    resolveIdentity?: () => Promise<Identity | null>;
    resolveTenant?: (identity: Identity) => Promise<TenantContext>;
  },
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    const {
      dependencies: { authorizationService, identityProvider, tenantResolver },
      userRepository,
    } = options;
    const authorization = new AuthorizationFacade(authorizationService);

    // Internal API routes are handled by withInternalApiGuard
    if (ctx.isInternalApi) {
      return handler(req, ctx);
    }

    // Fast path: non-auth public routes do not require identity resolution.
    if (ctx.isPublicRoute && !ctx.isAuthRoute) {
      return handler(req, ctx);
    }

    const identity = options.resolveIdentity
      ? await options.resolveIdentity()
      : await identityProvider.getCurrentIdentity();
    const userId = identity?.id;

    let onboardingComplete = false;

    if (userId) {
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

    if (userId && !ctx.isPublicRoute) {
      try {
        const tenant = options.resolveTenant
          ? await options.resolveTenant(identity!)
          : await tenantResolver.resolve(identity!);

        const correlationId =
          req.headers.get('x-correlation-id') ?? crypto.randomUUID();
        const requestId =
          req.headers.get('x-request-id') ?? crypto.randomUUID();
        const requestScope = createRequestScopedContext({
          identityId: userId,
          tenantId: tenant.tenantId,
          correlationId,
          requestId,
          runtime: 'edge',
          environment: env.NODE_ENV,
          metadata: {
            path: req.nextUrl.pathname,
            method: req.method,
          },
        });

        await authorization.authorize(
          {
            tenant,
            subject: {
              id: userId,
            },
            resource: {
              type: 'route',
              id: req.nextUrl.pathname,
            },
            action: createAction('route', 'access'),
            attributes: {
              requestScope,
            },
          },
          'Route access denied',
        );
      } catch (error) {
        if (error instanceof AuthorizationError) {
          if (ctx.isApi) {
            return NextResponse.json(
              {
                status: 'server_error',
                error: 'Forbidden',
                code: 'FORBIDDEN',
              },
              { status: 403 },
            );
          }

          return NextResponse.redirect(new URL('/', req.url));
        }

        throw error;
      }
    }

    return handler(req, ctx);
  };
}
