import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as getIp from '@/shared/lib/network/get-ip';
import * as rateLimitHelper from '@/shared/lib/rate-limit/rate-limit-helper';

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
  createRouteMatcher: vi.fn(() => vi.fn(() => true)),
}));

vi.mock('@/core/env', () => ({
  env: {
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
}));
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
}));

vi.mock('@/shared/lib/rate-limit/rate-limit-helper', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/shared/lib/network/get-ip', () => ({
  getIP: vi.fn(),
}));

describe('Proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow request if rate limit is not exceeded', async () => {
    const request = new NextRequest(new URL('http://localhost/api/users'));
    vi.mocked(getIp.getIP).mockResolvedValue('127.0.0.1');
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
    vi.mocked(getIp.getIP).mockResolvedValue('127.0.0.1');
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

  it('should ignore non-api routes', async () => {
    const request = new NextRequest(new URL('http://localhost/about'));
    await proxy(request, {} as unknown as NextFetchEvent);

    expect(rateLimitHelper.checkRateLimit).not.toHaveBeenCalled();
  });
});
