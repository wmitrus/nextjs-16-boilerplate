import { vi } from 'vitest';

import type { CheckRateLimitOptions } from '@/shared/lib/rate-limit/rate-limit-helper';
import type { RateLimitResult } from '@/shared/lib/rate-limit/rate-limit-local';

export const mockCheckRateLimit = vi.fn();

vi.mock('@/shared/lib/rate-limit/rate-limit-helper', () => ({
  checkRateLimit: (ip: string, options?: CheckRateLimitOptions) =>
    mockCheckRateLimit(ip, options),
  // Re-exported because callers import it from this module and a partial
  // mock would make it undefined at the call site rather than fail loudly.
  parseDurationToMs: (duration: string) => {
    const [value, unit] = duration.trim().split(/\s+/);
    const n = parseInt(value!, 10);
    switch (unit?.toLowerCase()) {
      case 'm':
        return n * 60_000;
      case 'h':
        return n * 3_600_000;
      case 'd':
        return n * 86_400_000;
      default:
        return n * 1000;
    }
  },
}));

/**
 * Builds a full `RateLimitResult`. Tests state only what they care about;
 * the rest is filled in, so a test never asserts against a half-built result
 * that the real helper would never return.
 */
export function rateLimitResult(
  overrides: Partial<RateLimitResult> = {},
): RateLimitResult {
  return {
    success: true,
    limit: 10,
    remaining: 9,
    reset: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

/**
 * Stubs the Node-side strict entry point (SEC-42). Route tests that only care
 * about the handler should use this rather than let `checkStrictRateLimit`
 * resolve the real DI container and Drizzle store.
 */
export const mockCheckStrictRateLimit = vi.fn(
  async (): Promise<RateLimitResult> => rateLimitResult(),
);

vi.mock('@/security/api/strict-rate-limit', () => ({
  checkStrictRateLimit: (...args: unknown[]) =>
    (mockCheckStrictRateLimit as unknown as (...a: unknown[]) => unknown)(
      ...args,
    ),
}));
