import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as getIp from '@/shared/lib/network/get-ip';
import * as rateLimitHelper from '@/shared/lib/rate-limit/rate-limit-helper';

vi.unmock('@/security/middleware/with-security');

import proxy from './proxy';

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: vi.fn(
    (handler) => (req: NextRequest, evt: NextFetchEvent) => {
      const auth = Object.assign(
        async () => ({
          userId: null,
          sessionClaims: null,
        }),
        {
          protect: vi.fn(),
        },
      );

      return handler(auth, req, evt);
    },
  ),
  createRouteMatcher: vi.fn((patterns: string[]) => {
    return vi.fn((req: NextRequest) => {
      const pathname = req.nextUrl.pathname;

      return patterns.some((pattern) => {
        const base = pattern.replace('(.*)', '');

        if (base === '/') {
          return pathname === '/';
        }

        return pathname === base || pathname.startsWith(base);
      });
    });
  }),
}));

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };

  return {
    ...actual,
    env: {
      ...actual.env,
      AUTH_PROVIDER: 'clerk',
      NODE_ENV: 'test',
      VERCEL_ENV: 'test',
      INTERNAL_API_KEY: 'test-key',
      SECURITY_ALLOWED_OUTBOUND_HOSTS: '',
      NEXT_PUBLIC_CSP_SCRIPT_EXTRA: '',
      NEXT_PUBLIC_CSP_CONNECT_EXTRA: '',
      NEXT_PUBLIC_CSP_FRAME_EXTRA: '',
      NEXT_PUBLIC_CSP_IMG_EXTRA: '',
      NEXT_PUBLIC_CSP_STYLE_EXTRA: '',
      NEXT_PUBLIC_CSP_FONT_EXTRA: '',
    },
  };
});
vi.mock('@/core/logger/edge', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    })),
  },
  getEdgeLogger: vi.fn(() => ({
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    })),
  })),
}));

vi.mock('@/shared/lib/rate-limit/rate-limit-helper', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/shared/lib/network/get-ip', async (importOriginal) => {
  // Partial: `rateLimitKeyForClient` / `auditIpForClient` stay real, because
  // they encode the policy for an unidentifiable client (SEC-43) and a test
  // that stubs them stops testing that policy.
  const actual = await importOriginal<typeof getIp>();
  return { ...actual, getClientIp: vi.fn() };
});

describe('Proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitHelper.checkRateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60000),
    });
  });

  it('should allow request if rate limit is not exceeded', async () => {
    const request = new NextRequest(new URL('http://localhost/api/users'));
    vi.mocked(getIp.getClientIp).mockResolvedValue({
      kind: 'trusted',
      ip: '127.0.0.1',
    });
    vi.mocked(rateLimitHelper.checkRateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60000),
    });

    const response = await proxy(request, {} as unknown as NextFetchEvent);

    expect(response).toBeDefined();
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response?.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(response?.headers.get('x-correlation-id')).toBeDefined();
  });

  it('should return 429 if rate limit is exceeded', async () => {
    const request = new NextRequest(new URL('http://localhost/api/users'));
    vi.mocked(getIp.getClientIp).mockResolvedValue({
      kind: 'trusted',
      ip: '127.0.0.1',
    });
    const reset = new Date(Date.now() + 60000);
    vi.mocked(rateLimitHelper.checkRateLimit).mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset,
    });

    const response = await proxy(request, {} as unknown as NextFetchEvent);

    expect(response).toBeDefined();
    expect(response?.status).toBe(429);
    const body = await response?.json();
    expect(body).toEqual({
      status: 'server_error',
      error: 'Rate limit exceeded. Please try again later.',
      code: 'RATE_LIMITED',
    });
  });

  describe('thrown pipeline path (SEC-45)', () => {
    // Every other test in this file exercises a response the pipeline
    // *returned* -- 429, 403, happy path. None covered the one path that
    // bypassed response finalization entirely: a middleware that throws.
    const secretish =
      'connect ECONNREFUSED postgres://app:hunter2@10.0.0.4:5432/prod';

    it('answers a thrown middleware with a hardened, generic 500', async () => {
      const request = new NextRequest(new URL('http://localhost/api/users'));
      vi.mocked(getIp.getClientIp).mockResolvedValue({
        kind: 'trusted',
        ip: '127.0.0.1',
      });
      vi.mocked(rateLimitHelper.checkRateLimit).mockRejectedValue(
        new Error(secretish),
      );

      const response = await proxy(request, {} as unknown as NextFetchEvent);

      expect(response?.status).toBe(500);
      await expect(response?.json()).resolves.toEqual({
        status: 'server_error',
        error: 'Internal Server Error',
        code: 'SERVER_ERROR',
      });

      // The point of the case: the failure path goes through the same
      // finalization as every other response.
      expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response?.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response?.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin',
      );
      expect(response?.headers.get('Cross-Origin-Resource-Policy')).toBe(
        'same-origin',
      );
      expect(response?.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(response?.headers.get('x-correlation-id')).toBeTruthy();
      expect(response?.headers.get('x-request-id')).toBeTruthy();
    });

    it('keeps the exception text out of the response body', async () => {
      const request = new NextRequest(new URL('http://localhost/api/users'));
      vi.mocked(getIp.getClientIp).mockResolvedValue({
        kind: 'trusted',
        ip: '127.0.0.1',
      });
      vi.mocked(rateLimitHelper.checkRateLimit).mockRejectedValue(
        new Error(secretish),
      );

      const response = await proxy(request, {} as unknown as NextFetchEvent);
      const body = await response?.text();

      // Not just "the message is absent" -- no fragment of the connection
      // string reaches the caller. The detail belongs in the edge log, joined
      // to this response by the correlation id asserted above.
      expect(body).not.toContain(secretish);
      expect(body).not.toContain('hunter2');
      expect(body).not.toContain('10.0.0.4');
      expect(body).not.toContain('postgres');
    });
  });

  it('should ignore non-api routes', async () => {
    const request = new NextRequest(new URL('http://localhost/about'));
    await proxy(request, {} as unknown as NextFetchEvent);

    expect(rateLimitHelper.checkRateLimit).not.toHaveBeenCalled();
  });

  it('should return 403 for internal API without key', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/internal/health'),
    );

    const response = await proxy(request, {} as unknown as NextFetchEvent);

    expect(response).toBeDefined();
    expect(response?.status).toBe(403);
    const body = await response?.json();
    expect(body).toEqual({
      status: 'server_error',
      error: 'Forbidden: Internal Access Only',
      code: 'FORBIDDEN',
    });
  });

  it('should allow internal API with valid key', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/internal/health'),
      {
        headers: {
          'x-internal-key': 'test-key',
        },
      },
    );
    vi.mocked(getIp.getClientIp).mockResolvedValue({
      kind: 'trusted',
      ip: '127.0.0.1',
    });
    vi.mocked(rateLimitHelper.checkRateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60000),
    });

    const response = await proxy(request, {} as unknown as NextFetchEvent);

    expect(response).toBeDefined();
    expect(response?.status).toBe(200);
  });
});
