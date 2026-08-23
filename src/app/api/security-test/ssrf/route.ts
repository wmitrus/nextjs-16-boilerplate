import type { NextRequest } from 'next/server';

import { resolveServerLogger } from '@/core/logger/di';

import {
  createServerErrorResponse,
  createSuccessResponse,
} from '@/shared/lib/api/response-service';

import { secureFetch } from '@/security/outbound/secure-fetch';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'security-test',
  module: 'ssrf-route',
});

/**
 * Test endpoint for SSRF demonstration.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return createServerErrorResponse(
      'URL parameter is required',
      400,
      'MISSING_URL',
    );
  }

  try {
    logger.debug({ url }, 'Testing SSRF Outbound Fetch');
    const response = await secureFetch(url);
    // We don't return the full body for safety in a demo
    return createSuccessResponse({
      upstreamStatus: response.status,
      statusText: response.statusText,
      message: 'Host is allowed and reachable',
    });
  } catch (err) {
    logger.error({ url, error: err }, 'SSRF Test Failed');
    return createServerErrorResponse(
      err instanceof Error ? err.message : 'Secure fetch failed',
      400,
      'SECURE_FETCH_BLOCKED',
    );
  }
}
