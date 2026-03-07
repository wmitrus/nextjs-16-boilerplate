import { describe, expect, it, vi, beforeEach } from 'vitest';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  slidingWindow: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(function () {
      return {
        limit: mocks.limit,
      };
    }),
    {
      slidingWindow: mocks.slidingWindow,
    },
  ),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

describe('rate-limit', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetEnvMocks();
    mockEnv.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    mockEnv.UPSTASH_REDIS_REST_TOKEN = 'test-token';
    mockEnv.API_RATE_LIMIT_REQUESTS = 10;
    mockEnv.API_RATE_LIMIT_WINDOW = '60 s';
  });

  it('should throw if apiRateLimit is undefined', async () => {
    // Temporary change mocks.env to trigger undefined apiRateLimit
    const originalUrl = mockEnv.UPSTASH_REDIS_REST_URL;
    mockEnv.UPSTASH_REDIS_REST_URL = undefined;

    // We need to re-import the module to pick up the new env state
    const { checkUpstashRateLimit } = await import('./rate-limit');

    await expect(checkUpstashRateLimit('test')).rejects.toThrow(
      'Upstash Rate Limiter is not configured',
    );

    // Restore
    mockEnv.UPSTASH_REDIS_REST_URL = originalUrl;
  });

  it('should call limit and return results when configured', async () => {
    const { checkUpstashRateLimit } = await import('./rate-limit');

    const mockResult = {
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60000,
    };
    mocks.limit.mockResolvedValue(mockResult);

    const result = await checkUpstashRateLimit('test-ip');

    expect(mocks.limit).toHaveBeenCalledWith('test-ip');
    expect(result.success).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    expect(result.reset).toBeInstanceOf(Date);
    expect(result.reset.getTime()).toBe(mockResult.reset);
  });
});
