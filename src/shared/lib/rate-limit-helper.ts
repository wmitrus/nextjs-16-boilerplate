import { env } from '@/core/env';

import { apiRateLimit, checkUpstashRateLimit } from './rate-limit';
import { localRateLimit } from './rate-limit-local';
import type { RateLimitResult } from './rate-limit-local';

/**
 * Parses the duration string (e.g., "60 s") into milliseconds.
 * Supports "s", "m", "h", "d".
 *
 * @param duration - Duration string from env
 * @returns milliseconds
 */
export function parseDurationToMs(duration: string): number {
  const [value, unit] = duration.trim().split(/\s+/);
  const numValue = parseInt(value!, 10);

  switch (unit?.toLowerCase()) {
    case 's':
    case 'sec':
    case 'second':
    case 'seconds':
      return numValue * 1000;
    case 'm':
    case 'min':
    case 'minute':
    case 'minutes':
      return numValue * 60 * 1000;
    case 'h':
    case 'hr':
    case 'hour':
    case 'hours':
      return numValue * 60 * 60 * 1000;
    case 'd':
    case 'day':
    case 'days':
      return numValue * 24 * 60 * 60 * 1000;
    default:
      return numValue * 1000; // Default to seconds
  }
}

/**
 * Unified helper to check rate limits across different environments.
 * Automatically switches between Upstash (production) and In-memory (local).
 *
 * @param identifier - Unique identifier for the client (e.g., IP)
 * @returns RateLimitResult
 */
export async function checkRateLimit(
  identifier: string,
): Promise<RateLimitResult> {
  // If Upstash is configured and available, use it (Production)
  if (apiRateLimit) {
    return checkUpstashRateLimit(identifier);
  }

  // Fallback to local in-memory rate limiting (Development/Test)
  const windowMs = parseDurationToMs(env.API_RATE_LIMIT_WINDOW);
  return localRateLimit(identifier, env.API_RATE_LIMIT_REQUESTS, windowMs);
}
