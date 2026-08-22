import { createHash } from 'node:crypto';

import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';

import { redis } from './rate-limit';
import { parseDurationToMs } from './rate-limit-helper';

const REDIS_KEY_PREFIX = 'login-abuse:account:';

let _logger:
  | ReturnType<ReturnType<typeof resolveServerLogger>['child']>
  | undefined;

function getLogger() {
  if (_logger) return _logger;
  _logger = resolveServerLogger().child({
    type: 'API',
    category: 'auth',
    module: 'login-abuse-control',
  });
  return _logger;
}

/**
 * Progressive state derived from an account's recent consecutive failed
 * login attempts. Crossing each threshold escalates the response instead of
 * a single flat cutoff -- see SEC-34 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`.
 */
export interface LoginAbuseState {
  readonly failedAttempts: number;
  /** `true` once `failedAttempts >= LOGIN_ABUSE_CAPTCHA_THRESHOLD`. */
  readonly requiresCaptcha: boolean;
  /** Milliseconds to artificially delay the response by, or `0`. */
  readonly progressiveDelayMs: number;
  /** Set once `failedAttempts >= LOGIN_ABUSE_LOCK_THRESHOLD`; `null` otherwise. */
  readonly lockedUntil: Date | null;
}

/**
 * Normalizes an email into the key used for both the failure counter and
 * (previously) the sign-in identifier rate limit -- lowercased, trimmed,
 * then SHA-256 hashed so raw emails never appear in Redis keys or logs.
 */
export function normalizeLoginAccountKey(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/** 2s, 4s, 8s, ... capped so a single login attempt never hangs too long. */
const MAX_PROGRESSIVE_DELAY_MS = 10_000;
const BASE_PROGRESSIVE_DELAY_MS = 2_000;

function computeProgressiveDelayMs(failedAttempts: number): number {
  if (failedAttempts < env.LOGIN_ABUSE_DELAY_THRESHOLD) {
    return 0;
  }

  const stepsOverThreshold = failedAttempts - env.LOGIN_ABUSE_DELAY_THRESHOLD;
  const delayMs = BASE_PROGRESSIVE_DELAY_MS * 2 ** stepsOverThreshold;
  return Math.min(delayMs, MAX_PROGRESSIVE_DELAY_MS);
}

function deriveState(
  failedAttempts: number,
  remainingWindowMs: number | null,
): LoginAbuseState {
  const isLocked = failedAttempts >= env.LOGIN_ABUSE_LOCK_THRESHOLD;

  return {
    failedAttempts,
    requiresCaptcha: failedAttempts >= env.LOGIN_ABUSE_CAPTCHA_THRESHOLD,
    progressiveDelayMs: computeProgressiveDelayMs(failedAttempts),
    lockedUntil:
      isLocked && remainingWindowMs !== null
        ? new Date(Date.now() + remainingWindowMs)
        : null,
  };
}

// --- In-memory fallback (local dev / test, no Upstash configured) ---------

interface LocalFailureBucket {
  count: number;
  expiresAt: number;
}

const localFailureBuckets = new Map<string, LocalFailureBucket>();

function localReadBucket(accountKey: string): LocalFailureBucket | null {
  const bucket = localFailureBuckets.get(accountKey);
  if (!bucket || bucket.expiresAt <= Date.now()) {
    return null;
  }
  return bucket;
}

function localRecordFailure(accountKey: string, windowMs: number): number {
  const existing = localReadBucket(accountKey);
  const count = (existing?.count ?? 0) + 1;
  localFailureBuckets.set(accountKey, {
    count,
    expiresAt: Date.now() + windowMs,
  });
  return count;
}

// --- Public API -------------------------------------------------------------

/**
 * Reads the current abuse state for an account WITHOUT recording a new
 * attempt. Callers must check this (specifically `lockedUntil`) before doing
 * any credential-comparison work, so a locked-out account never reaches
 * bcrypt at all.
 */
export async function getLoginAbuseState(
  accountKey: string,
): Promise<LoginAbuseState> {
  if (redis) {
    try {
      const key = `${REDIS_KEY_PREFIX}${accountKey}`;
      const [rawCount, ttlMs] = await Promise.all([
        redis.get<number>(key),
        redis.pttl(key),
      ]);
      const failedAttempts = rawCount ?? 0;
      return deriveState(failedAttempts, ttlMs > 0 ? ttlMs : null);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      getLogger().warn(
        {
          event: 'login_abuse:redis_read_failed',
          errorMessage: err.message,
          errorName: err.name,
        },
        'Login abuse Redis read failed, falling back to local state',
      );
      // fall through to local
    }
  }

  const bucket = localReadBucket(accountKey);
  return deriveState(
    bucket?.count ?? 0,
    bucket ? bucket.expiresAt - Date.now() : null,
  );
}

/**
 * Records a failed login attempt and returns the resulting state. The
 * rolling window is refreshed (extended) on every failure, so a
 * continuously-attacked account stays escalated; it only resets after
 * `LOGIN_ABUSE_WINDOW` of no further failures.
 */
export async function recordFailedLoginAttempt(
  accountKey: string,
): Promise<LoginAbuseState> {
  const windowMs = parseDurationToMs(env.LOGIN_ABUSE_WINDOW);

  if (redis) {
    try {
      const key = `${REDIS_KEY_PREFIX}${accountKey}`;
      const failedAttempts = await redis.incr(key);
      await redis.pexpire(key, windowMs);
      return deriveState(failedAttempts, windowMs);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      getLogger().warn(
        {
          event: 'login_abuse:redis_write_failed',
          errorMessage: err.message,
          errorName: err.name,
        },
        'Login abuse Redis write failed, falling back to local state',
      );
      // fall through to local
    }
  }

  const failedAttempts = localRecordFailure(accountKey, windowMs);
  return deriveState(failedAttempts, windowMs);
}

/** Resets the failure counter -- call on every successful login. */
export async function recordSuccessfulLogin(accountKey: string): Promise<void> {
  if (redis) {
    try {
      await redis.del(`${REDIS_KEY_PREFIX}${accountKey}`);
      return;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      getLogger().warn(
        {
          event: 'login_abuse:redis_reset_failed',
          errorMessage: err.message,
          errorName: err.name,
        },
        'Login abuse Redis reset failed, clearing local state only',
      );
      // fall through to local
    }
  }

  localFailureBuckets.delete(accountKey);
}
