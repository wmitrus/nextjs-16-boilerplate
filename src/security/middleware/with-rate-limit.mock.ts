import type { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

import type { RouteContext } from './route-classification';

export const mockWithRateLimit = vi.fn<
  (
    req: NextRequest,
    res: NextResponse,
    ctx: RouteContext,
    correlationId: string,
  ) => Promise<NextResponse | null>
>((_req, _res, _ctx, _correlationId) => Promise.resolve(null));

export function resetWithRateLimitMocks() {
  mockWithRateLimit.mockReset();
  mockWithRateLimit.mockResolvedValue(null);
}

vi.mock('./with-rate-limit', () => ({
  withRateLimit: (
    req: NextRequest,
    res: NextResponse,
    ctx: RouteContext,
    correlationId: string,
  ) => mockWithRateLimit(req, res, ctx, correlationId),
}));
