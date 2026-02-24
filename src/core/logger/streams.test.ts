import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unmock streams to test actual implementation
vi.unmock('./streams');

import { env } from '@/core/env';

import { getLogStreams } from './streams';

vi.mock('@/core/env', () => ({
  env: {
    NODE_ENV: 'development',
    LOG_DIR: 'logs',
    LOG_TO_FILE_DEV: false,
    LOG_TO_FILE_PROD: false,
    LOGFLARE_SERVER_ENABLED: false,
  },
}));

vi.mock('./utils', () => ({
  createConsoleStream: vi.fn(() => ({ type: 'console' })),
  createFileStream: vi.fn(() => ({ type: 'file' })),
  createLogflareWriteStream: vi.fn(() => ({ type: 'logflare' })),
}));

interface MockStream {
  type: string;
}

describe('getLogStreams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return only console stream in development by default', () => {
    (env as unknown as Record<string, string | boolean>).NODE_ENV =
      'development';
    (env as unknown as Record<string, string | boolean>).LOG_TO_FILE_DEV =
      false;

    const streams = getLogStreams();
    expect(streams).toHaveLength(1);
    expect(streams[0] as unknown as MockStream).toEqual({ type: 'console' });
  });

  it('should include file stream if enabled in development', () => {
    (env as unknown as Record<string, string | boolean>).NODE_ENV =
      'development';
    (env as unknown as Record<string, string | boolean>).LOG_TO_FILE_DEV = true;

    const streams = getLogStreams();
    expect(streams).toHaveLength(2);
    expect(
      streams.some((s) => (s as unknown as MockStream).type === 'file'),
    ).toBe(true);
  });

  it('should include logflare stream if enabled', () => {
    (
      env as unknown as Record<string, string | boolean>
    ).LOGFLARE_SERVER_ENABLED = true;

    const streams = getLogStreams();
    expect(
      streams.some((s) => (s as unknown as MockStream).type === 'logflare'),
    ).toBe(true);
  });

  it('should include file stream if enabled in production', () => {
    (env as unknown as Record<string, string | boolean>).NODE_ENV =
      'production';
    (env as unknown as Record<string, string | boolean>).LOG_TO_FILE_PROD =
      true;

    const streams = getLogStreams();
    expect(
      streams.some((s) => (s as unknown as MockStream).type === 'file'),
    ).toBe(true);
  });

  it('should not include console stream in production', () => {
    (env as unknown as Record<string, string | boolean>).NODE_ENV =
      'production';

    const streams = getLogStreams();
    expect(
      streams.some((s) => (s as unknown as MockStream).type === 'console'),
    ).toBe(false);
  });

  it('should return empty array if in browser', () => {
    vi.stubGlobal('window', {});
    const streams = getLogStreams();
    expect(streams).toHaveLength(0);
  });
});
