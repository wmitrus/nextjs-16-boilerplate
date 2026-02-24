import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { mockEnv } from '@/testing/infrastructure/env';

type MockStream = { on?: ReturnType<typeof vi.fn> };

type PinoMock = ReturnType<typeof vi.fn> & {
  multistream?: ReturnType<typeof vi.fn>;
};

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  },
}));

vi.mock('pino', () => {
  const pino = vi.fn(() => ({ info: vi.fn(), error: vi.fn() })) as PinoMock;
  pino.multistream = vi.fn((streams) => ({ streams }));
  return {
    default: pino,
    destination: vi.fn((): MockStream => ({ on: vi.fn() })),
  };
});

vi.mock('pino-pretty', () => ({
  default: vi.fn((): MockStream => ({ on: vi.fn() })),
}));

vi.mock('pino-logflare', () => ({
  logflarePinoVercel: vi.fn(() => ({ send: vi.fn() })),
  createWriteStream: vi.fn((): MockStream => ({ on: vi.fn() })),
}));

describe('logger integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('selects browser logger when window is defined', async () => {
    vi.stubGlobal('window', {});
    mockEnv.NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED = false;

    const { logger } = (await vi.importActual('@/core/logger/index')) as {
      logger: { info: unknown; error: unknown };
    };
    const { getBrowserLogger: _getBrowserLogger } = (await vi.importActual(
      '@/core/logger/browser',
    )) as {
      getBrowserLogger: unknown;
    };

    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
  });

  it('selects edge logger when NEXT_RUNTIME is edge', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    const { logger } = (await vi.importActual('@/core/logger/index')) as {
      logger: { info: unknown };
    };
    const { getEdgeLogger: _getEdgeLogger } = (await vi.importActual(
      '@/core/logger/edge',
    )) as {
      getEdgeLogger: unknown;
    };

    expect(logger.info).toBeDefined();
  });

  it('selects server logger by default', async () => {
    vi.stubGlobal('window', undefined);
    const { logger } = (await vi.importActual('@/core/logger/index')) as {
      logger: { info: unknown };
    };
    const { getServerLogger: _getServerLogger } = (await vi.importActual(
      '@/core/logger/server',
    )) as {
      getServerLogger: unknown;
    };

    expect(logger.info).toBeDefined();
  });

  it('builds streams based on env in server context', async () => {
    vi.stubGlobal('window', undefined);
    mockEnv.NODE_ENV = 'development' as 'development' | 'test' | 'production';
    mockEnv.LOG_DIR = 'logs';
    mockEnv.LOG_TO_FILE_DEV = true;
    mockEnv.LOGFLARE_SERVER_ENABLED = true;
    mockEnv.LOGFLARE_API_KEY = 'key';
    mockEnv.LOGFLARE_SOURCE_TOKEN = 'token';

    const { getLogStreams } = (await vi.importActual(
      '@/core/logger/streams',
    )) as {
      getLogStreams: () => unknown[];
    };
    const streams = getLogStreams();

    expect(streams).toHaveLength(3);

    const pinoPretty = await import('pino-pretty');
    const logflare = await import('pino-logflare');
    const pino = await import('pino');

    expect(vi.mocked(pinoPretty.default)).toHaveBeenCalled();
    expect(vi.mocked(logflare.createWriteStream)).toHaveBeenCalled();
    expect(vi.mocked(pino.destination)).toHaveBeenCalled();
  });

  it('returns empty streams in browser context', async () => {
    vi.stubGlobal('window', {});
    mockEnv.NODE_ENV = 'development' as 'development' | 'test' | 'production';

    const { getLogStreams } = (await vi.importActual(
      '@/core/logger/streams',
    )) as {
      getLogStreams: () => unknown[];
    };
    const streams = getLogStreams();

    expect(streams).toHaveLength(0);
  });
});
