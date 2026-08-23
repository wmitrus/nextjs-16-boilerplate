import { vi } from 'vitest';

import type { ClientIp } from '@/shared/lib/network/client-ip';
import type * as GetIpModule from '@/shared/lib/network/get-ip';

/**
 * Defaults to a trusted, canonical loopback address so existing tests keep
 * describing an identifiable client. Note the difference from the old mock:
 * `127.0.0.1` is now something a test *chooses*, not what production returns
 * when it has nothing (SEC-43).
 */
export const mockGetClientIp = vi.fn(
  async (_headers: Headers): Promise<ClientIp> => ({
    kind: 'trusted',
    ip: '127.0.0.1',
  }),
);

vi.mock('@/shared/lib/network/get-ip', async (importOriginal) => {
  // The pure helpers (`rateLimitKeyForClient`, `auditIpForClient`,
  // `UNTRUSTED_CLIENT_BUCKET`) are kept real: they encode the policy for an
  // unidentifiable client, and a test asserting on that policy must exercise
  // it rather than a stub of it.
  const actual = await importOriginal<typeof GetIpModule>();
  return {
    ...actual,
    getClientIp: (headers: Headers) => mockGetClientIp(headers),
  };
});
