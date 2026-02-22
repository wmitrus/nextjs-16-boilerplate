import type { NextRequest } from 'next/server';

import {
  AUTH_ROUTE_PREFIXES,
  PUBLIC_ROUTE_PREFIXES,
  matchesAnyRoutePrefix,
} from './route-policy';

export interface RouteContext {
  isApi: boolean;
  isWebhook: boolean;
  isInternalApi: boolean;
  isAuthRoute: boolean;
  isOnboardingRoute: boolean;
  isPublicRoute: boolean;
  isStaticFile: boolean;
}

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

  const isAuthRoute = matchesAnyRoutePrefix(path, AUTH_ROUTE_PREFIXES);
  const isOnboardingRoute = path.startsWith('/onboarding');

  const isPublicRoute =
    matchesAnyRoutePrefix(path, PUBLIC_ROUTE_PREFIXES) || isAuthRoute;

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
