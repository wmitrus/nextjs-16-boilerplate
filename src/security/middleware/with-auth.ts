import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createAction } from '@/core/contracts/authorization';
import type { Identity } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  type TenantContext,
} from '@/core/contracts/tenancy';
import type { UserRepository } from '@/core/contracts/user';
import { env } from '@/core/env';

import {
  AuthorizationFacade,
  AuthorizationError,
} from '@/security/core/authorization-facade';
import { createRequestScopedContext } from '@/security/core/request-scoped-context';
import type {
  EdgeSecurityDependencies,
  NodeSecurityDependencies,
  SecurityContextDependencies,
} from '@/security/core/security-dependencies';
import type { RouteContext } from '@/security/middleware/route-classification';

type WithAuthCommonOptions = {
  resolveIdentity?: () => Promise<Identity | null>;
  resolveTenant?: (identity: Identity) => Promise<TenantContext>;
};

type WithAuthNodeOptions = WithAuthCommonOptions & {
  dependencies: NodeSecurityDependencies;
  userRepository: UserRepository;
  enforceResourceAuthorization?: true;
};

type WithAuthEdgeOptions = WithAuthCommonOptions & {
  dependencies: EdgeSecurityDependencies;
  userRepository?: never;
  enforceResourceAuthorization?: false;
};

type WithAuthOptions = WithAuthNodeOptions | WithAuthEdgeOptions;

const TENANT_CONTEXT_REQUIRED_REDIRECT = '/onboarding';

function resolveAuthorizationFacade(
  options: WithAuthOptions,
): AuthorizationFacade | null {
  if (options.enforceResourceAuthorization === false) {
    return null;
  }

  if (!('authorizationService' in options.dependencies)) {
    return null;
  }

  return new AuthorizationFacade(options.dependencies.authorizationService);
}

async function resolveIdentity(
  options: WithAuthOptions,
): Promise<Identity | null> {
  return options.resolveIdentity
    ? options.resolveIdentity()
    : options.dependencies.identityProvider.getCurrentIdentity();
}

async function resolveOnboardingComplete(
  userRepository: UserRepository,
  userId?: string,
): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const user = await userRepository.findById(userId);
  return Boolean(user?.onboardingComplete);
}

async function resolveOnboardingCompleteForMode(
  options: WithAuthOptions,
  userId?: string,
): Promise<boolean> {
  if (options.enforceResourceAuthorization === false) {
    return true;
  }

  return resolveOnboardingComplete(
    (options as WithAuthNodeOptions).userRepository,
    userId,
  );
}

function redirectForMissingTenantContext(req: NextRequest): NextResponse {
  const redirectUrl = new URL(TENANT_CONTEXT_REQUIRED_REDIRECT, req.url);
  redirectUrl.searchParams.set('reason', 'tenant-context-required');

  return NextResponse.redirect(redirectUrl);
}

function redirectAuthenticatedFromAuthRoute(
  req: NextRequest,
  ctx: RouteContext,
  userId: string | undefined,
  onboardingComplete: boolean,
): NextResponse | null {
  if (!userId || !ctx.isAuthRoute) {
    return null;
  }

  const redirectUrl = onboardingComplete
    ? new URL('/', req.url)
    : new URL('/onboarding', req.url);

  return NextResponse.redirect(redirectUrl);
}

function redirectForIncompleteOnboarding(
  req: NextRequest,
  ctx: RouteContext,
  userId: string | undefined,
  onboardingComplete: boolean,
): NextResponse | null {
  if (!userId || ctx.isOnboardingRoute || ctx.isPublicRoute || ctx.isApi) {
    return null;
  }

  if (!onboardingComplete) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return null;
}

function rejectUnauthenticatedPrivateRoute(
  req: NextRequest,
  ctx: RouteContext,
  userId: string | undefined,
): NextResponse | null {
  const isE2eRoute =
    req.nextUrl.pathname.startsWith('/e2e-error') ||
    req.nextUrl.pathname.startsWith('/users');

  if (userId || ctx.isPublicRoute || (env.E2E_ENABLED && isE2eRoute)) {
    return null;
  }

  if (ctx.isApi) {
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

async function authorizeRouteAccess(
  req: NextRequest,
  ctx: RouteContext,
  identity: Identity,
  securityContextDependencies: SecurityContextDependencies,
  resolveTenantOverride:
    | ((identity: Identity) => Promise<TenantContext>)
    | undefined,
  authorization: AuthorizationFacade,
): Promise<NextResponse | null> {
  if (ctx.isPublicRoute) {
    return null;
  }

  const tenant = resolveTenantOverride
    ? await resolveTenantOverride(identity)
    : await securityContextDependencies.tenantResolver.resolve(identity);

  const requestScope = createRequestScopedContext({
    identityId: identity.id,
    tenantId: tenant.tenantId,
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
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
        id: identity.id,
      },
      resource: {
        type: 'route',
        id: req.nextUrl.pathname,
      },
      action: createAction('route', 'access'),
      environment: {
        ip:
          req.headers.get('x-forwarded-for') ??
          req.headers.get('x-real-ip') ??
          undefined,
        time: new Date(),
        path: req.nextUrl.pathname,
        method: req.method,
      },
      attributes: {
        requestScope,
      },
    },
    'Route access denied',
  );

  return null;
}

/**
 * Middleware to enforce authentication, onboarding, and authorization.
 *
 * Rules:
 * 1️⃣ Auth routes: redirect signed-in users
 * 2️⃣ Private routes: enforce onboarding
 * 3️⃣ API routes: return JSON error on unauthorized
 * 4️⃣ E2E routes bypass auth if env.E2E_ENABLED
 * 5️⃣ Route access: authorized via PolicyEngine with ABAC environment context
 */
export function withAuth(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
  options: WithAuthOptions,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    const authorization = resolveAuthorizationFacade(options);

    // Internal API routes are handled by withInternalApiGuard and do not require session auth
    if (ctx.isInternalApi) {
      return handler(req, ctx);
    }

    // Fast path: non-auth public routes do not require identity resolution
    if (ctx.isPublicRoute && !ctx.isAuthRoute) {
      return handler(req, ctx);
    }

    const identity = await resolveIdentity(options);
    const userId = identity?.id;
    const onboardingComplete = await resolveOnboardingCompleteForMode(
      options,
      userId,
    );

    // 1. Redirect authenticated users away from auth routes (sign-in/sign-up)
    const authRouteRedirect = redirectAuthenticatedFromAuthRoute(
      req,
      ctx,
      userId,
      onboardingComplete,
    );
    if (authRouteRedirect) {
      return authRouteRedirect;
    }

    // 2. Enforce onboarding for private routes
    const onboardingRedirect = redirectForIncompleteOnboarding(
      req,
      ctx,
      userId,
      onboardingComplete,
    );
    if (onboardingRedirect) {
      return onboardingRedirect;
    }

    // 3. Protect private routes
    const unauthenticatedReject = rejectUnauthenticatedPrivateRoute(
      req,
      ctx,
      userId,
    );
    if (unauthenticatedReject) {
      return unauthenticatedReject;
    }

    // 4. Authorization check for authenticated non-public routes
    if (authorization && identity && userId && !ctx.isPublicRoute) {
      try {
        await authorizeRouteAccess(
          req,
          ctx,
          identity,
          options.dependencies,
          options.resolveTenant,
          authorization,
        );
      } catch (error) {
        if (error instanceof MissingTenantContextError) {
          if (ctx.isApi) {
            return NextResponse.json(
              {
                status: 'server_error',
                error: 'Tenant context required',
                code: 'TENANT_CONTEXT_REQUIRED',
              },
              { status: 409 },
            );
          }

          return redirectForMissingTenantContext(req);
        }

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
