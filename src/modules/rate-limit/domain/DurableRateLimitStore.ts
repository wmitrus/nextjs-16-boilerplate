/**
 * The outcome of one durable rate-limit increment.
 *
 * Mirrors the shape the rest of the rate-limit code already speaks
 * (`RateLimitResult`), so a caller does not have to know which store
 * answered.
 */
export interface DurableRateLimitHit {
  readonly count: number;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

/**
 * A rate-limit counter that survives the process it was written from.
 *
 * "Durable" here means specifically **shared across serverless instances** --
 * the property a process-local `Map` lacks and the reason it cannot stand in
 * for Redis on a security-critical path (SEC-42). A store that is merely
 * persistent within one instance does not satisfy this contract.
 *
 * Implementations must increment atomically: a read-then-write pair loses
 * counts under concurrency, which on an abuse-control path means the attacker
 * gets the extra attempts.
 */
export interface DurableRateLimitStore {
  /**
   * Atomically records one hit for `identifier` in the fixed window
   * containing `now`, returning the resulting count.
   *
   * Throws if the store is unreachable. The caller decides what an
   * unreachable durable store means -- in strict mode it means failing
   * closed, which is not a decision this layer should make on its own.
   */
  increment(
    identifier: string,
    windowMs: number,
    now?: Date,
  ): Promise<DurableRateLimitHit>;
}

/**
 * Floors `now` to the start of the fixed window of length `windowMs`.
 *
 * Exported because both the store and its tests need the same boundary maths;
 * a test that computes the boundary differently from the code proves nothing.
 */
export function windowStartFor(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}
