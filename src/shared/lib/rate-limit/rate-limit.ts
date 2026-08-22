import { Ratelimit } from '@upstash/ratelimit';
import type { Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { env } from '@/core/env';

/**
 * Initialize Upstash Redis client if credentials are provided.
 */
const shouldUseUpstashRateLimit =
  env.NODE_ENV === 'production' &&
  Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

/**
 * Shared Redis client, reused by any module that needs raw Redis commands
 * (not just the sliding-window `Ratelimit` abstraction below) -- e.g.
 * `login-abuse-control.ts`'s failure counters. `undefined` outside
 * production or when Upstash credentials aren't configured; callers must
 * fall back to an in-memory equivalent in that case, same as `apiRateLimit`.
 */
export const redis = shouldUseUpstashRateLimit
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : undefined;

/**
 * Production rate limiter using Upstash Redis.
 * Uses the Sliding Window algorithm.
 */
export const apiRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        env.API_RATE_LIMIT_REQUESTS,
        env.API_RATE_LIMIT_WINDOW as Duration,
      ),
      analytics: true,
      prefix: 'ratelimit:api',
    })
  : undefined;

/**
 * Result interface for consistent rate limit feedback.
 */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}

/**
 * Checks the rate limit using the distributed Upstash limiter.
 *
 * @param identifier - Unique identifier for the client (e.g., IP)
 * @returns RateLimitResult
 */
export async function checkUpstashRateLimit(
  identifier: string,
): Promise<RateLimitResult> {
  if (!apiRateLimit) {
    throw new Error('Upstash Rate Limiter is not configured');
  }

  const result = await apiRateLimit.limit(identifier);

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: new Date(result.reset),
  };
}
