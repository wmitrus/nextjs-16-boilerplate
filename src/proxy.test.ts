import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { logger } from '@/core/logger/server';

import * as getIp from '@/shared/lib/network/get-ip';
import * as rateLimitHelper from '@/shared/lib/rate-limit/rate-limit-helper';

import { proxy } from './proxy';

vi.mock('@/core/logger/server', () => ({
  logger: {
    warn: vi.fn(),
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

    const response = await proxy(request);

    expect(response).toBeDefined();
    expect(response?.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response?.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(response?.headers.get('x-correlation-id')).toBeDefined();
    expect(logger.warn).not.toHaveBeenCalled();
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

    const response = await proxy(request);

    expect(response).toBeDefined();
    expect(response?.status).toBe(429);
    const body = await response?.json();
    expect(body).toEqual({
      status: 'server_error',
      error: 'Rate limit exceeded. Please try again later.',
      code: 'RATE_LIMITED',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '127.0.0.1',
        path: '/api/users',
        limit: 10,
        reset,
      }),
      'Rate limit exceeded',
    );
  });

  it('should ignore non-api routes', async () => {
    const request = new NextRequest(new URL('http://localhost/about'));
    await proxy(request);

    expect(rateLimitHelper.checkRateLimit).not.toHaveBeenCalled();
  });
});
