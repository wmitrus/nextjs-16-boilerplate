export interface DurableRateLimitHit {
  readonly count: number;
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

export interface DurableRateLimitStore {
  increment(
    identifier: string,
    windowMs: number,
    now?: Date,
  ): Promise<DurableRateLimitHit>;

  purgeExpired(identifier: string, now?: Date): Promise<void>;
}
