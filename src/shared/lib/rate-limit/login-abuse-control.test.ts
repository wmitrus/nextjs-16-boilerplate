import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockEnv, resetEnvMocks } from '@/testing/infrastructure/env';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  pttl: vi.fn(),
  incr: vi.fn(),
  pexpire: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return {
      get: mocks.get,
      pttl: mocks.pttl,
      incr: mocks.incr,
      pexpire: mocks.pexpire,
      del: mocks.del,
    };
  }),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(function () {
      return { limit: vi.fn() };
    }),
    { slidingWindow: vi.fn() },
  ),
}));

function setUpstashConfigured() {
  mockEnv.NODE_ENV = 'production';
  mockEnv.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  mockEnv.UPSTASH_REDIS_REST_TOKEN = 'test-token';
}

describe('login-abuse-control', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetEnvMocks();
    mockEnv.LOGIN_ABUSE_WINDOW = '30 m';
    mockEnv.LOGIN_ABUSE_CAPTCHA_THRESHOLD = 3;
    mockEnv.LOGIN_ABUSE_DELAY_THRESHOLD = 8;
    mockEnv.LOGIN_ABUSE_LOCK_THRESHOLD = 15;
  });

  describe('normalizeLoginAccountKey', () => {
    it('is stable and case/whitespace-insensitive', async () => {
      const { normalizeLoginAccountKey } =
        await import('./login-abuse-control');

      expect(normalizeLoginAccountKey('User@Example.com')).toBe(
        normalizeLoginAccountKey('  user@example.com  '),
      );
    });

    it('never returns the raw email', async () => {
      const { normalizeLoginAccountKey } =
        await import('./login-abuse-control');

      expect(normalizeLoginAccountKey('user@example.com')).not.toContain(
        'user@example.com',
      );
    });
  });

  describe('local fallback (no Upstash configured)', () => {
    it('starts at zero failed attempts with no gates active', async () => {
      const { getLoginAbuseState } = await import('./login-abuse-control');

      const state = await getLoginAbuseState('acct-1');

      expect(state).toEqual({
        failedAttempts: 0,
        requiresCaptcha: false,
        progressiveDelayMs: 0,
        lockedUntil: null,
      });
    });

    it('requires captcha once the captcha threshold is reached', async () => {
      const { recordFailedLoginAttempt } =
        await import('./login-abuse-control');

      let state;
      for (let i = 0; i < 3; i++) {
        state = await recordFailedLoginAttempt('acct-captcha');
      }

      expect(state?.failedAttempts).toBe(3);
      expect(state?.requiresCaptcha).toBe(true);
      expect(state?.progressiveDelayMs).toBe(0);
      expect(state?.lockedUntil).toBeNull();
    });

    it('applies an increasing progressive delay once the delay threshold is reached', async () => {
      const { recordFailedLoginAttempt } =
        await import('./login-abuse-control');

      let state;
      for (let i = 0; i < 8; i++) {
        state = await recordFailedLoginAttempt('acct-delay');
      }
      expect(state?.progressiveDelayMs).toBe(2000);

      state = await recordFailedLoginAttempt('acct-delay'); // 9th
      expect(state?.progressiveDelayMs).toBe(4000);

      state = await recordFailedLoginAttempt('acct-delay'); // 10th
      expect(state?.progressiveDelayMs).toBe(8000);
    });

    it('caps the progressive delay so a single attempt can never hang indefinitely', async () => {
      const { recordFailedLoginAttempt } =
        await import('./login-abuse-control');

      let state;
      for (let i = 0; i < 20; i++) {
        state = await recordFailedLoginAttempt('acct-cap');
      }

      expect(state?.progressiveDelayMs).toBeLessThanOrEqual(10_000);
    });

    it('locks the account once the lock threshold is reached', async () => {
      const { recordFailedLoginAttempt, getLoginAbuseState } =
        await import('./login-abuse-control');

      let state;
      for (let i = 0; i < 15; i++) {
        state = await recordFailedLoginAttempt('acct-lock');
      }

      expect(state?.lockedUntil).toBeInstanceOf(Date);
      expect(state?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

      // A fresh read (no new failure recorded) must still report the lock.
      const readOnly = await getLoginAbuseState('acct-lock');
      expect(readOnly.lockedUntil).toBeInstanceOf(Date);
    });

    it('resets the failure count on a successful login', async () => {
      const {
        recordFailedLoginAttempt,
        recordSuccessfulLogin,
        getLoginAbuseState,
      } = await import('./login-abuse-control');

      await recordFailedLoginAttempt('acct-reset');
      await recordFailedLoginAttempt('acct-reset');
      await recordSuccessfulLogin('acct-reset');

      const state = await getLoginAbuseState('acct-reset');
      expect(state.failedAttempts).toBe(0);
      expect(state.requiresCaptcha).toBe(false);
    });

    it('keeps separate accounts fully independent', async () => {
      const { recordFailedLoginAttempt, getLoginAbuseState } =
        await import('./login-abuse-control');

      await recordFailedLoginAttempt('acct-a');
      await recordFailedLoginAttempt('acct-a');
      await recordFailedLoginAttempt('acct-a');

      const stateB = await getLoginAbuseState('acct-b');
      expect(stateB.failedAttempts).toBe(0);
      expect(stateB.requiresCaptcha).toBe(false);
    });
  });

  describe('Upstash-backed (production, configured)', () => {
    beforeEach(() => {
      setUpstashConfigured();
    });

    it('reads state via get + pttl without incrementing', async () => {
      mocks.get.mockResolvedValue(5);
      mocks.pttl.mockResolvedValue(120_000);

      const { getLoginAbuseState } = await import('./login-abuse-control');
      const state = await getLoginAbuseState('acct-1');

      expect(mocks.get).toHaveBeenCalledWith('login-abuse:account:acct-1');
      expect(mocks.incr).not.toHaveBeenCalled();
      expect(state.failedAttempts).toBe(5);
      expect(state.requiresCaptcha).toBe(true);
    });

    it('treats a missing key as zero failed attempts', async () => {
      mocks.get.mockResolvedValue(null);
      mocks.pttl.mockResolvedValue(-2); // Upstash: key does not exist

      const { getLoginAbuseState } = await import('./login-abuse-control');
      const state = await getLoginAbuseState('acct-missing');

      expect(state.failedAttempts).toBe(0);
      expect(state.lockedUntil).toBeNull();
    });

    it('increments and refreshes the TTL on a failed attempt', async () => {
      mocks.incr.mockResolvedValue(4);

      const { recordFailedLoginAttempt } =
        await import('./login-abuse-control');
      const state = await recordFailedLoginAttempt('acct-1');

      expect(mocks.incr).toHaveBeenCalledWith('login-abuse:account:acct-1');
      expect(mocks.pexpire).toHaveBeenCalledWith(
        'login-abuse:account:acct-1',
        30 * 60 * 1000,
      );
      expect(state.failedAttempts).toBe(4);
      expect(state.requiresCaptcha).toBe(true);
    });

    it('deletes the key on a successful login', async () => {
      const { recordSuccessfulLogin } = await import('./login-abuse-control');
      await recordSuccessfulLogin('acct-1');

      expect(mocks.del).toHaveBeenCalledWith('login-abuse:account:acct-1');
    });

    it('falls back to local state when a Redis read fails', async () => {
      mocks.get.mockRejectedValue(new Error('ECONNRESET'));
      mocks.pttl.mockRejectedValue(new Error('ECONNRESET'));

      const { getLoginAbuseState } = await import('./login-abuse-control');
      const state = await getLoginAbuseState('acct-redis-down');

      expect(state.failedAttempts).toBe(0);
      expect(state.lockedUntil).toBeNull();
    });

    it('falls back to local state when a Redis write fails', async () => {
      mocks.incr.mockRejectedValue(new Error('ECONNRESET'));

      const { recordFailedLoginAttempt } =
        await import('./login-abuse-control');
      const state = await recordFailedLoginAttempt('acct-redis-write-down');

      expect(state.failedAttempts).toBe(1);
    });

    it('reports lockedUntil derived from the real remaining TTL', async () => {
      mocks.get.mockResolvedValue(20);
      mocks.pttl.mockResolvedValue(600_000); // 10 minutes remaining

      const { getLoginAbuseState } = await import('./login-abuse-control');
      const state = await getLoginAbuseState('acct-locked');

      expect(state.lockedUntil).toBeInstanceOf(Date);
      const msUntilUnlock = state.lockedUntil!.getTime() - Date.now();
      expect(msUntilUnlock).toBeGreaterThan(590_000);
      expect(msUntilUnlock).toBeLessThanOrEqual(600_000);
    });
  });
});
