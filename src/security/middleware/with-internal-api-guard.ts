import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';

import { env } from '@/core/env';
import { resolveEdgeLogger } from '@/core/logger/di-edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import { auditIpForClient, getClientIp } from '@/shared/lib/network/get-ip';

import type { RouteContext } from './route-classification';

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
 * Protects internal-only API routes.
 */
export function withInternalApiGuard(
  handler: (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: RouteContext): Promise<NextResponse> => {
    if (!ctx.isInternalApi) {
      return handler(req, ctx);
    }

    const internalKey = req.headers.get('x-internal-key');

    if (!env.INTERNAL_API_KEY || internalKey !== env.INTERNAL_API_KEY) {
      getLogger().error(
        {
          path: req.nextUrl.pathname,
          // SEC-43: `null` when the client cannot be identified, rather than
          // a raw unvalidated header or the string 'unknown' -- both of which
          // read as facts in a security log.
          ip: auditIpForClient(await getClientIp(req.headers)),
        },
        'Unauthorized Internal API Access Attempt',
      );
      return createServerErrorResponse(
        'Forbidden: Internal Access Only',
        403,
        'FORBIDDEN',
      );
    }

    return handler(req, ctx);
  };
}
