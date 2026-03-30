import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';

import { sanitizeRedirectUrl } from '@/shared/lib/routing/safe-redirect';

import { resolveBootstrapOutcome } from '../resolve-bootstrap-outcome';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'bootstrap_start',
});

export async function GET(request: NextRequest) {
  const rawRedirectUrl = request.nextUrl.searchParams.get('redirect_url') ?? '';
  const safeTarget = sanitizeRedirectUrl(rawRedirectUrl, '/users');

  logger.info(
    {
      event: 'bootstrap_start:entry',
      pathname: '/auth/bootstrap/start',
      redirectUrl: rawRedirectUrl,
      safeTarget,
    },
    'Bootstrap start route entered',
  );

  let outcome;
  try {
    outcome = await resolveBootstrapOutcome(safeTarget);
  } catch (err) {
    logger.error(
      {
        event: 'bootstrap_start:error',
        pathname: '/auth/bootstrap/start',
        err,
      },
      'Unexpected error during bootstrap outcome resolution',
    );
    return NextResponse.redirect(
      new URL('/auth/bootstrap?error=db_error', request.url),
    );
  }

  logger.info(
    {
      event: 'bootstrap_start:decision',
      pathname: '/auth/bootstrap/start',
      outcome: outcome.type,
      safeTarget,
    },
    'Bootstrap start decision made',
  );

  switch (outcome.type) {
    case 'unauthenticated':
      return NextResponse.redirect(new URL('/sign-in', request.url));

    case 'org_required': {
      const target = new URL('/auth/bootstrap', request.url);
      target.searchParams.set('state', 'org-required');
      if (rawRedirectUrl)
        target.searchParams.set('redirect_url', rawRedirectUrl);
      return NextResponse.redirect(target);
    }

    case 'error': {
      const target = new URL('/auth/bootstrap', request.url);
      target.searchParams.set('error', outcome.error);
      return NextResponse.redirect(target);
    }

    case 'onboarding_required': {
      const cookieStore = await cookies();
      cookieStore.set('__onboarding_pending', '1', {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
      return NextResponse.redirect(
        new URL(
          `/onboarding?redirect_url=${encodeURIComponent(outcome.safeTarget)}`,
          request.url,
        ),
      );
    }

    case 'ready':
      return NextResponse.redirect(new URL(outcome.safeTarget, request.url));
  }
}
