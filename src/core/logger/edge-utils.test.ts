import type { LogEvent } from 'pino';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('edge transport', () => {
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

  it('posts payload to ingest endpoint', async () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      },
    }));

    const { createLogflareEdgeTransport } = await import('./edge-utils');
    const transport = createLogflareEdgeTransport();

    const logEvent = {
      messages: ['edge log'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    transport.transmit.send('info', logEvent);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
      keepalive: true,
    });
  });

  it('skips sending when NEXT_PUBLIC_APP_URL is missing', async () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        NEXT_PUBLIC_APP_URL: undefined,
      },
    }));

    const { createLogflareEdgeTransport } = await import('./edge-utils');
    const transport = createLogflareEdgeTransport();

    const logEvent = {
      messages: ['edge log'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    transport.transmit.send('info', logEvent);

    expect(fetch).not.toHaveBeenCalled();
  });
});
