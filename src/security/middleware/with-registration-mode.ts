import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';

import type { RouteContext } from './route-classification';

const SIGN_UP_PATHS = ['/sign-up'] as const;

function isSignUpPath(pathname: string): boolean {
  return SIGN_UP_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

type ProxyHandler = (
  req: NextRequest,
  ctx: RouteContext,
) => Promise<NextResponse>;

/**
 * Edge guard for REGISTRATION_MODE.
 *
 * - open:        no restriction (default)
 * - invite-only: /sign-up without ?invitation_token is redirected to /waitlist
 * - disabled:    /sign-up is redirected to /auth/registration-closed
 *
 * Must run before withAuth so unauthenticated sign-up requests are handled
 * cleanly without triggering auth errors.
 */
export function withRegistrationMode(next: ProxyHandler): ProxyHandler {
  return async (request: NextRequest, ctx: RouteContext) => {
    const mode = env.REGISTRATION_MODE;

    if (mode === 'open') {
      return next(request, ctx);
    }

    const { pathname } = request.nextUrl;

    if (!isSignUpPath(pathname)) {
      return next(request, ctx);
    }

    if (mode === 'disabled') {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/registration-closed';
      return NextResponse.redirect(url);
    }

    if (mode === 'invite-only') {
      const hasToken = request.nextUrl.searchParams.has('invitation_token');
      if (!hasToken) {
        const url = request.nextUrl.clone();
        url.pathname = '/waitlist';
        return NextResponse.redirect(url);
      }
    }

    return next(request, ctx);
  };
}
