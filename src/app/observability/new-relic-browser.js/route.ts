import { NextResponse } from 'next/server';

import { env } from '@/core/env';
import { getBrowserSnippetSafe } from '@/core/observability/new-relic';

export async function GET(): Promise<NextResponse> {
  if (!env.NEW_RELIC_ENABLED) {
    return new NextResponse('', {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  const snippet = getBrowserSnippetSafe();
  if (!snippet) {
    return new NextResponse('', {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  return new NextResponse(snippet, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
