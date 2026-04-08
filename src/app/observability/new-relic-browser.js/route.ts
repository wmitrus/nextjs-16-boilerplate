import { connection } from 'next/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';
import {
  getBrowserAgentScriptSafe,
  getNrBrowserDiagnostics,
} from '@/core/observability/new-relic';

function createEmptyScriptResponse(): NextResponse {
  return new NextResponse('', {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(): Promise<Response> {
  await connection();

  if (!env.NEW_RELIC_ENABLED || !env.NEW_RELIC_LICENSE_KEY) {
    return createEmptyScriptResponse();
  }

  const snippet = getBrowserAgentScriptSafe();
  if (!snippet) {
    const diag = getNrBrowserDiagnostics();
    console.warn('[NR Browser] Returning empty browser script.', diag);
    return createEmptyScriptResponse();
  }

  return new NextResponse(snippet, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
