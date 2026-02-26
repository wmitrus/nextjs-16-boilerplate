import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { vi } from 'vitest';

import type { RouteContext } from './route-classification';

export const mockWithAuth = vi.fn<
  (req: NextRequest, ctx: RouteContext) => Promise<NextResponse | null>
>((_req, _ctx) => Promise.resolve(null));

export function resetWithAuthMocks() {
  mockWithAuth.mockReset();
  mockWithAuth.mockResolvedValue(null);
}

vi.mock('./with-auth', () => ({
  withAuth: (req: NextRequest, ctx: RouteContext) => mockWithAuth(req, ctx),
}));
