import { vi } from 'vitest';

/**
 * Global Network Infrastructure Mocks.
 */
export const mockGetIP = vi.fn();

export function resetNetworkMocks() {
  mockGetIP.mockReset();
}
