import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Durable fixed-window counters for security-critical rate limiting (SEC-42).
 *
 * This table is the **secondary** store: it is only written when the primary
 * (Upstash) is unreachable. Under normal operation it stays empty, so the
 * write cost does not land on the authentication hot path.
 *
 * Fixed window rather than sliding: a sliding window needs the individual
 * request timestamps, which turns one row per identifier-window into one row
 * per request -- unnecessary write amplification for a store whose entire job
 * is to survive an outage of the good implementation. The window boundary is
 * part of the primary key, so a new window is a new row and the increment
 * stays a single atomic upsert.
 */
export const rateLimitCountersTable = pgTable(
  'rate_limit_counters',
  {
    identifier: text('identifier').notNull(),
    /**
     * Start of the fixed window this row counts, floored to the window size.
     * Part of the primary key, so `ON CONFLICT` targets exactly one window
     * and concurrent increments serialise on that row rather than racing.
     */
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    /** When this row stops being meaningful and may be purged. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({
      name: 'pk_rate_limit_counters',
      columns: [t.identifier, t.windowStart],
    }),
    index('idx_rate_limit_counters_expires_at').on(t.expiresAt),
  ],
);
