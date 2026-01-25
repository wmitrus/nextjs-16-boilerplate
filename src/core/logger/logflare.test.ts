import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type MockStream = { on?: ReturnType<typeof vi.fn> };

describe('logflare logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('creates logflare logger once', async () => {
    const stream: MockStream = { on: vi.fn() };

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        NODE_ENV: 'production',
      },
    }));

    vi.doMock('./utils', () => ({
      createLogflareWriteStream: vi.fn(() => stream),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getLogflareLogger } = await import('./logflare');

    const first = getLogflareLogger();
    const second = getLogflareLogger();

    expect(first).toBe(second);
    expect(vi.mocked(pinoModule.default)).toHaveBeenCalledTimes(1);
  });
});
