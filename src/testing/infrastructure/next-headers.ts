import { vi } from 'vitest';

/**
 * Global Next.js Headers Infrastructure Mocks.
 */
export const mockNextHeaders = vi.hoisted(() => vi.fn());
export const mockCookies = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: () => mockNextHeaders(),
  cookies: () => mockCookies(),
}));

export function resetNextHeadersMocks() {
  mockNextHeaders.mockReset();
  mockCookies.mockReset();
}
