import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCookieSet = vi.hoisted(() => vi.fn());
const resolveBootstrapOutcomeMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookieSet,
  }),
}));

vi.mock('../resolve-bootstrap-outcome', () => ({
  resolveBootstrapOutcome: resolveBootstrapOutcomeMock,
}));

vi.mock('@/core/env', async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  return {
    ...actual,
    env: {
      ...actual.env,
      AUTH_PROVIDER: 'authjs',
      NODE_ENV: 'test',
    },
  };
});

vi.mock('@/core/logger/di', () => ({
  resolveServerLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

import { GET } from './route';

const BASE = 'http://localhost:3000';

describe('GET /auth/bootstrap/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /auth/signin when unauthenticated under AuthJS', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({ type: 'unauthenticated' });
    const req = new NextRequest(
      `${BASE}/auth/bootstrap/start?redirect_url=%2Fusers`,
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth/signin');
  });

  it('redirects to /auth/bootstrap?state=org-required when org_required', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({ type: 'org_required' });
    const req = new NextRequest(
      `${BASE}/auth/bootstrap/start?redirect_url=%2Fusers`,
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('/auth/bootstrap');
    expect(loc).toContain('state=org-required');
  });

  it('includes redirect_url in org-required redirect', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({ type: 'org_required' });
    const req = new NextRequest(
      `${BASE}/auth/bootstrap/start?redirect_url=%2Fusers`,
    );
    const res = await GET(req);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('redirect_url');
    expect(loc).toContain('%2Fusers');
  });

  it('does not include redirect_url in org-required redirect when absent', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({ type: 'org_required' });
    const req = new NextRequest(`${BASE}/auth/bootstrap/start`);
    const res = await GET(req);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('state=org-required');
    expect(loc).not.toContain('redirect_url');
  });

  it('redirects to /auth/bootstrap?error=db_error for db_error outcome', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({
      type: 'error',
      error: 'db_error',
    });
    const req = new NextRequest(`${BASE}/auth/bootstrap/start`);
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('/auth/bootstrap');
    expect(loc).toContain('error=db_error');
  });

  it('redirects to /auth/bootstrap?error=cross_provider_linking for that error', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({
      type: 'error',
      error: 'cross_provider_linking',
    });
    const req = new NextRequest(`${BASE}/auth/bootstrap/start`);
    const res = await GET(req);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('error=cross_provider_linking');
  });

  it('sets __onboarding_pending cookie when onboarding_required', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({
      type: 'onboarding_required',
      safeTarget: '/users',
    });
    const req = new NextRequest(
      `${BASE}/auth/bootstrap/start?redirect_url=%2Fusers`,
    );
    await GET(req);
    expect(mockCookieSet).toHaveBeenCalledWith('__onboarding_pending', '1', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  });

  it('redirects to /onboarding with redirect_url when onboarding_required', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({
      type: 'onboarding_required',
      safeTarget: '/users',
    });
    const req = new NextRequest(
      `${BASE}/auth/bootstrap/start?redirect_url=%2Fusers`,
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('/onboarding');
    expect(loc).toContain('redirect_url=%2Fusers');
  });

  it('redirects to safeTarget when ready', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({
      type: 'ready',
      safeTarget: '/users',
    });
    const req = new NextRequest(
      `${BASE}/auth/bootstrap/start?redirect_url=%2Fusers`,
    );
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/users');
  });

  it('redirects to /auth/bootstrap?error=db_error when outcome resolution throws', async () => {
    resolveBootstrapOutcomeMock.mockRejectedValue(
      new Error('unexpected failure'),
    );
    const req = new NextRequest(`${BASE}/auth/bootstrap/start`);
    const res = await GET(req);
    expect(res.status).toBe(307);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('/auth/bootstrap');
    expect(loc).toContain('error=db_error');
  });

  it('falls back to /dashboard when redirect_url is missing and user is ready', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({
      type: 'ready',
      safeTarget: '/dashboard',
    });
    const req = new NextRequest(`${BASE}/auth/bootstrap/start`);
    const res = await GET(req);
    expect(res.headers.get('location')).toContain('/dashboard');
  });

  it('sanitizes external redirect_url to /dashboard', async () => {
    resolveBootstrapOutcomeMock.mockResolvedValue({
      type: 'ready',
      safeTarget: '/dashboard',
    });
    const req = new NextRequest(
      `${BASE}/auth/bootstrap/start?redirect_url=https%3A%2F%2Fevil.example%2Fsteal`,
    );
    const res = await GET(req);
    expect(res.headers.get('location')).toContain('/dashboard');
    expect(res.headers.get('location')).not.toContain('evil.example');
  });
});
