import { Ratelimit } from '@upstash/ratelimit';
import type { Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { env } from '@/core/env';

/**
 * Initialize Upstash Redis client if credentials are provided.
 */
const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
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
