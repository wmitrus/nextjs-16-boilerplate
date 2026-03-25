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

  it('posts payload to ingest endpoint when forwarding is enabled', async () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: true,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      },
    }));

    const { forwardEdgeLogEvent } = await import('./edge-utils');

    const logEvent = {
      messages: ['edge log'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    forwardEdgeLogEvent('info', logEvent);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
      keepalive: true,
    });
  });

  it('skips sending when forwarding is disabled', async () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: false,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      },
    }));

    const { forwardEdgeLogEvent } = await import('./edge-utils');

    const logEvent = {
      messages: ['edge log'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    forwardEdgeLogEvent('info', logEvent);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('adds the ingest secret header when configured', async () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: true,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        LOG_INGEST_SECRET: 'edge-secret',
      },
    }));

    const { forwardEdgeLogEvent } = await import('./edge-utils');

    const logEvent = {
      messages: ['edge log'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    forwardEdgeLogEvent('info', logEvent);

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-log-ingest-secret': 'edge-secret',
      },
      body: expect.any(String),
      keepalive: true,
    });
  });

  it('skips forwarding logs that already describe the ingest route', async () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        LOG_LEVEL: 'info',
        LOGFLARE_EDGE_ENABLED: true,
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      },
    }));

    const { forwardEdgeLogEvent } = await import('./edge-utils');

    const logEvent = {
      messages: [{ path: '/api/logs' }, 'Security Middleware Processing'],
      bindings: [{ type: 'Security', category: 'middleware' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    forwardEdgeLogEvent('info', logEvent);

    expect(fetch).not.toHaveBeenCalled();
  });
});
