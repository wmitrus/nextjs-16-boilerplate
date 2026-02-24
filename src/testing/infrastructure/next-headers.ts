import { vi } from 'vitest';

/**
 * Global Next.js Headers Infrastructure Mocks.
 * Centralized singleton mocks for 10x scalability.
 */
export const mockHeaders = new Headers();
export const mockNextHeaders = vi
  .fn()
  .mockImplementation(async () => mockHeaders);
export const mockCookies = vi.fn();

export function resetNextHeadersMocks() {
  mockNextHeaders.mockClear();
  mockNextHeaders.mockImplementation(async () => mockHeaders);
  mockHeaders.forEach((_, key) => mockHeaders.delete(key));
  mockCookies.mockReset();
}
