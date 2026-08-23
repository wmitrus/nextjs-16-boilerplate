import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  getIP: vi.fn().mockResolvedValue('203.0.113.1'),
  nextAuthHandler: vi.fn(),
  checkStrictRateLimit: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual, connection: mocks.connection };
});

vi.mock('@/shared/lib/network/get-ip', () => ({
  getIP: mocks.getIP,
}));

vi.mock('next-auth/next', () => ({
  default: mocks.nextAuthHandler,
}));

vi.mock('@/modules/auth/infrastructure/authjs/auth', () => ({
  authOptions: {},
}));

/**
 * SEC-42. This endpoint's IP bucket is now strict: durable secondary, then
 * fail closed, instead of the old fall-back-to-a-process-local-Map. The
 * limiter itself is stubbed here and its own behaviour asserted in
 * `rate-limit-helper.test.ts` -- what this file is responsible for is that
 * the route asks with the right key and window, and turns a refusal into a
 * 429 without ever reaching NextAuth.
 */
vi.mock('@/security/api/strict-rate-limit', () => ({
  checkStrictRateLimit: mocks.checkStrictRateLimit,
}));

/** A counting stub standing in for one shared, durable window. */
function stubLimiterAllowing(limit: number) {
  const counts = new Map<string, number>();
  mocks.checkStrictRateLimit.mockImplementation(async (identifier: string) => {
    const next = (counts.get(identifier) ?? 0) + 1;
    counts.set(identifier, next);
    return {
      success: next <= limit,
      limit,
      remaining: Math.max(0, limit - next),
      reset: new Date(Date.now() + 60_000),
    };
  });
}

function makeRequest(path: string, method: string) {
  return new NextRequest(`http://localhost${path}`, { method });
}

function makeContext(nextauth: string[]) {
  return { params: Promise.resolve({ nextauth }) };
}

describe('/api/auth/[...nextauth] -- Credentials sign-in IP rate limit', () => {
  beforeEach(() => {
    resetEnvMocks();
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getIP.mockResolvedValue('203.0.113.1');
    mocks.nextAuthHandler.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    mockEnv.LOGIN_RATE_LIMIT_IP_REQUESTS = 3;
    mockEnv.LOGIN_RATE_LIMIT_IP_WINDOW = '15 m';
    stubLimiterAllowing(3);
  });

  it('delegates non-credentials-callback requests straight to NextAuth, no IP check', async () => {
    mocks.getIP.mockResolvedValue('203.0.113.10');
    const { GET } = await import('./route');
    const res = await GET(
      makeRequest('/api/auth/session', 'GET'),
      makeContext(['session']),
    );

    expect(res.status).toBe(200);
    expect(mocks.nextAuthHandler).toHaveBeenCalledTimes(1);
  });

  it('allows the request through when under the IP limit', async () => {
    mocks.getIP.mockResolvedValue('203.0.113.11');
    const { POST } = await import('./route');
    const res = await POST(
      makeRequest('/api/auth/callback/credentials', 'POST'),
      makeContext(['callback', 'credentials']),
    );

    expect(res.status).toBe(200);
    expect(mocks.nextAuthHandler).toHaveBeenCalledTimes(1);
    // Strict mode, the endpoint's own window -- not the generic API one.
    expect(mocks.checkStrictRateLimit).toHaveBeenCalledWith(
      'login-ip:203.0.113.11',
      expect.objectContaining({ limit: 3, windowMs: 15 * 60 * 1000 }),
    );
  });

  it('returns 429 once the per-IP limit is exceeded, without reaching NextAuth', async () => {
    mocks.getIP.mockResolvedValue('203.0.113.12');
    const { POST } = await import('./route');
    const req = () =>
      POST(
        makeRequest('/api/auth/callback/credentials', 'POST'),
        makeContext(['callback', 'credentials']),
      );

    await req();
    await req();
    await req();
    const blocked = await req();

    expect(blocked.status).toBe(429);
    // 3 allowed calls reached NextAuth; the 4th did not.
    expect(mocks.nextAuthHandler).toHaveBeenCalledTimes(3);
  });

  it('bypasses the IP limit entirely under E2E_ENABLED', async () => {
    mocks.getIP.mockResolvedValue('203.0.113.13');
    mockEnv.E2E_ENABLED = true;
    mockEnv.LOGIN_RATE_LIMIT_IP_REQUESTS = 1;
    stubLimiterAllowing(1);

    const { POST } = await import('./route');
    const req = () =>
      POST(
        makeRequest('/api/auth/callback/credentials', 'POST'),
        makeContext(['callback', 'credentials']),
      );

    await req();
    const secondAttempt = await req();

    expect(secondAttempt.status).toBe(200);
    expect(mocks.nextAuthHandler).toHaveBeenCalledTimes(2);
    // The bypass is a genuine skip, not a generous limit: the limiter is
    // never consulted, so it cannot fail closed during an E2E run either.
    expect(mocks.checkStrictRateLimit).not.toHaveBeenCalled();
  });

  it('rate-limits per IP independently -- a different IP is unaffected', async () => {
    mocks.getIP.mockResolvedValue('203.0.113.14');
    const { POST } = await import('./route');
    const req = () =>
      POST(
        makeRequest('/api/auth/callback/credentials', 'POST'),
        makeContext(['callback', 'credentials']),
      );

    await req();
    await req();
    await req();
    // This IP is now at its limit.
    expect((await req()).status).toBe(429);

    mocks.getIP.mockResolvedValue('198.51.100.7');
    const otherIpResult = await req();
    expect(otherIpResult.status).toBe(200);
  });

  it('refuses the sign-in when strict mode fails closed', async () => {
    // The behaviour change this case is for: with no durable store reachable,
    // strict mode refuses rather than handing out a fresh per-instance
    // allowance. The route must surface that as a 429 and keep NextAuth out
    // of it.
    mocks.getIP.mockResolvedValue('203.0.113.20');
    mocks.checkStrictRateLimit.mockResolvedValue({
      success: false,
      limit: 3,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

    const { POST } = await import('./route');
    const res = await POST(
      makeRequest('/api/auth/callback/credentials', 'POST'),
      makeContext(['callback', 'credentials']),
    );

    expect(res.status).toBe(429);
    expect(mocks.nextAuthHandler).not.toHaveBeenCalled();
  });
});
