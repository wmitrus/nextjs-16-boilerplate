/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';
import '@/shared/lib/network/get-ip.mock';
import '@/shared/lib/rate-limit/rate-limit-helper.mock';

import { NextResponse } from 'next/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createMockRouteContext } from './route-classification.mock';
import { withRateLimit } from './with-rate-limit';

import {
  createMockRequest,
  mockGetClientIp,
  mockCheckRateLimit,
  resetAllInfrastructureMocks,
} from '@/testing';
import { mockEnv } from '@/testing/infrastructure/env';

describe('Rate Limit Middleware', () => {
  const mockHandler = vi
    .fn()
    .mockImplementation(async () => NextResponse.next());

  beforeEach(() => {
    resetAllInfrastructureMocks();
    mockHandler.mockClear();
  });

  it('should call next handler if not an api route', async () => {
    const req = createMockRequest({ path: '/' });
    const ctx = createMockRouteContext({ isApi: false });

    const middleware = withRateLimit(mockHandler);
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('should call next handler if it is a webhook', async () => {
    const req = createMockRequest({ path: '/api/webhooks' });
    const ctx = createMockRouteContext({ isApi: true, isWebhook: true });

    const middleware = withRateLimit(mockHandler);
    await middleware(req, ctx);

    expect(mockHandler).toHaveBeenCalled();
  });

  it('should allow request if within rate limit', async () => {
    mockGetClientIp.mockResolvedValue({ kind: 'trusted', ip: '127.0.0.1' });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(),
    });

    const req = createMockRequest({ path: '/api/data' });
    const ctx = createMockRouteContext({ isApi: true });

    const middleware = withRateLimit(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('99');
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should rate-limit /api/logs requests and pass path in meta for loop prevention', async () => {
    mockGetClientIp.mockResolvedValue({ kind: 'trusted', ip: '127.0.0.1' });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(),
    });

    const req = createMockRequest({ path: '/api/logs' });
    const ctx = createMockRouteContext({ isApi: true });

    const middleware = withRateLimit(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(mockGetClientIp).toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalledWith('api:127.0.0.1', {
      path: '/api/logs',
    });
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should pass path in meta so the WARN context can trigger loop prevention', async () => {
    mockGetClientIp.mockResolvedValue({ kind: 'trusted', ip: '10.0.0.1' });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(),
    });

    const req = createMockRequest({ path: '/api/data' });
    const ctx = createMockRouteContext({ isApi: true });

    const middleware = withRateLimit(mockHandler);
    await middleware(req, ctx);

    expect(mockCheckRateLimit).toHaveBeenCalledWith('api:10.0.0.1', {
      path: '/api/data',
    });
  });

  it('should bypass rate limiting for approved E2E probe routes when E2E is enabled', async () => {
    mockEnv.E2E_ENABLED = true;

    const req = createMockRequest({ path: '/api/users' });
    const ctx = createMockRouteContext({ isApi: true });

    const middleware = withRateLimit(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(mockGetClientIp).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockHandler).toHaveBeenCalled();
  });

  it.each([
    '/api/auth/callback/credentials',
    '/api/auth/csrf',
    '/api/auth/providers',
    '/api/auth/session',
    '/api/auth/signout',
  ])(
    'should bypass the global API rate limit for AuthJS protocol route %s',
    async (path) => {
      mockEnv.AUTH_PROVIDER = 'authjs';

      const req = createMockRequest({ path });
      const ctx = createMockRouteContext({ isApi: true });

      const middleware = withRateLimit(mockHandler);
      const res = await middleware(req, ctx);

      expect(res.status).toBe(200);
      expect(mockGetClientIp).not.toHaveBeenCalled();
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalled();
    },
  );

  it('should still rate limit custom AuthJS auth API routes', async () => {
    mockEnv.AUTH_PROVIDER = 'authjs';
    mockGetClientIp.mockResolvedValue({ kind: 'trusted', ip: '127.0.0.1' });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(),
    });

    const req = createMockRequest({ path: '/api/auth/signup' });
    const ctx = createMockRouteContext({ isApi: true });

    const middleware = withRateLimit(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(mockGetClientIp).toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalledWith('api:127.0.0.1', {
      path: '/api/auth/signup',
    });
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should still rate limit unrelated API routes in E2E mode', async () => {
    mockEnv.E2E_ENABLED = true;
    mockGetClientIp.mockResolvedValue({ kind: 'trusted', ip: '127.0.0.1' });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(),
    });

    const req = createMockRequest({ path: '/api/data' });
    const ctx = createMockRouteContext({ isApi: true });

    const middleware = withRateLimit(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(200);
    expect(mockGetClientIp).toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalled();
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should block request if rate limit exceeded', async () => {
    mockGetClientIp.mockResolvedValue({ kind: 'trusted', ip: '127.0.0.1' });
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60000),
    });

    const req = createMockRequest({ path: '/api/data' });
    const ctx = createMockRouteContext({ isApi: true });

    const middleware = withRateLimit(mockHandler);
    const res = await middleware(req, ctx);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
