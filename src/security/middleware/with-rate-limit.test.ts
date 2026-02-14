/** @vitest-environment node */
import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';
import '@/shared/lib/network/get-ip.mock';
import '@/shared/lib/rate-limit/rate-limit-helper.mock';

import { NextResponse } from 'next/server';
import { describe, it, expect, beforeEach } from 'vitest';

import { createMockRouteContext } from './route-classification.mock';
import { withRateLimit } from './with-rate-limit';

import {
  createMockRequest,
  mockGetIP,
  mockCheckRateLimit,
  resetAllInfrastructureMocks,
} from '@/testing';

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    resetAllInfrastructureMocks();
  });

  it('should return null if not an api route', async () => {
    const req = createMockRequest({ path: '/' });
    const ctx = createMockRouteContext({ isApi: false });
    const res = await withRateLimit(req, NextResponse.next(), ctx, 'corr_1');
    expect(res).toBeNull();
  });

  it('should return null if it is a webhook', async () => {
    const req = createMockRequest({ path: '/api/webhooks' });
    const ctx = createMockRouteContext({ isApi: true, isWebhook: true });
    const res = await withRateLimit(req, NextResponse.next(), ctx, 'corr_1');
    expect(res).toBeNull();
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
    const response = NextResponse.next();
    const res = await withRateLimit(req, response, ctx, 'corr_1');

    expect(res).toBeNull();
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('99');
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
    const res = await withRateLimit(req, NextResponse.next(), ctx, 'corr_1');

    expect(res?.status).toBe(429);
    expect(res?.headers.get('Retry-After')).toBe('60');
  });
});
