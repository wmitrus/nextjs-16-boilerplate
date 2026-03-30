import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenantsReferenceTable } from '@/core/db/schema/references';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
]);

export const subscriptionsTable = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenantsReferenceTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerSubscriptionId: text('provider_subscription_id').notNull(),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('unique_provider_subscription').on(
      t.provider,
      t.providerSubscriptionId,
    ),
    index('idx_subscriptions_tenant').on(t.tenantId),
    index('idx_subscriptions_status').on(t.status),
  ],
);
