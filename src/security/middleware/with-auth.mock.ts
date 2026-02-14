import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { vi } from 'vitest';

import type { RouteContext } from './route-classification';

export const mockWithAuth = vi.fn<
  (
    auth: ClerkMiddlewareAuth,
    req: NextRequest,
    ctx: RouteContext,
  ) => Promise<NextResponse | null>
>((_auth, _req, _ctx) => Promise.resolve(null));

export function resetWithAuthMocks() {
  mockWithAuth.mockReset();
  mockWithAuth.mockResolvedValue(null);
}

vi.mock('./with-auth', () => ({
  withAuth: (auth: ClerkMiddlewareAuth, req: NextRequest, ctx: RouteContext) =>
    mockWithAuth(auth, req, ctx),
}));
