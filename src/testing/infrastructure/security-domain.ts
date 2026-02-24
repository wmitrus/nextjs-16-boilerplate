import { resetSecureActionMocks } from '@/security/actions/secure-action.mock';
import { resetSecureFetchMocks } from '@/security/outbound/secure-fetch.mock';
import { resetDataSanitizerMocks } from '@/security/rsc/data-sanitizer.mock';

// Ensure side-effects (vi.mock) are triggered
import '@/security/outbound/secure-fetch.mock';
import '@/security/rsc/data-sanitizer.mock';
import '@/security/actions/secure-action.mock';

/**
 * Reset all security domain logic mocks.
 */
export function resetSecurityDomainMocks() {
  resetSecureFetchMocks();
  resetDataSanitizerMocks();
  resetSecureActionMocks();
}

export * from '@/security/outbound/secure-fetch.mock';
export * from '@/security/rsc/data-sanitizer.mock';
export * from '@/security/actions/secure-action.mock';
