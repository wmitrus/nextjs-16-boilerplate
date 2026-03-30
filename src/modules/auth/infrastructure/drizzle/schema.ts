import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  tenantsReferenceTable,
  usersReferenceTable,
} from '@/core/db/schema/references';

export const authUserIdentitiesTable = pgTable(
  'auth_user_identities',
  {
    provider: text('provider').notNull(),
    externalUserId: text('external_user_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.externalUserId] }),
    index('idx_auth_user_identities_user').on(t.userId),
  ],
);

export const authTenantIdentitiesTable = pgTable(
  'auth_tenant_identities',
  {
    provider: text('provider').notNull(),
    externalTenantId: text('external_tenant_id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenantsReferenceTable.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.externalTenantId] }),
    index('idx_auth_tenant_identities_tenant').on(t.tenantId),
  ],
);
