import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('edge logger', () => {
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

    vi.stubGlobal('window', undefined);

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'debug',
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: true,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        NODE_ENV: 'production',
      },
    }));

    vi.doMock('./edge-utils', () => ({
      createLogflareEdgeTransport: vi.fn(() => ({ transmit })),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getEdgeLogger } = await import('./edge');
    getEdgeLogger();

    const pinoMock = vi.mocked(pinoModule.default);
    expect(pinoMock).toHaveBeenCalledTimes(1);
    const options = pinoMock.mock.calls[0]?.[0];
    expect(options?.level).toBe('debug');
    expect(options?.browser?.transmit).toBe(transmit);
  });

  it('reuses cached logger instance', async () => {
    vi.stubGlobal('window', undefined);
    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: false,
        NEXT_PUBLIC_APP_URL: undefined,
        NODE_ENV: 'production',
      },
    }));

    vi.doMock('./edge-utils', () => ({
      createLogflareEdgeTransport: vi.fn(),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getEdgeLogger } = await import('./edge');

    const first = getEdgeLogger();
    const second = getEdgeLogger();

    expect(first).toBe(second);
    expect(vi.mocked(pinoModule.default)).toHaveBeenCalledTimes(1);
  });
});
