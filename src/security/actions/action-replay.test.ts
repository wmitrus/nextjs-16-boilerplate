import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  resetReplayProtectionStoreForTests,
  validateReplayToken,
} from './action-replay';
import { createReplayToken } from './replay-token';

import { createMockSecurityContext } from '@/testing';

describe('Action Replay Protection', () => {
  const mockCtx = createMockSecurityContext();

  beforeEach(() => {
    resetReplayProtectionStoreForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should reject when no token is provided', async () => {
    await expect(validateReplayToken(undefined, mockCtx)).rejects.toThrow(
      'Replay protection token missing',
    );
  });

  it('should allow valid token', async () => {
    const validToken = createReplayToken();
    await expect(
      validateReplayToken(validToken, mockCtx),
    ).resolves.not.toThrow();
  });

  it('should reject replayed tokens', async () => {
    const validToken = createReplayToken();

    await expect(
      validateReplayToken(validToken, mockCtx),
    ).resolves.not.toThrow();
    await expect(validateReplayToken(validToken, mockCtx)).rejects.toThrow(
      'Replay token already used',
    );
  });

  it('should throw if token is expired', async () => {
    const expiredToken = `${Date.now() - 10 * 60 * 1000}|nonce-123`;
    await expect(validateReplayToken(expiredToken, mockCtx)).rejects.toThrow(
      'Action expired',
    );
  });

  it('should throw if token is in the future too far', async () => {
    const futureToken = `${Date.now() + 10 * 60 * 1000}|nonce-123`;
    await expect(validateReplayToken(futureToken, mockCtx)).rejects.toThrow(
      'Action expired',
    );
  });

  it('should throw if timestamp is invalid', async () => {
    await expect(
      validateReplayToken('invalid|nonce-123', mockCtx),
    ).rejects.toThrow('Action expired');
  });

  it('should throw if nonce is missing', async () => {
    await expect(
      validateReplayToken(`${Date.now()}|`, mockCtx),
    ).rejects.toThrow('Replay token nonce missing or invalid');
  });

  it('should allow a nonce again after the local replay window expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));

    await expect(
      validateReplayToken(`${Date.now()}|nonce-123`, mockCtx),
    ).resolves.not.toThrow();

    vi.setSystemTime(new Date('2026-07-25T12:06:00.000Z'));

    await expect(
      validateReplayToken(`${Date.now()}|nonce-123`, mockCtx),
    ).resolves.not.toThrow();
  });

  it('should reject production validation when Redis replay storage is unavailable', async () => {
    vi.resetModules();
    vi.doMock('server-only', () => ({}));
    vi.doMock('@/core/env', () => ({
      env: {
        NODE_ENV: 'production',
        UPSTASH_REDIS_REST_URL: '',
        UPSTASH_REDIS_REST_TOKEN: '',
      },
    }));

    const { validateReplayToken: validateReplayTokenInProduction } =
      await import('./action-replay');

    await expect(
      validateReplayTokenInProduction(`${Date.now()}|nonce-123`, mockCtx),
    ).rejects.toThrow(
      'Replay protection unavailable: configure Upstash Redis in production',
    );

    vi.doUnmock('@/core/env');
    vi.resetModules();
  });
});
