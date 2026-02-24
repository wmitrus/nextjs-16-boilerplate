/** @vitest-environment node */
import '@/security/middleware/with-headers.mock';
import '@/testing/infrastructure/clerk';
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';
import '@/testing/infrastructure/env';

import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { withSecurity } from './with-security';

import {
  createMockRequest,
  createMockRouteContext,
  mockClassifyRequest,
  mockClerkMiddleware,
  mockWithAuth,
  mockWithHeaders,
  mockWithInternalApiGuard,
  mockWithRateLimit,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Security Pipeline', () => {
  const createMockAuth = () => {
    const authFn = vi.fn().mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { metadata: { role: 'user', onboardingComplete: true } },
    });
    const protect = vi.fn().mockResolvedValue(undefined);

    return Object.assign(authFn, { protect }) as unknown as ClerkMiddlewareAuth;
  };

  beforeEach(() => {
    resetAllInfrastructureMocks();
    vi.clearAllMocks();

    // Setup default mock behaviors
    mockClerkMiddleware.mockImplementation((cb) => {
      return async (auth: ClerkMiddlewareAuth, req: NextRequest) => {
        return cb(auth, req);
      };
    });
    mockWithHeaders.mockImplementation((_req, res) => res);
    mockWithInternalApiGuard.mockReturnValue(null);
    mockWithAuth.mockResolvedValue(null);
    mockWithRateLimit.mockResolvedValue(null);
  });

  it('should skip logic for static files', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({ isStaticFile: true }),
    );

    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;
    const req = createMockRequest({ path: '/logo.png' });
    const res = await pipeline(createMockAuth(), req);

    expect(res?.status).toBe(200);
    expect(mockWithAuth).not.toHaveBeenCalled();
  });

  it('should short-circuit if internal guard fails', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({ isStaticFile: false }),
    );
    mockWithInternalApiGuard.mockReturnValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;
    const req = createMockRequest({ path: '/api/internal/test' });
    const res = await pipeline(createMockAuth(), req);

    expect(res?.status).toBe(403);
    expect(mockWithAuth).not.toHaveBeenCalled();
  });

  it('should call auth.protect() for private routes', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({
        isStaticFile: false,
        isPublicRoute: false,
        isInternalApi: false,
      }),
    );

    const auth = createMockAuth();
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;
    const req = createMockRequest({ path: '/dashboard' });
    await pipeline(auth, req);

    expect(auth.protect).toHaveBeenCalled();
  });

  it('should apply headers and correlation id', async () => {
    mockClassifyRequest.mockReturnValue(
      createMockRouteContext({
        isStaticFile: false,
        isPublicRoute: true,
      }),
    );

    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;
    const req = createMockRequest({ path: '/' });
    const res = await pipeline(createMockAuth(), req);

    expect(mockWithHeaders).toHaveBeenCalled();
    expect(res?.headers.get('x-correlation-id')).toBeDefined();
  });
});
