import type { NextRequest } from 'next/server';

import { env } from '@/core/env';

import {
  type CorrelationRejectionReason,
  type CorrelationSource,
  generateRequestId,
  resolveCorrelationId,
} from '@/shared/lib/observability/correlation-id';

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
  /**
   * Canonical for this request: either a caller-supplied id that passed
   * validation, or one minted here. Never the raw header value (SEC-46).
   */
  correlationId: string;
  /** Always server-generated. A caller-supplied `x-request-id` is ignored. */
  requestId: string;
  /** Whether `correlationId` came from the caller. Operational metadata. */
  correlationSource: CorrelationSource;
  /** Set only when a present `x-correlation-id` was refused. */
  correlationRejection?: CorrelationRejectionReason;
  /** Length of the refused value; its content is never captured. */
  correlationRejectedLength?: number;
  /**
   * Per-request CSP script-src nonce, set only when CSP_SCRIPT_MODE is
   * 'nonce-dynamic' (see with-headers.ts). undefined in 'cache-compatible'
   * mode — callers must not force dynamic rendering (e.g. via headers())
   * to look for a nonce that was never generated.
   */
  nonce: string | undefined;
}

/**
 * Classifies the incoming request based on its path.
 */
export function classifyRequest(req: NextRequest): RouteContext {
  const path = req.nextUrl.pathname;
  // The one place an inbound correlation id is trusted -- everything
  // downstream reads the canonical value this forwards (SEC-46).
  const correlation = resolveCorrelationId(req.headers.get('x-correlation-id'));
  // `x-request-id` is deliberately not read at all.
  const requestId = generateRequestId();

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
  const nonce =
    env.CSP_SCRIPT_MODE === 'nonce-dynamic'
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
    correlationId: correlation.correlationId,
    requestId,
    correlationSource: correlation.source,
    correlationRejection: correlation.rejection,
    correlationRejectedLength: correlation.rejectedLength,
    nonce,
  };
}
