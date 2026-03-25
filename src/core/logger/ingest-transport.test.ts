import { describe, it, expect, vi, afterEach } from 'vitest';

import { postClientLogPayload } from './ingest-transport';

describe('log ingest transport', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('prefers sendBeacon when requested and available', () => {
    const sendBeacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('fetch', vi.fn());

    postClientLogPayload(
      {
        level: 'info',
        message: 'hello',
        context: { requestId: 'req-1' },
        source: 'browser',
      },
      {
        endpoint: '/api/logs',
        preferBeacon: true,
      },
    );

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith('/api/logs', expect.any(Blob));
  });

  it('falls back to fetch when beacon is unavailable', () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', fetch);

    postClientLogPayload(
      {
        level: 'info',
        message: 'hello',
        context: { requestId: 'req-1' },
        source: 'browser',
      },
      {
        endpoint: '/api/logs',
        preferBeacon: true,
      },
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
      keepalive: true,
    });
  });

  it('includes custom headers when provided', () => {
    const fetch = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetch);

    postClientLogPayload(
      {
        level: 'info',
        message: 'hello',
        context: {},
        source: 'edge',
      },
      {
        endpoint: 'http://localhost:3000/api/logs',
        headers: { 'x-log-ingest-secret': 'secret' },
      },
    );

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-log-ingest-secret': 'secret',
      },
      body: expect.any(String),
      keepalive: true,
    });
  });
});
