import {
  mockAuthorize,
  mockEnforceTenant,
  resetAuthorizationMocks,
} from '@/security/core/authorization.mock';
import {
  createMockSecurityContext,
  createMockUser,
  mockGetSecurityContext,
  resetSecurityContextMocks,
} from '@/security/core/security-context.mock';

// Ensure side-effects (vi.mock) are triggered
import '@/security/core/security-context.mock';
import '@/security/core/authorization.mock';

/**
 * Global Security Infrastructure Mocks & Factories.
 * Re-exports co-located mocks for centralized domain access.
 */
export {
  createMockSecurityContext,
  createMockUser,
  mockGetSecurityContext,
  resetSecurityContextMocks,
};

export { mockAuthorize, mockEnforceTenant, resetAuthorizationMocks };

export function resetSecurityMocks() {
  resetSecurityContextMocks();
  resetAuthorizationMocks();
}
