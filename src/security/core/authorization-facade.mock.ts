import { vi } from 'vitest';

import type * as authorizationFacade from './authorization-facade';

export const mockAuthorizationCan = vi.fn();
export const mockAuthorizationAuthorize = vi.fn();
export const mockAuthorizationEnsureRequiredRole = vi.fn();

export function resetAuthorizationFacadeMocks() {
  mockAuthorizationCan.mockReset();
  mockAuthorizationAuthorize.mockReset();
  mockAuthorizationEnsureRequiredRole.mockReset();
}

vi.mock('./authorization-facade', async (importOriginal) => {
  const actual = await importOriginal<typeof authorizationFacade>();

  return {
    ...actual,
    AuthorizationFacade: class AuthorizationFacade {
      can(...args: unknown[]) {
        return mockAuthorizationCan(...args);
      }

      authorize(...args: unknown[]) {
        return mockAuthorizationAuthorize(...args);
      }

      ensureRequiredRole(...args: unknown[]) {
        return mockAuthorizationEnsureRequiredRole(...args);
      }
    },
  };
});
