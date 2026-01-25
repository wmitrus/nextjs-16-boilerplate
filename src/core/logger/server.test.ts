import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('server logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses env.LOG_LEVEL on server', async () => {
    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
      },
    }));

    vi.doMock('./streams', () => ({
      getLogStreams: vi.fn(() => []),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      (
        pino as unknown as { multistream: (s: unknown[]) => unknown }
      ).multistream = vi.fn((streams) => ({ streams }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getServerLogger } = await import('./server');
    getServerLogger();

    const options = vi.mocked(pinoModule.default).mock.calls[0]?.[0];
    expect(options?.level).toBe('warn');
    expect(options?.base?.env).toBe('production');
  });

  it('uses process.env.NODE_ENV in browser context', async () => {
    vi.stubGlobal('window', {});
    vi.stubEnv('NODE_ENV', 'test');

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'debug',
        NODE_ENV: 'production',
      },
    }));

    vi.doMock('./streams', () => ({
      getLogStreams: vi.fn(() => []),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      (
        pino as unknown as { multistream: (s: unknown[]) => unknown }
      ).multistream = vi.fn((streams) => ({ streams }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getServerLogger } = await import('./server');
    getServerLogger();

    const options = vi.mocked(pinoModule.default).mock.calls[0]?.[0];
    expect(options?.level).toBe('info');
    expect(options?.base?.env).toBe('test');
  });

  it('prefers VERCEL_ENV when set', async () => {
    process.env.VERCEL_ENV = 'preview';

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        NODE_ENV: 'development',
      },
    }));

    vi.doMock('./streams', () => ({
      getLogStreams: vi.fn(() => []),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      (
        pino as unknown as { multistream: (s: unknown[]) => unknown }
      ).multistream = vi.fn((streams) => ({ streams }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getServerLogger } = await import('./server');
    getServerLogger();

    const options = vi.mocked(pinoModule.default).mock.calls[0]?.[0];
    expect(options?.base?.env).toBe('preview');
  });

  it('uses multistream when streams are provided', async () => {
    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        NODE_ENV: 'development',
      },
    }));

    const streams = [{ stream: 'one' }];
    vi.doMock('./streams', () => ({
      getLogStreams: vi.fn(() => streams),
    }));

    vi.doMock('pino', () => {
      const pino = vi.fn(() => ({ info: vi.fn() }));
      (
        pino as unknown as { multistream: (s: unknown[]) => unknown }
      ).multistream = vi.fn((items) => ({ items }));
      return { default: pino };
    });

    const pinoModule = await import('pino');
    const { getServerLogger } = await import('./server');
    getServerLogger();

    const pinoMock = vi.mocked(pinoModule.default);
    expect(pinoMock).toHaveBeenCalledTimes(1);
    const secondArg = pinoMock.mock.calls[0]?.[1];
    const items = (secondArg as { items?: unknown[] } | undefined)?.items;
    expect(items).toEqual(streams);
  });
});
