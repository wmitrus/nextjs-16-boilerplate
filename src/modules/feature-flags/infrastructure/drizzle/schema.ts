import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const featureFlagsTable = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    tenantId: text('tenant_id'),
    enabled: boolean('enabled').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_feature_flags_key_tenant')
      .on(t.key, t.tenantId)
      .nullsNotDistinct(),
    index('idx_feature_flags_key').on(t.key),
  ],
);
