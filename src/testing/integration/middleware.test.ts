/** @vitest-environment node */
import type { ClerkMiddlewareAuth } from '@clerk/nextjs/server';
import type { NextRequest, NextResponse } from 'next/server';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Import real implementations
import { withSecurity } from '@/security/middleware/with-security';
import { createMockRequest } from '@/testing/factories/request';
// Import infrastructure FIRST to ensure it's available for vi.mock
import {
  mockAuth,
  mockClerkClient,
  mockClerkMiddleware,
  resetClerkMocks,
} from '@/testing/infrastructure/clerk';
import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';
import {
  mockChildLogger,
  resetLoggerMocks,
} from '@/testing/infrastructure/logger';
import { resetNextHeadersMocks } from '@/testing/infrastructure/next-headers';

// Explicitly mock clerk BEFORE any other imports that might use it
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (
    cb: (auth: ClerkMiddlewareAuth, req: NextRequest) => Promise<NextResponse>,
  ) => mockClerkMiddleware(cb),
  auth: () => mockAuth(),
  clerkClient: () => mockClerkClient(),
}));

describe('Middleware Integration', () => {
  const createMockAuth = (role = 'user') => {
    const authFn = vi.fn().mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { metadata: { role, onboardingComplete: true } },
    });
    const protect = vi.fn().mockResolvedValue(undefined);

    return Object.assign(authFn, { protect }) as unknown as ClerkMiddlewareAuth;
  };

  beforeEach(() => {
    resetClerkMocks();
    resetLoggerMocks();
    resetEnvMocks();
    resetNextHeadersMocks();
    vi.clearAllMocks();

    // Setup base environment for security
    mockEnv.INTERNAL_API_KEY = 'test_secret';
    mockEnv.API_RATE_LIMIT_REQUESTS = 100;
    mockEnv.API_RATE_LIMIT_WINDOW = '60 s';
    mockEnv.NODE_ENV = 'production';
  });

  it('should process a public route successfully with security headers', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/' });
    const res = await pipeline(createMockAuth(), req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-correlation-id')).toBeDefined();
    expect(res.headers.get('Content-Security-Policy')).toBeDefined();
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('should block unauthenticated access to private routes', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    // /dashboard is not in public routes (usually)
    const req = createMockRequest({ path: '/dashboard' });
    const auth = createMockAuth();

    await pipeline(auth, req);

    // withSecurity calls auth.protect() for private routes
    expect(auth.protect).toHaveBeenCalled();
  });

  it('should block external access to internal APIs', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/api/internal/test' });
    const res = await pipeline(createMockAuth(), req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');

    // Verify internal api guard audit log
    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/internal/test',
      }),
      expect.stringContaining('Unauthorized Internal API Access Attempt'),
    );
  });

  it('should allow internal access to internal APIs with secret', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({
      path: '/api/internal/test',
      headers: { 'x-internal-key': 'test_secret' },
    });
    const res = await pipeline(createMockAuth(), req);

    // It should pass through internal guard and auth
    expect(res.status).toBe(200);
  });

  it('should apply rate limiting headers to API routes', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/api/test' });
    const res = await pipeline(createMockAuth(), req);

    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });

  it('should return 429 when rate limit is exceeded', async () => {
    mockEnv.API_RATE_LIMIT_REQUESTS = 0; // Force immediate rate limit

    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/api/test' });
    const res = await pipeline(createMockAuth(), req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');

    // Verify rate limit audit log
    expect(mockChildLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SECURITY_AUDIT',
        category: 'rate-limit',
      }),
      expect.stringContaining('Rate Limit Exceeded'),
    );
  });

  it('should propagate correlation-id from request to response', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const correlationId = 'test-correlation-id';
    const req = createMockRequest({
      path: '/',
      headers: { 'x-correlation-id': correlationId },
    });
    const res = await pipeline(createMockAuth(), req);

    expect(res.headers.get('x-correlation-id')).toBe(correlationId);
  });

  it('should redirect authenticated users away from auth routes to home', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/sign-in' });
    const auth = createMockAuth();
    // mockAuth is used inside withAuth
    mockAuth.mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { metadata: { onboardingComplete: true } },
    });

    const res = await pipeline(auth, req);

    expect(res.status).toBe(307); // NextResponse.redirect
    expect(res.headers.get('location')).toBe('http://localhost/');
  });

  it('should redirect authenticated users to onboarding if not complete', async () => {
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/dashboard' });
    const auth = Object.assign(
      vi.fn().mockResolvedValue({
        userId: 'user_1',
        sessionClaims: { metadata: { onboardingComplete: false } },
      }),
      { protect: vi.fn() },
    ) as unknown as ClerkMiddlewareAuth;

    // Mock clerkClient().users.getUser for the fallback check
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          publicMetadata: { onboardingComplete: false },
        }),
      },
    });

    const res = await pipeline(auth, req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost/onboarding');
  });

  it('should bypass auth for E2E routes when enabled', async () => {
    mockEnv.E2E_ENABLED = true;
    const pipeline = withSecurity() as unknown as (
      auth: ClerkMiddlewareAuth,
      req: NextRequest,
    ) => Promise<NextResponse>;

    const req = createMockRequest({ path: '/users' });
    const auth = createMockAuth();
    mockAuth.mockResolvedValue({ userId: null, sessionClaims: null });

    const res = await pipeline(auth, req);

    expect(res.status).toBe(200);
    expect(auth.protect).not.toHaveBeenCalled();
  });
});
