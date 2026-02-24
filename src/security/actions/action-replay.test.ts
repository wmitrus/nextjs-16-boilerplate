import { describe, it, expect } from 'vitest';

import { validateReplayToken } from './action-replay';

import { createMockSecurityContext } from '@/testing';

describe('Action Replay Protection', () => {
  const mockCtx = createMockSecurityContext();

  it('should allow if no token is provided (currently optional)', async () => {
    await expect(
      validateReplayToken(undefined, mockCtx),
    ).resolves.not.toThrow();
  });

  it('should allow valid token', async () => {
    const validToken = `${Date.now()}|nonce`;
    await expect(
      validateReplayToken(validToken, mockCtx),
    ).resolves.not.toThrow();
  });

  it('should throw if token is expired', async () => {
    const expiredToken = `${Date.now() - 10 * 60 * 1000}|nonce`;
    await expect(validateReplayToken(expiredToken, mockCtx)).rejects.toThrow(
      'Action expired',
    );
  });

  it('should throw if token is in the future too far', async () => {
    const futureToken = `${Date.now() + 10 * 60 * 1000}|nonce`;
    await expect(validateReplayToken(futureToken, mockCtx)).rejects.toThrow(
      'Action expired',
    );
  });

  it('should throw if timestamp is invalid', async () => {
    await expect(validateReplayToken('invalid|nonce', mockCtx)).rejects.toThrow(
      'Action expired',
    );
  });
});
