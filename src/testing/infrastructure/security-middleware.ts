import { resetRouteClassificationMocks } from '@/security/middleware/route-classification.mock';
import { resetWithAuthMocks } from '@/security/middleware/with-auth.mock';
import { resetWithHeadersMocks } from '@/security/middleware/with-headers.mock';
import { resetWithInternalApiGuardMocks } from '@/security/middleware/with-internal-api-guard.mock';
import { resetWithRateLimitMocks } from '@/security/middleware/with-rate-limit.mock';
import { resetWithSecurityMocks } from '@/security/middleware/with-security.mock';

// Ensure side-effects (vi.mock) are triggered
import '@/security/middleware/route-classification.mock';
import '@/security/middleware/with-auth.mock';
import '@/security/middleware/with-headers.mock';
import '@/security/middleware/with-internal-api-guard.mock';
import '@/security/middleware/with-rate-limit.mock';
import '@/security/middleware/with-security.mock';

/**
 * Reset all security middleware mocks.
 */
export function resetSecurityMiddlewareMocks() {
  resetRouteClassificationMocks();
  resetWithAuthMocks();
  resetWithHeadersMocks();
  resetWithInternalApiGuardMocks();
  resetWithRateLimitMocks();
  resetWithSecurityMocks();
}

export * from '@/security/middleware/route-classification.mock';
export * from '@/security/middleware/with-auth.mock';
export * from '@/security/middleware/with-headers.mock';
export * from '@/security/middleware/with-internal-api-guard.mock';
export * from '@/security/middleware/with-rate-limit.mock';
export * from '@/security/middleware/with-security.mock';
