import type { NextRequest } from 'next/server';

import { env } from '@/core/env';

import {
  AUTH_ROUTE_PREFIXES,
  DEMO_ROUTE_PREFIXES,
  PUBLIC_ROUTE_PREFIXES,
  matchesAnyRoutePrefix,
} from './route-policy';

export interface RouteContext {
  isApi: boolean;
  isWebhook: boolean;
  isInternalApi: boolean;
  isAuthRoute: boolean;
  isOnboardingRoute: boolean;
  isBootstrapRoute: boolean;
  isPublicRoute: boolean;
  isDemoRoute: boolean;
  isStaticFile: boolean;
  correlationId: string;
  requestId: string;
  /**
   * Per-request CSP script-src nonce, set only when CSP_SCRIPT_STRICT_MODE
   * is on (see with-headers.ts). undefined in legacy/relaxed CSP mode —
   * callers must not force dynamic rendering (e.g. via headers()) to look
   * for a nonce that was never generated.
   */
  nonce: string | undefined;
}

/**
 * Classifies the incoming request based on its path.
 */
export function classifyRequest(req: NextRequest): RouteContext {
  const path = req.nextUrl.pathname;
  const correlationId =
    req.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  const isStaticFile =
    /\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$/.test(
      path,
    ) || path.startsWith('/_next');

  const isApi = path.startsWith('/api') || path.startsWith('/trpc');
  const isWebhook = path.startsWith('/api/webhooks');
  const isInternalApi = path.startsWith('/api/internal');

  const isAuthRoute = matchesAnyRoutePrefix(path, AUTH_ROUTE_PREFIXES);
  const isOnboardingRoute = path.startsWith('/onboarding');
  const isBootstrapRoute =
    path === '/auth/bootstrap' || path.startsWith('/auth/bootstrap/');

  const isPublicRoute =
    matchesAnyRoutePrefix(path, PUBLIC_ROUTE_PREFIXES) || isAuthRoute;
  const isDemoRoute = matchesAnyRoutePrefix(path, DEMO_ROUTE_PREFIXES);

  // btoa(randomUUID()) rather than a raw UUID: CSP nonces are conventionally
  // base64 tokens, and this keeps the value opaque in response headers.
  const nonce = env.CSP_SCRIPT_STRICT_MODE
    ? btoa(crypto.randomUUID())
    : undefined;

  return {
    isApi,
    isWebhook,
    isInternalApi,
    isAuthRoute,
    isOnboardingRoute,
    isBootstrapRoute,
    isPublicRoute,
    isDemoRoute,
    isStaticFile,
    correlationId,
    requestId,
    nonce,
  };
}
