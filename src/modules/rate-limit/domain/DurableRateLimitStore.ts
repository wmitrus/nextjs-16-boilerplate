export type {
  DurableRateLimitHit,
  DurableRateLimitStore,
} from '@/core/contracts/rate-limit';

/**
 * Floors `now` to the start of the fixed window of length `windowMs`.
 *
 * Exported because both the store and its tests need the same boundary maths;
 * a test that computes the boundary differently from the code proves nothing.
 */
export function windowStartFor(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}
