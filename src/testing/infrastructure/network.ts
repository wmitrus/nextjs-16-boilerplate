import { resetClientIpResolverForTests } from '@/shared/lib/network/get-ip';
import { mockGetClientIp } from '@/shared/lib/network/get-ip.mock';

// Ensure side-effects are triggered
import '@/shared/lib/network/get-ip.mock';

/**
 * Global Network Infrastructure Mocks.
 * Re-exports co-located mocks for centralized infrastructure access.
 */
export { mockGetClientIp };

export function resetNetworkMocks() {
  // The real resolver memoises itself from env on first use, so a test that
  // declares a different DEPLOYMENT_PROXY needs the next call to rebuild it.
  resetClientIpResolverForTests();
  mockGetClientIp.mockReset();
  mockGetClientIp.mockImplementation(async () => ({
    kind: 'trusted',
    ip: '127.0.0.1',
  }));
}
