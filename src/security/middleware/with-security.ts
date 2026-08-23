import { type NextRequest, NextResponse } from 'next/server';

import { resolveEdgeLogger } from '@/core/logger/di-edge';

import { createServerErrorResponse } from '@/shared/lib/api/response-service';
import { recordCorrelationRejection } from '@/shared/lib/observability/correlation-id';

import {
  classifyRequest,
  type RouteContext,
} from '@/security/middleware/route-classification';
import { withHeaders } from '@/security/middleware/with-headers';

let _logger:
  | ReturnType<ReturnType<typeof resolveEdgeLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveEdgeLogger().child({
    type: 'Security',
    category: 'middleware',
    module: 'with-security',
  });
  return _logger;
}

/**
 * Main security middleware pipeline entry point.
 * Executes security guards in sequence via composition.
 *
 * This function is provider-agnostic and does not wrap framework-specific auth middleware.
 * Framework adapters (e.g. Clerk) should be applied at the proxy boundary.
 */
export function withSecurity(
  handler: (
    req: NextRequest,
    ctx: RouteContext,
  ) => Promise<NextResponse> = async () => NextResponse.next(),
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const ctx = classifyRequest(request);
    getLogger().debug(
      { path: request.nextUrl.pathname, correlationId: ctx.correlationId },
      'Security Middleware Processing',
    );

    if (ctx.correlationRejection) {
      // Sampled, not one line per rejection: the header is caller-controlled,
      // so an unconditional WARN is a log-flooding primitive. Reason and
      // length only -- the refused value itself is never copied into a log
      // (SEC-46).
      const { report, total } = recordCorrelationRejection();
      if (report) {
        getLogger().warn(
          {
            event: 'correlation_id:rejected',
            reason: ctx.correlationRejection,
            receivedLength: ctx.correlationRejectedLength,
            rejectedTotal: total,
            correlationId: ctx.correlationId,
          },
          'Rejected an inbound correlation id',
        );
      }
    }

    // Skip security logic for static files to optimize performance
    if (ctx.isStaticFile) {
      const response = NextResponse.next();
      response.headers.set('x-correlation-id', ctx.correlationId);
      response.headers.set('x-request-id', ctx.requestId);
      return response;
    }

    // Execute the composed middleware pipeline.
    //
    // The boundary sits HERE, not at the proxy's outer catch, because this is
    // the last place that still holds the RouteContext. A catch further out
    // has no `ctx`, so it either ships a 500 with no correlation id at all or
    // invents a second one that matches nothing in the logs -- and it has to
    // re-implement the header finalization below, which is exactly the
    // duplication that lets the two paths drift apart. See SEC-45.
    let response: NextResponse;

    try {
      response = await handler(request, ctx);
    } catch (error) {
      // Structured edge log, not console.error: the correlation id the caller
      // gets back in `x-correlation-id` is the same one written here, so an
      // operator can join a user's report to this record.
      getLogger().error(
        {
          event: 'security:pipeline_error',
          path: request.nextUrl.pathname,
          correlationId: ctx.correlationId,
          requestId: ctx.requestId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Security pipeline threw',
      );

      // Always generic, in every environment. This boundary runs before any
      // authorization has happened, so the throw can come from any library in
      // the chain and carry file paths, table names or key prefixes with it.
      // The detail is in the log above, reachable by correlation id.
      response = createServerErrorResponse(
        'Internal Server Error',
        500,
        'SERVER_ERROR',
      );
    }

    // Apply Security Headers & Metadata -- one path for every response,
    // thrown or returned.
    response = withHeaders(request, response, ctx.nonce);
    response.headers.set('x-correlation-id', ctx.correlationId);
    response.headers.set('x-request-id', ctx.requestId);

    return response;
  };
}
