import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { IdentityProvider } from '@/core/contracts/identity';
import { env } from '@/core/env';
import { resolveEdgeLogger } from '@/core/logger/di-edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';

import type { RouteContext } from './route-classification';

let _logger:
  | ReturnType<ReturnType<typeof resolveEdgeLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger().child({
    type: 'Security',
    category: 'demo-guard',
    module: 'with-demo-guard',
  });
  return _logger;
}

/**
 * A demo route with the flag off, or the wrong signed-in user, must behave
 * as if it doesn't exist — a 403/redirect would still confirm something is
 * there. For an API route this is a JSON 404 matching the shared response
 * envelope; for a page route it's a rewrite to an unmatched path so
 * Next.js renders its real not-found.tsx boundary (a true 404 status)
 * instead of a hand-authored response shape.
 */
function demoNotFound(req: NextRequest, ctx: RouteContext): NextResponse {
  if (ctx.isApi) {
    return createServerErrorResponse('Not Found', 404, 'NOT_FOUND');
  }
  return NextResponse.rewrite(new URL('/__demo_route_disabled__', req.url));
}

/**
 * Gates every route in DEMO_ROUTE_PREFIXES behind DEMO_SHOWCASE_ENABLED
 * (default false). Runs BEFORE withAuth in the pipeline so a disabled demo
 * route 404s regardless of the caller's auth state — an unauthenticated
 * visitor must not learn "this exists, sign in to see it" from a redirect.
 *
 * When the flag is on, this is a no-op: the route falls through to
 * withAuth, which enforces sign-in normally since demo routes are not in
 * PUBLIC_ROUTE_PREFIXES. See withDemoAllowlistGuard for the optional
 * post-auth email restriction.
 */
export function withDemoGuard(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    if (ctx.isDemoRoute && !env.DEMO_SHOWCASE_ENABLED) {
      getLogger().warn(
        { path: req.nextUrl.pathname },
        'Demo route access blocked: DEMO_SHOWCASE_ENABLED is off',
      );
      return demoNotFound(req, ctx);
    }
    return handler(req, ctx);
  };
}

type WithDemoAllowlistGuardOptions = {
  dependencies: { identityProvider: IdentityProvider };
};

/**
 * Optional second gate on top of withDemoGuard: when DEMO_SHOWCASE_ENABLED
 * is on AND DEMO_SHOWCASE_ALLOWED_EMAIL is set, only the signed-in user
 * with that exact email may reach a demo route. Must run AFTER withAuth —
 * it resolves the caller's identity to check the email, and relies on
 * withAuth having already redirected an unauthenticated caller to sign-in
 * (so a legitimate demo viewer gets a normal sign-in prompt, not a 404,
 * before the email check applies).
 */
export function withDemoAllowlistGuard(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
  options: WithDemoAllowlistGuardOptions,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    if (
      !ctx.isDemoRoute ||
      !env.DEMO_SHOWCASE_ENABLED ||
      !env.DEMO_SHOWCASE_ALLOWED_EMAIL
    ) {
      return handler(req, ctx);
    }

    const identity =
      await options.dependencies.identityProvider.getCurrentIdentity();
    if (identity?.email !== env.DEMO_SHOWCASE_ALLOWED_EMAIL) {
      getLogger().warn(
        { path: req.nextUrl.pathname },
        'Demo route access blocked: signed-in user is not on DEMO_SHOWCASE_ALLOWED_EMAIL',
      );
      return demoNotFound(req, ctx);
    }

    return handler(req, ctx);
  };
}
