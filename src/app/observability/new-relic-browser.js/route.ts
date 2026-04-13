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

function createScriptResponse(body: string): NextResponse {
  return new NextResponse(body, {
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

    const logLine = `[NR Browser] Empty script loaded=${diag.agentLoaded} connected=${diag.agentConnected} tx=${diag.hasActiveTransaction} appId=${diag.hasApplicationId}`;

    if (env.VERCEL_ENV) {
      console.info(logLine);
    } else {
      console.warn(logLine);
    }

    return createEmptyScriptResponse();
  }

  return createScriptResponse(snippet);
}
