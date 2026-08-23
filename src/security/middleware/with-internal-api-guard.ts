import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { env } from '@/core/env';
import { resolveEdgeLogger } from '@/core/logger/di-edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import {
  auditIpForClient,
  getClientIp,
  rateLimitKeyForClient,
} from '@/shared/lib/network/get-ip';

import type { RouteContext } from './route-classification';

import { verifyAgainstKeys } from '@/security/internal-api/constant-time';
import {
  clearFailedAuthAttempts,
  getFailedAuthState,
  recordFailedAuthAttempt,
} from '@/security/internal-api/failed-auth-limit';

let _logger:
  | ReturnType<ReturnType<typeof resolveEdgeLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger().child({
    type: 'Security',
    category: 'internal-api-guard',
    module: 'with-internal-api-guard',
  });
  return _logger;
}

/**
 * The keys this deployment accepts, current first (SEC-44).
 *
 * Two are allowed so a rotation can be done without downtime: publish the new
 * key as `INTERNAL_API_KEY`, move the old one to `INTERNAL_API_KEY_PREVIOUS`,
 * let callers cut over, then remove it.
 */
function acceptedKeys(): string[] {
  return [env.INTERNAL_API_KEY, env.INTERNAL_API_KEY_PREVIOUS].filter(
    (key): key is string => typeof key === 'string' && key.length > 0,
  );
}

/**
 * Protects internal-only API routes.
 *
 * Deliberately composed **before** `withRateLimit` in `src/proxy.ts`. That
 * ordering is correct -- an unauthenticated caller should be turned away by
 * the guard rather than by a limiter that would then have charged a
 * legitimate client's ordinary API allowance for someone else's guessing --
 * but it did mean rejected keys were never metered at all. Hence the
 * dedicated failed-auth counter below rather than a pipeline reorder.
 */
export function withInternalApiGuard(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    if (!ctx.isInternalApi) {
      return handler(req, ctx);
    }

    const client = await getClientIp(req.headers);
    const clientKey = rateLimitKeyForClient('internal-api', client);
    const forbidden = () =>
      createServerErrorResponse(
        'Forbidden: Internal Access Only',
        403,
        'FORBIDDEN',
      );

    const { lockedOut, degraded } = await getFailedAuthState(clientKey);
    if (lockedOut) {
      // Refused before any comparison runs: a caller who has already spent
      // their allowance gets no further oracle, however weak.
      getLogger().error(
        {
          path: req.nextUrl.pathname,
          ip: auditIpForClient(client),
          event: 'internal_api:locked_out',
        },
        'Internal API access refused: too many failed attempts from this client',
      );
      return forbidden();
    }

    const keys = acceptedKeys();
    const presented = req.headers.get('x-internal-key') ?? '';

    // An unconfigured deployment accepts nothing. Checked as a separate step
    // so the empty-key case never reaches the comparison.
    const { matched, matchedIndex } =
      keys.length === 0
        ? { matched: false, matchedIndex: -1 }
        : await verifyAgainstKeys(presented, keys);

    if (!matched) {
      await recordFailedAuthAttempt(clientKey);
      getLogger().error(
        {
          path: req.nextUrl.pathname,
          // SEC-43: `null` when the client cannot be identified, rather than
          // a raw unvalidated header or the string 'unknown' -- both of which
          // read as facts in a security log.
          ip: auditIpForClient(client),
          event: 'internal_api:rejected',
          configured: keys.length > 0,
          // Surfaces a counter outage in the same line as the rejection, so
          // "unmetered guessing was possible here" is visible in the log
          // rather than inferred from its absence.
          ...(degraded ? { limiterDegraded: true } : {}),
        },
        'Unauthorized Internal API Access Attempt',
      );
      return forbidden();
    }

    await clearFailedAuthAttempts(clientKey);

    if (matchedIndex > 0) {
      // The rotation is half-done: something is still presenting the old key.
      // Worth a warning, because the usual failure mode of a rotation is that
      // the previous key is never actually retired.
      getLogger().warn(
        {
          path: req.nextUrl.pathname,
          event: 'internal_api:previous_key_used',
        },
        'Internal API authenticated with INTERNAL_API_KEY_PREVIOUS; a caller has not yet moved to the current key',
      );
    }

    return handler(req, ctx);
  };
}
