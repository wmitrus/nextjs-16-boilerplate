import { mockGetIP } from '@/shared/lib/network/get-ip.mock';

// Ensure side-effects are triggered
import '@/shared/lib/network/get-ip.mock';

/**
 * Global Network Infrastructure Mocks.
 * Re-exports co-located mocks for centralized infrastructure access.
 */
export { mockGetIP };

export function resetNetworkMocks() {
  mockGetIP.mockReset();
  mockGetIP.mockImplementation(async () => '127.0.0.1');
}
