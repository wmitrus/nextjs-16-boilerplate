import { NextResponse } from 'next/server';

import { env } from '@/core/env';
import { getBrowserSnippetSafe } from '@/core/observability/new-relic';

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
  if (!env.NEW_RELIC_ENABLED) {
    return createEmptyScriptResponse();
  }

  const snippet = getBrowserSnippetSafe();
  if (!snippet) {
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
