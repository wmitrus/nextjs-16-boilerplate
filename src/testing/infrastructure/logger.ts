import { vi } from 'vitest';

/**
 * Global Logger Infrastructure Mocks.
 */
export const mockLogger = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
};

export function resetLoggerMocks() {
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
  mockLogger.info.mockReset();
  mockLogger.debug.mockReset();
  mockLogger.fatal.mockReset();
}
