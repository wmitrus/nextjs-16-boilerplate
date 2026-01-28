export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
}

/**
 * In-memory storage for rate limiting buckets.
 * Key: identifier (IP/UserID)
 * Value: Array of timestamps of recent requests
 */
const buckets = new Map<string, number[]>();

/**
 * Simple in-memory rate limiter for local development and testing.
 *
 * @param identifier - Unique identifier for the client (e.g., IP)
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns RateLimitResult
 */
export async function localRateLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = buckets.get(identifier) || [];

  // Filter out expired timestamps
  const recentRequests = bucket.filter(
    (timestamp) => timestamp > now - windowMs,
  );

  if (recentRequests.length >= limit) {
    // Find the oldest request in the window to calculate reset time
    const oldestRequest = recentRequests[0]!;
    return {
      success: false,
      limit,
      remaining: 0,
      reset: new Date(oldestRequest + windowMs),
    };
  }

  // Add current request timestamp
  recentRequests.push(now);
  buckets.set(identifier, recentRequests);

  return {
    success: true,
    limit,
    remaining: limit - recentRequests.length,
    reset: new Date(now + windowMs),
  };
}
