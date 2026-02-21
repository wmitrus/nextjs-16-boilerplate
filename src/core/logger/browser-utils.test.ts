import type { LogEvent } from 'pino';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('browser transport', () => {
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

  it('sends payload via sendBeacon when available', async () => {
    const sendBeacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });

    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: true,
      },
    }));

    const { createLogflareBrowserTransport } = await import('./browser-utils');
    const transport = createLogflareBrowserTransport();

    const logEvent = {
      messages: ['hello'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    transport.transmit.send('info', logEvent);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith('/api/logs', expect.any(Blob));
  });

  it('falls back to fetch when sendBeacon is unavailable', async () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: true,
      },
    }));

    const { createLogflareBrowserTransport } = await import('./browser-utils');
    const transport = createLogflareBrowserTransport();

    const logEvent = {
      messages: ['hello'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    transport.transmit.send('info', logEvent);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
      keepalive: true,
    });
  });

  it('no-ops when sendBeacon and fetch are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', undefined);

    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: true,
      },
    }));

    const { createLogflareBrowserTransport } = await import('./browser-utils');
    const transport = createLogflareBrowserTransport();

    const logEvent = {
      messages: ['hello'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    transport.transmit.send('info', logEvent);

    expect(navigator.sendBeacon).toBeUndefined();
  });

  it('no-ops when navigator is undefined and fetch is unavailable', async () => {
    vi.stubGlobal('navigator', undefined as unknown as Navigator);
    vi.stubGlobal('fetch', undefined as unknown as typeof fetch);

    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_LOGFLARE_BROWSER_ENABLED: true,
      },
    }));

    const { createLogflareBrowserTransport } = await import('./browser-utils');
    const transport = createLogflareBrowserTransport();

    const logEvent = {
      messages: ['hello'],
      bindings: [{ requestId: 'req-1' }],
      level: { label: 'info', value: 30 },
      ts: 0,
    } as LogEvent;

    transport.transmit.send('info', logEvent);

    expect(navigator).toBeUndefined();
  });

  it('uses default info level when NEXT_PUBLIC_LOG_LEVEL is missing', async () => {
    vi.doMock('@/core/env', () => ({
      env: {
        NEXT_PUBLIC_LOG_LEVEL: undefined,
      },
    }));

    const { createLogflareBrowserTransport } = await import('./browser-utils');
    const transport = createLogflareBrowserTransport();

    expect(transport.transmit.level).toBe('info');
  });
});
