import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

const mocks = vi.hoisted(() => ({
  connection: vi.fn().mockResolvedValue(undefined),
  getIP: vi.fn().mockResolvedValue('203.0.113.1'),
  nextAuthHandler: vi.fn(),
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
  });

  // The local rate-limit fallback keeps its bucket in a module-level Map
  // (not reset between tests) -- every test below uses its own unique IP so
  // tests can't pollute each other's counters, matching the convention in
  // rate-limit-local.test.ts.

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
});
