import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    vi.stubEnv('NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED', 'false');

    const { logger } = await import('./index');
    const { browserLogger } = await import('./browser');

    expect(logger).toBe(browserLogger);
  });

  it('selects edge logger when NEXT_RUNTIME is edge', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NEXT_RUNTIME', 'edge');

    const { logger } = await import('./index');
    const { edgeLogger } = await import('./edge');

    expect(logger).toBe(edgeLogger);
  });

  it('selects server logger by default', async () => {
    vi.stubGlobal('window', undefined);
    const { logger } = await import('./index');
    const { serverLogger } = await import('./server');

    expect(logger).toBe(serverLogger);
  });

  it('builds streams based on env in server context', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LOG_DIR', 'logs');
    vi.stubEnv('LOG_TO_FILE_DEV', 'true');
    vi.stubEnv('LOGFLARE_SERVER_ENABLED', 'true');
    vi.stubEnv('LOGFLARE_API_KEY', 'key');
    vi.stubEnv('LOGFLARE_SOURCE_TOKEN', 'token');

    const { getLogStreams } = await import('./streams');
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
    vi.stubEnv('NODE_ENV', 'development');

    const { getLogStreams } = await import('./streams');
    const streams = getLogStreams();

    expect(streams).toHaveLength(0);
  });
});
