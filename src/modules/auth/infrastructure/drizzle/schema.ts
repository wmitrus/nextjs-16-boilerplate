import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  organizationsReferenceTable,
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

export const authOrganizationIdentitiesTable = pgTable(
  'auth_organization_identities',
  {
    provider: text('provider').notNull(),
    externalOrgId: text('external_org_id').notNull(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizationsReferenceTable.id, {
        onDelete: 'cascade',
      }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.externalOrgId] }),
    index('idx_auth_org_identities_org').on(t.organizationId),
  ],
);
