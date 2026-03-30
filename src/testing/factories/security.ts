import {
  mockAuthorizationAuthorize,
  mockAuthorizationCan,
  resetAuthorizationFacadeMocks,
} from '@/security/core/authorization-facade.mock';
import {
  createMockSecurityContext,
  createMockUser,
  mockGetSecurityContext,
  resetSecurityContextMocks,
} from '@/security/core/security-context.mock';

// Ensure side-effects (vi.mock) are triggered
import '@/security/core/security-context.mock';
import '@/security/core/authorization-facade.mock';

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

export {
  mockAuthorizationAuthorize,
  mockAuthorizationCan,
  resetAuthorizationFacadeMocks,
};

export function resetSecurityMocks() {
  resetSecurityContextMocks();
  resetAuthorizationFacadeMocks();
}
