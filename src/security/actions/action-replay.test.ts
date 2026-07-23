import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
