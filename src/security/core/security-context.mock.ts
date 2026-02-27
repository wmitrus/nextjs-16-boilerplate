import { vi } from 'vitest';

import { ROLES } from '@/core/contracts/roles';

import type * as securityContext from './security-context';
import type { SecurityContext } from './security-context';

/**
 * Creates a mock user for SecurityContext.
 */
export function createMockUser(
  overrides: Partial<NonNullable<SecurityContext['user']>> = {},
) {
  return {
    id: 'user_123',
    role: ROLES.USER,
    tenantId: 'tenant_123',
    ...overrides,
  };
}

/**
 * Creates a mock SecurityContext for testing.
 */
export const createMockSecurityContext = (
  overrides: Partial<SecurityContext> = {},
): SecurityContext => ({
  user: createMockUser(),
  ip: '127.0.0.1',
  userAgent: 'test-agent',
  correlationId: 'corr_123',
  requestId: 'req_123',
  runtime: 'node',
  environment: 'test',
  ...overrides,
});

export const mockGetSecurityContext = vi.fn();

export function resetSecurityContextMocks() {
  mockGetSecurityContext.mockReset();
}

vi.mock('./security-context', async (importOriginal) => {
  const actual = await importOriginal<typeof securityContext>();
  return {
    ...actual,
    getSecurityContext: (...args: unknown[]) => mockGetSecurityContext(...args),
  };
});
