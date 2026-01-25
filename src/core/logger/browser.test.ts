import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('browser logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('sets transmit when logflare integration is enabled', async () => {
    const transmit = { send: vi.fn() };

    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'debug',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: true,
      },
    }));

    vi.doMock('./browser-utils', () => ({
      createLogflareBrowserTransport: vi.fn(() => ({ transmit })),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getBrowserLogger } = await import('./browser');
    getBrowserLogger();

    const pinoMock = vi.mocked(pinoModule.default);
    expect(pinoMock).toHaveBeenCalledTimes(1);
    const options = pinoMock.mock.calls[0]?.[0];
    expect(options?.level).toBe('debug');
    expect(options?.browser?.transmit).toBe(transmit);
  });

  it('skips transmit when logflare integration is disabled', async () => {
    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: false,
      },
    }));

    vi.doMock('./browser-utils', () => ({
      createLogflareBrowserTransport: vi.fn(),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getBrowserLogger } = await import('./browser');
    getBrowserLogger();

    const pinoMock = vi.mocked(pinoModule.default);
    const options = pinoMock.mock.calls[0]?.[0];
    expect(options?.browser?.transmit).toBeUndefined();
  });

  it('uses VERCEL_ENV when available', async () => {
    process.env.VERCEL_ENV = 'preview';

    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: false,
      },
    }));

    vi.doMock('./browser-utils', () => ({
      createLogflareBrowserTransport: vi.fn(),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getBrowserLogger } = await import('./browser');
    getBrowserLogger();

    const pinoMock = vi.mocked(pinoModule.default);
    const options = pinoMock.mock.calls[0]?.[0];
    expect(options?.base?.env).toBe('preview');
  });

  it('reuses cached logger instance', async () => {
    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: false,
      },
    }));

    vi.doMock('./browser-utils', () => ({
      createLogflareBrowserTransport: vi.fn(),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getBrowserLogger } = await import('./browser');

    const first = getBrowserLogger();
    const second = getBrowserLogger();

    expect(first).toBe(second);
    expect(vi.mocked(pinoModule.default)).toHaveBeenCalledTimes(1);
  });
});
