import { connection } from 'next/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';
import {
  getBrowserAgentScriptSafe,
  getNrBrowserDiagnostics,
} from '@/core/observability/new-relic';
import { getNrBrowserCdnSnippet } from '@/core/observability/new-relic-browser';

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

  if (!env.NEW_RELIC_ENABLED && !env.NEW_RELIC_BROWSER_ENABLED) {
    return createEmptyScriptResponse();
  }

  if (env.NEW_RELIC_BROWSER_ENABLED) {
    const cdnSnippet = getNrBrowserCdnSnippet();
    if (cdnSnippet) {
      return createScriptResponse(cdnSnippet);
    }
  }

  if (env.NEW_RELIC_ENABLED && env.NEW_RELIC_LICENSE_KEY) {
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

  return createEmptyScriptResponse();
}
