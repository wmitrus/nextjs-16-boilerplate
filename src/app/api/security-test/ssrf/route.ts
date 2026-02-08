import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { logger } from '@/core/logger/server';

import { secureFetch } from '@/security/outbound/secure-fetch';

/**
 * Test endpoint for SSRF demonstration.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 },
    );
  }

  try {
    logger.info({ url }, 'Testing SSRF Outbound Fetch');
    const response = await secureFetch(url);
    // We don't return the full body for safety in a demo
    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      message: 'Host is allowed and reachable',
    });
  } catch (err) {
    logger.error({ url, error: err }, 'SSRF Test Failed');
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Secure fetch failed',
      },
      { status: 400 },
    );
  }
}
