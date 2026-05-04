import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';

import type { RouteContext } from './route-classification';

const SIGN_UP_PATHS = ['/sign-up', '/auth/signup'] as const;

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
 * - invite-only: sign-up paths without ?invitation_token are redirected to /waitlist.
 *                Both Clerk (/sign-up) and AuthJS (/auth/signup) honour ?invitation_token
 *                as the bypass — used when a user arrives via an invitation link.
 * - disabled:    sign-up paths are redirected to /auth/registration-closed
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
      const hasInvitationToken =
        request.nextUrl.searchParams.has('invitation_token');
      if (!hasInvitationToken) {
        const url = request.nextUrl.clone();
        url.pathname = '/waitlist';
        return NextResponse.redirect(url);
      }
    }

    return next(request, ctx);
  };
}
