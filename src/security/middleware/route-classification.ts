import type { NextRequest } from 'next/server';

export interface RouteContext {
  isApi: boolean;
  isWebhook: boolean;
  isInternalApi: boolean;
  isAuthRoute: boolean;
  isOnboardingRoute: boolean;
  isPublicRoute: boolean;
  isStaticFile: boolean;
}

const PUBLIC_ROUTES = [
  '/',
  '/waitlist',
  '/security-showcase',
  '/api/security-test/ssrf',
  '/api/logs',
];

const AUTH_ROUTES = ['/sign-in', '/sign-up'];

/**
 * Classifies the incoming request based on its path.
 */
export function classifyRequest(req: NextRequest): RouteContext {
  const path = req.nextUrl.pathname;

  const isStaticFile =
    /\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$/.test(
      path,
    ) || path.startsWith('/_next');

  const isApi = path.startsWith('/api') || path.startsWith('/trpc');
  const isWebhook = path.startsWith('/api/webhooks');
  const isInternalApi = path.startsWith('/api/internal');

  const isAuthRoute = AUTH_ROUTES.some((route) => path.startsWith(route));
  const isOnboardingRoute = path.startsWith('/onboarding');

  const isPublicRoute =
    PUBLIC_ROUTES.some(
      (route) => path === route || path.startsWith(`${route}/`),
    ) || isAuthRoute;

  return {
    isApi,
    isWebhook,
    isInternalApi,
    isAuthRoute,
    isOnboardingRoute,
    isPublicRoute,
    isStaticFile,
  };
}
