import { vi } from 'vitest';

/**
 * Global Rate Limit Infrastructure Mocks.
 */
export const mockCheckRateLimit = vi.fn();

export function resetRateLimitMocks() {
  mockCheckRateLimit.mockReset();
}
