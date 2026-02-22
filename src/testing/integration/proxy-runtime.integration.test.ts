/** @vitest-environment node */
import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as getIp from '@/shared/lib/network/get-ip';
import * as rateLimitHelper from '@/shared/lib/rate-limit/rate-limit-helper';

import proxy from '@/proxy';

const mockProtect = vi.fn();
const mockAuthResult = {
  userId: null as string | null,
  sessionClaims: null as Record<string, unknown> | null,
};

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: vi.fn(
    (handler) => (req: NextRequest, evt: NextFetchEvent) => {
      const auth = Object.assign(async () => mockAuthResult, {
        protect: mockProtect,
      });

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
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: vi.fn(async () => ({
        publicMetadata: { onboardingComplete: true },
      })),
    },
  })),
}));

vi.mock('@/core/env', () => ({
  env: {
    NODE_ENV: 'test',
    VERCEL_ENV: 'test',
    INTERNAL_API_KEY: 'test-key',
    E2E_ENABLED: false,
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

describe('Proxy Runtime Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProtect.mockReset();
    mockAuthResult.userId = null;
    mockAuthResult.sessionClaims = null;

    vi.mocked(getIp.getIP).mockResolvedValue('127.0.0.1');
    vi.mocked(rateLimitHelper.checkRateLimit).mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('denies internal API without key', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/internal/health'),
    );

    const response = await proxy(request, {} as unknown as NextFetchEvent);

    expect(response).toBeDefined();
    expect(response!.status).toBe(403);
    const body = await response!.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(mockProtect).not.toHaveBeenCalled();
  });

  it('denies internal API with wrong key', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/internal/health'),
      {
        headers: {
          'x-internal-key': 'wrong-key',
        },
      },
    );

    const response = await proxy(request, {} as unknown as NextFetchEvent);

    expect(response).toBeDefined();
    expect(response!.status).toBe(403);
    const body = await response!.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('allows internal API with valid key', async () => {
    const request = new NextRequest(
      new URL('http://localhost/api/internal/health'),
      {
        headers: {
          'x-internal-key': 'test-key',
        },
      },
    );

    const response = await proxy(request, {} as unknown as NextFetchEvent);

    expect(response).toBeDefined();
    expect(response!.status).toBe(200);
    expect(response!.headers.get('x-correlation-id')).toBeTruthy();
    expect(response!.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(rateLimitHelper.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mockProtect).not.toHaveBeenCalled();
  });

  it('protects non-public non-internal routes', async () => {
    const request = new NextRequest(new URL('http://localhost/dashboard'));

    await proxy(request, {} as unknown as NextFetchEvent);

    expect(mockProtect).toHaveBeenCalledTimes(1);
  });
});
