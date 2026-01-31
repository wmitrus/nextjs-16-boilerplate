import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  slidingWindow: vi.fn(),
  env: {
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io' as string | undefined,
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    API_RATE_LIMIT_REQUESTS: 10,
    API_RATE_LIMIT_WINDOW: '60 s',
  },
}));

vi.mock('@/core/env', () => ({
  env: mocks.env,
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
  });

  it('should throw if apiRateLimit is undefined', async () => {
    // Temporary change mocks.env to trigger undefined apiRateLimit
    const originalUrl = mocks.env.UPSTASH_REDIS_REST_URL;
    mocks.env.UPSTASH_REDIS_REST_URL = undefined;

    // We need to re-import the module to pick up the new env state
    const { checkUpstashRateLimit } = await import('./rate-limit');

    await expect(checkUpstashRateLimit('test')).rejects.toThrow(
      'Upstash Rate Limiter is not configured',
    );

    // Restore
    mocks.env.UPSTASH_REDIS_REST_URL = originalUrl;
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
