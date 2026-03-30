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
    vi.unstubAllGlobals();
  });

  it('writes structured logs to console and forwards to ingest', async () => {
    const consoleDebug = vi.fn();
    const consoleLog = vi.fn();
    const consoleWarn = vi.fn();
    const consoleError = vi.fn();

    vi.stubGlobal('console', {
      ...console,
      debug: consoleDebug,
      log: consoleLog,
      warn: consoleWarn,
      error: consoleError,
    });

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'debug',
        LOGFLARE_EDGE_ENABLED: true,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        NODE_ENV: 'development',
      },
    }));

    vi.doMock('./edge-utils', () => ({
      forwardEdgeLogEvent: vi.fn(),
    }));

    const { getEdgeLogger } = await import('./edge');
    const edgeUtils = await import('./edge-utils');

    getEdgeLogger()
      .child({ type: 'Security', category: 'middleware' })
      .debug({ path: '/users' }, 'Security Middleware Processing');

    expect(consoleDebug).toHaveBeenCalledTimes(1);
    expect(consoleDebug).toHaveBeenCalledWith(
      expect.stringContaining('"type":"Security"'),
    );
    expect(consoleDebug).toHaveBeenCalledWith(
      expect.stringContaining('"msg":"Security Middleware Processing"'),
    );
    expect(vi.mocked(edgeUtils.forwardEdgeLogEvent)).toHaveBeenCalledTimes(1);
  });

  it('still logs to console when ingest forwarding is disabled', async () => {
    const consoleLog = vi.fn();

    vi.stubGlobal('console', {
      ...console,
      debug: vi.fn(),
      log: consoleLog,
      warn: vi.fn(),
      error: vi.fn(),
    });

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: false,
        NEXT_PUBLIC_APP_URL: undefined,
        NODE_ENV: 'development',
      },
    }));

    vi.doMock('./edge-utils', () => ({
      forwardEdgeLogEvent: vi.fn(),
    }));

    const { getEdgeLogger } = await import('./edge');
    const edgeUtils = await import('./edge-utils');

    getEdgeLogger().info({ path: '/' }, 'edge log');

    expect(consoleLog).toHaveBeenCalledTimes(1);
    expect(vi.mocked(edgeUtils.forwardEdgeLogEvent)).toHaveBeenCalledTimes(1);
  });

  it('reuses cached logger instance', async () => {
    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: false,
        NEXT_PUBLIC_APP_URL: undefined,
        NODE_ENV: 'development',
      },
    }));

    vi.doMock('./edge-utils', () => ({
      forwardEdgeLogEvent: vi.fn(),
    }));

    const { getEdgeLogger } = await import('./edge');

    const first = getEdgeLogger();
    const second = getEdgeLogger();

    expect(first).toBe(second);
  });
});
