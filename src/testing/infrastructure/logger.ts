import type { Logger } from 'pino';
import { vi, type Mock } from 'vitest';

/**
 * Global Logger Infrastructure Mocks.
 * Centralized singleton mocks for 10x scalability.
 */
export const mockLogger = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  silent: vi.fn(),
} as unknown as Logger;

export const mockGetLogStreams = vi.fn<() => unknown[]>(() => []);

type MockPino = Mock<() => Logger> & {
  multistream: Mock<(streams: unknown) => { streams: unknown }>;
  stdSerializers: { err: Mock };
};

export const mockPino = vi.fn(() => mockLogger) as unknown as MockPino;

mockPino.multistream = vi.fn((streams: unknown) => ({ streams }));
mockPino.stdSerializers = { err: vi.fn() };

export function resetLoggerMocks() {
  mockPino.mockClear();
  vi.mocked(mockPino.multistream).mockClear();
  vi.mocked(mockLogger.warn).mockReset();
  vi.mocked(mockLogger.error).mockReset();
  vi.mocked(mockLogger.info).mockReset();
  vi.mocked(mockLogger.debug).mockReset();
  vi.mocked(mockLogger.fatal).mockReset();
  mockGetLogStreams.mockReset();
  mockGetLogStreams.mockReturnValue([]);
}
