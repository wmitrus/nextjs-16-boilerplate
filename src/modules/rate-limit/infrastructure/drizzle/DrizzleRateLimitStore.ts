import { and, eq, lte, sql } from 'drizzle-orm';

import type { DrizzleDb } from '@/core/db/types';

import type {
  DurableRateLimitHit,
  DurableRateLimitStore,
} from '../../domain/DurableRateLimitStore';
import { windowStartFor } from '../../domain/DurableRateLimitStore';

import { rateLimitCountersTable } from './schema';

/**
 * Postgres-backed durable counter (SEC-42).
 *
 * The increment is a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.
 * That matters: `SELECT` then `UPDATE` would lose increments whenever two
 * requests for the same identifier overlap, and on an abuse-control path a
 * lost increment is a free attempt for the attacker. The upsert serialises
 * concurrent writers on the primary-key row and every one of them sees a
 * distinct, monotonically increasing count.
 */
export class DrizzleRateLimitStore implements DurableRateLimitStore {
  constructor(private readonly db: DrizzleDb) {}

  async increment(
    identifier: string,
    windowMs: number,
    now: Date = new Date(),
  ): Promise<DurableRateLimitHit> {
    const windowStart = windowStartFor(now, windowMs);
    const windowEnd = new Date(windowStart.getTime() + windowMs);

    const rows = await this.db
      .insert(rateLimitCountersTable)
      .values({
        identifier,
        windowStart,
        expiresAt: windowEnd,
        count: 1,
      })
      .onConflictDoUpdate({
        target: [
          rateLimitCountersTable.identifier,
          rateLimitCountersTable.windowStart,
        ],
        set: { count: sql`${rateLimitCountersTable.count} + 1` },
      })
      .returning();

    const count = rows[0]?.count;
    if (count === undefined) {
      // Cannot happen with RETURNING on an upsert, but a silent `0` here
      // would read as "no hits yet" and hand out an unlimited allowance.
      throw new Error(
        '[DrizzleRateLimitStore] Upsert returned no row; refusing to report a count',
      );
    }

    return { count, windowStart, windowEnd };
  }

  /**
   * Drops this identifier's expired windows.
   *
   * Scoped to one identifier and driven by the caller rather than run as a
   * global sweep: this table is only written during a primary-store outage,
   * so it is normally empty and does not justify a scheduled job. Bounding
   * growth per identifier is enough to keep an outage from accumulating rows
   * indefinitely for repeat callers. A global purge is tracked separately.
   */
  async purgeExpired(
    identifier: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.db
      .delete(rateLimitCountersTable)
      .where(
        and(
          eq(rateLimitCountersTable.identifier, identifier),
          lte(rateLimitCountersTable.expiresAt, now),
        ),
      );
  }
}
