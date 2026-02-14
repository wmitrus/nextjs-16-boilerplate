export * from './factories/request';
export * from './factories/security';
export * from './infrastructure/clerk';
export * from './infrastructure/next-headers';
export * from './infrastructure/logger';
export * from './infrastructure/env';
export * from './infrastructure/network';
export * from './infrastructure/rate-limit';
export * from './infrastructure/security-middleware';
export * from './infrastructure/security-domain';

import { resetSecurityMocks } from './factories/security';
import { resetClerkMocks } from './infrastructure/clerk';
import { resetEnvMocks } from './infrastructure/env';
import { resetLoggerMocks } from './infrastructure/logger';
import { resetNetworkMocks } from './infrastructure/network';
import { resetNextHeadersMocks } from './infrastructure/next-headers';
import { resetRateLimitMocks } from './infrastructure/rate-limit';
import { resetSecurityDomainMocks } from './infrastructure/security-domain';
import { resetSecurityMiddlewareMocks } from './infrastructure/security-middleware';

/**
 * Universal reset helper for all infrastructure mocks.
 */
export function resetAllInfrastructureMocks() {
  resetClerkMocks();
  resetNextHeadersMocks();
  resetLoggerMocks();
  resetNetworkMocks();
  resetRateLimitMocks();
  resetSecurityMocks();
  resetSecurityMiddlewareMocks();
  resetSecurityDomainMocks();
  resetEnvMocks();
}
