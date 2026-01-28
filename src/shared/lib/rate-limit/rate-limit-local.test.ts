import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/env', () => ({
  env: {
    API_RATE_LIMIT_REQUESTS: 10,
    API_RATE_LIMIT_WINDOW: '60 s',
  },
}));

import { localRateLimit } from './rate-limit-local';

describe('localRateLimit', () => {
  const limit = 3;
  const windowMs = 1000; // 1 second

  beforeEach(() => {
    vi.useFakeTimers();
    // Clear the buckets before each test would be ideal, but it's a module-level variable.
    // Since we can't easily clear it without exporting it or adding a reset function,
    // we'll use unique identifiers for each test.
  });

  it('should allow requests within the limit', async () => {
    const id = 'id-1';
    for (let i = 0; i < limit; i++) {
      const result = await localRateLimit(id, limit, windowMs);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(limit - (i + 1));
    }
  });

  it('should block requests exceeding the limit', async () => {
    const id = 'id-2';
    // Fill the bucket
    for (let i = 0; i < limit; i++) {
      await localRateLimit(id, limit, windowMs);
    }

    // Next request should fail
    const result = await localRateLimit(id, limit, windowMs);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after the window has passed', async () => {
    const id = 'id-3';
    const now = Date.now();
    vi.setSystemTime(now);

    // Fill the bucket
    for (let i = 0; i < limit; i++) {
      await localRateLimit(id, limit, windowMs);
    }

    // Advance time past the window
    vi.setSystemTime(now + windowMs + 1);

    // Should be able to make a request again
    const result = await localRateLimit(id, limit, windowMs);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(limit - 1);
  });

  it('should calculate the correct reset time', async () => {
    const id = 'id-4';
    const now = Date.now();
    vi.setSystemTime(now);

    // Make the first request
    await localRateLimit(id, limit, windowMs);

    // Fill the rest of the bucket 100ms later
    vi.setSystemTime(now + 100);
    for (let i = 0; i < limit - 1; i++) {
      await localRateLimit(id, limit, windowMs);
    }

    // Next request should fail with reset time based on the FIRST request
    const result = await localRateLimit(id, limit, windowMs);
    expect(result.success).toBe(false);
    expect(result.reset.getTime()).toBe(now + windowMs);
  });
});
