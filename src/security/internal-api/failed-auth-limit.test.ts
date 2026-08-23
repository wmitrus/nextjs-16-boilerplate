/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redis: {
    get: vi.fn(),
    incr: vi.fn(),
    pexpire: vi.fn(),
    del: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>> | undefined,
}));

vi.mock('@/shared/lib/rate-limit/rate-limit', () => ({
  get redis() {
    return mocks.redis;
  },
}));

vi.mock('@/core/logger/di-edge', async () => {
  const testing = await import('@/testing');
  return { resolveEdgeLogger: () => testing.mockLogger };
});

import {
  clearFailedAuthAttempts,
  FAILED_ATTEMPT_LIMIT,
  getFailedAuthState,
  recordFailedAuthAttempt,
} from './failed-auth-limit';

const durable = {
  get: vi.fn(),
  incr: vi.fn(),
  pexpire: vi.fn(),
  del: vi.fn(),
};

describe('internal-API failed-auth limiter (SEC-44)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redis = durable;
    durable.get.mockResolvedValue(0);
    durable.incr.mockResolvedValue(1);
    durable.pexpire.mockResolvedValue(1);
    durable.del.mockResolvedValue(1);
  });

  it('is not locked out below the limit', async () => {
    durable.get.mockResolvedValue(FAILED_ATTEMPT_LIMIT - 1);

    await expect(getFailedAuthState('client-a')).resolves.toEqual({
      lockedOut: false,
      degraded: false,
    });
  });

  it('locks out at the limit', async () => {
    durable.get.mockResolvedValue(FAILED_ATTEMPT_LIMIT);

    await expect(getFailedAuthState('client-a')).resolves.toEqual({
      lockedOut: true,
      degraded: false,
    });
  });

  it('treats a never-seen client as unmetered rather than locked out', async () => {
    durable.get.mockResolvedValue(null);

    await expect(getFailedAuthState('fresh')).resolves.toEqual({
      lockedOut: false,
      degraded: false,
    });
  });

  it('refreshes the window on every rejection', async () => {
    // A rolling window, not a fixed one: a client that keeps guessing stays
    // locked out instead of being released on a schedule they can wait out.
    await recordFailedAuthAttempt('client-a');

    expect(durable.incr).toHaveBeenCalledWith('internal-api:failed:client-a');
    expect(durable.pexpire).toHaveBeenCalledWith(
      'internal-api:failed:client-a',
      expect.any(Number),
    );
  });

  it('clears the counter on success', async () => {
    await clearFailedAuthAttempts('client-a');
    expect(durable.del).toHaveBeenCalledWith('internal-api:failed:client-a');
  });

  describe('when the durable counter is unavailable', () => {
    it('reports degraded and does NOT lock out a correct key', async () => {
      // The deliberate asymmetry with SEC-42, asserted so it cannot be
      // "tidied" into a fail-closed later without someone reading why:
      // /api/internal/health exists to be called during an incident, so
      // denying a correct key because Redis is down would remove the
      // operator's diagnostic exactly when they need it. The key check itself
      // is unaffected, so this weakens brute-force protection rather than
      // admitting anyone.
      mocks.redis = undefined;

      await expect(getFailedAuthState('client-a')).resolves.toEqual({
        lockedOut: false,
        degraded: true,
      });
    });

    it('reports degraded when the read throws', async () => {
      durable.get.mockRejectedValue(new Error('redis down'));

      await expect(getFailedAuthState('client-a')).resolves.toEqual({
        lockedOut: false,
        degraded: true,
      });
    });

    it('does not throw out of a failed write', async () => {
      durable.incr.mockRejectedValue(new Error('redis down'));

      await expect(
        recordFailedAuthAttempt('client-a'),
      ).resolves.toBeUndefined();
    });

    it('does not throw out of a failed clear', async () => {
      durable.del.mockRejectedValue(new Error('redis down'));

      await expect(
        clearFailedAuthAttempts('client-a'),
      ).resolves.toBeUndefined();
    });
  });
});
