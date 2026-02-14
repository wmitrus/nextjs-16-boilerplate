import { vi } from 'vitest';

import type * as authorization from './authorization';

export const mockAuthorize = vi.fn();
export const mockEnforceTenant = vi.fn();

export function resetAuthorizationMocks() {
  mockAuthorize.mockReset();
  mockEnforceTenant.mockReset();
}

vi.mock('./authorization', async (importOriginal) => {
  const actual = await importOriginal<typeof authorization>();
  return {
    ...actual,
    authorize: (...args: unknown[]) => mockAuthorize(...args),
    enforceTenant: (...args: unknown[]) => mockEnforceTenant(...args),
  };
});
