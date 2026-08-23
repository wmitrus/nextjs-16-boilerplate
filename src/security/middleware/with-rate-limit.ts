import type { NextRequest, NextResponse } from 'next/server';

import { env } from '@/core/env';
import { resolveEdgeLogger } from '@/core/logger/di-edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import {
  auditIpForClient,
  getClientIp,
  rateLimitKeyForClient,
} from '@/shared/lib/network/get-ip';
import { checkRateLimit } from '@/shared/lib/rate-limit/rate-limit-helper';
import type { RateLimitResult } from '@/shared/lib/rate-limit/rate-limit-local';

import type { RouteContext } from './route-classification';

let _logger:
  | ReturnType<ReturnType<typeof resolveEdgeLogger>['child']>
  | undefined;

const E2E_RATE_LIMIT_BYPASS_API_PREFIXES = [
  '/api/users',
  '/api/me/provisioning-status',
] as const;

const AUTHJS_PROTOCOL_RATE_LIMIT_BYPASS_PATHS = new Set([
  '/api/auth/callback/credentials',
  '/api/auth/csrf',
  '/api/auth/providers',
  '/api/auth/session',
  '/api/auth/signout',
]);

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger().child({
    type: 'Security',
    category: 'rate-limit',
    module: 'with-rate-limit',
  });
  return _logger;
}

function isE2eRateLimitBypassRoute(pathname: string): boolean {
  return E2E_RATE_LIMIT_BYPASS_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthJsProtocolRateLimitBypassRoute(pathname: string): boolean {
  return env.AUTH_PROVIDER === 'authjs'
    ? AUTHJS_PROTOCOL_RATE_LIMIT_BYPASS_PATHS.has(pathname)
    : false;
}

/**
 * Enforces rate limiting on API routes.
 */
export function withRateLimit(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    const pathname = req.nextUrl.pathname;
    const isE2eBypassRoute =
      env.E2E_ENABLED && isE2eRateLimitBypassRoute(pathname);
    const isAuthJsProtocolBypassRoute =
      isAuthJsProtocolRateLimitBypassRoute(pathname);

    if (
      !ctx.isApi ||
      ctx.isWebhook ||
      isE2eBypassRoute ||
      isAuthJsProtocolBypassRoute
    ) {
      return handler(req, ctx);
    }

    // SEC-43. The client may not be identifiable -- no declared trust model,
    // or a header that did not survive validation. `rateLimitKeyForClient`
    // puts those requests in one shared per-path bucket rather than inventing
    // a loopback address for them, and the WARN below records that the limit
    // being applied is the shared one.
    const client = await getClientIp(req.headers);
    // A fixed prefix, deliberately not `pathname`. This is the generic
    // per-client API window, so one client gets one allowance across all
    // routes; keying it per path would silently multiply that allowance by
    // the number of endpoints they touch.
    const rateLimitKey = rateLimitKeyForClient('api', client);
    const result: RateLimitResult = await checkRateLimit(rateLimitKey, {
      path: pathname,
    });

    if (client.kind === 'untrusted') {
      getLogger().warn(
        {
          type: 'SECURITY_AUDIT',
          category: 'rate-limit',
          event: 'client_ip:untrusted',
          reason: client.reason,
          correlationId: ctx.correlationId,
          path: pathname,
        },
        'Client IP could not be established under the declared trust model; rate limiting this request in the shared untrusted bucket',
      );
    }

    if (!result.success) {
      getLogger().warn(
        {
          type: 'SECURITY_AUDIT',
          category: 'rate-limit',
          ip: auditIpForClient(client),
          correlationId: ctx.correlationId,
          path: pathname,
          limit: result.limit,
          reset: result.reset,
        },
        'Rate Limit Exceeded',
      );

      const errorResponse = createServerErrorResponse(
        'Rate limit exceeded. Please try again later.',
        429,
        'RATE_LIMITED',
      );

      errorResponse.headers.set(
        'Retry-After',
        Math.ceil((result.reset.getTime() - Date.now()) / 1000).toString(),
      );
      setRateLimitHeaders(errorResponse, result);
      return errorResponse;
    }

    const response = await handler(req, ctx);
    setRateLimitHeaders(response, result);
    return response;
  };
}

function setRateLimitHeaders(res: NextResponse, result: RateLimitResult) {
  res.headers.set('X-RateLimit-Limit', result.limit.toString());
  res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  res.headers.set('X-RateLimit-Reset', result.reset.getTime().toString());
}
