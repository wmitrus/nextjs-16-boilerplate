import type { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

import type { RouteContext } from './route-classification';

export const mockWithInternalApiGuard = vi.fn<
  (
    req: NextRequest,
    res: NextResponse,
    ctx: RouteContext,
  ) => NextResponse | null
>((_req, _res, _ctx) => null);

export function resetWithInternalApiGuardMocks() {
  mockWithInternalApiGuard.mockReset();
  mockWithInternalApiGuard.mockReturnValue(null);
}

vi.mock('./with-internal-api-guard', () => ({
  withInternalApiGuard: (
    req: NextRequest,
    res: NextResponse,
    ctx: RouteContext,
  ) => mockWithInternalApiGuard(req, res, ctx),
}));
