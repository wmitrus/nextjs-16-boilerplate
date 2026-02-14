/** @vitest-environment node */
import pino from 'pino';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unmock server logger to test actual implementation
vi.unmock('./server');

import '@/testing/infrastructure/env';
import '@/testing/infrastructure/logger';

import { env } from '@/core/env';

import { getServerLogger, resetServerLogger } from './server';

import { mockGetLogStreams, resetAllInfrastructureMocks } from '@/testing';

describe('server logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetAllInfrastructureMocks();
    resetServerLogger();
    vi.stubGlobal('window', undefined);
    process.env = { ...originalEnv };
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it('uses env.LOG_LEVEL on server', () => {
    vi.mocked(env).LOG_LEVEL = 'warn';
    vi.mocked(env).NODE_ENV = 'production';

    getServerLogger();

    const options = vi.mocked(pino).mock.calls[0]?.[0];
    expect(options?.level).toBe('warn');
    expect(options?.base?.env).toBe('production');
  });

  it('uses process.env.NODE_ENV in browser context', () => {
    vi.stubGlobal('window', {});
    vi.stubEnv('NODE_ENV', 'test-env');

    getServerLogger();

    const options = vi.mocked(pino).mock.calls[0]?.[0];
    expect(options?.level).toBe('info');
    expect(options?.base?.env).toBe('test-env');
  });

  it('prefers VERCEL_ENV when set', () => {
    process.env.VERCEL_ENV = 'preview';

    getServerLogger();

    const options = vi.mocked(pino).mock.calls[0]?.[0];
    expect(options?.base?.env).toBe('preview');
  });

  it('uses multistream when streams are provided', () => {
    const mockStream = { write: vi.fn() };
    const streams = [mockStream];
    mockGetLogStreams.mockReturnValue(streams);

    getServerLogger();

    expect(pino).toHaveBeenCalledTimes(1);
    const secondArg = vi.mocked(pino).mock.calls[0]?.[1];
    expect(secondArg).toBeDefined();
    // Verify that pino.multistream was called with our streams
    expect(vi.mocked(pino.multistream)).toHaveBeenCalledWith(streams);
  });
});
