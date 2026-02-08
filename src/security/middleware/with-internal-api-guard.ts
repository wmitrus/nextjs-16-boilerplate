import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { env } from '@/core/env';

import type { RouteContext } from './route-classification';

/**
 * Protects internal-only API routes.
 */
export function withInternalApiGuard(
  req: NextRequest,
  res: NextResponse,
  ctx: RouteContext,
): NextResponse | null {
  if (!ctx.isInternalApi) return null;

  const internalKey = req.headers.get('x-internal-key');

  if (!env.INTERNAL_API_KEY || internalKey !== env.INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: 'Forbidden: Internal Access Only' },
      { status: 403 },
    );
  }

  return null;
}
