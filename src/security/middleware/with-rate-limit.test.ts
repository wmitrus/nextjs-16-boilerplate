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
  mockGetIP,
  mockCheckRateLimit,
  resetAllInfrastructureMocks,
} from '@/testing';

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
    mockGetIP.mockResolvedValue('127.0.0.1');
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

  it('should block request if rate limit exceeded', async () => {
    mockGetIP.mockResolvedValue('127.0.0.1');
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
