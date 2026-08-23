import {
  mockCheckRateLimit,
  mockCheckStrictRateLimit,
  rateLimitResult,
} from '@/shared/lib/rate-limit/rate-limit-helper.mock';

/**
 * Global Rate Limit Infrastructure Mocks.
 * Re-exports co-located mocks for centralized infrastructure access.
 */
export { mockCheckRateLimit, mockCheckStrictRateLimit, rateLimitResult };

export function resetRateLimitMocks() {
  mockCheckRateLimit.mockReset();
  mockCheckStrictRateLimit.mockReset();
}
