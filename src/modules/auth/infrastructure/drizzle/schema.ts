import {
  boolean,
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

export const userCredentialsTable = pgTable(
  'user_credentials',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    hashedPassword: text('hashed_password').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_user_credentials_email').on(t.email)],
);

export const passwordResetTokensTable = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_password_reset_tokens_user').on(t.userId),
    index('idx_password_reset_tokens_hash').on(t.tokenHash),
  ],
);

export const emailVerificationTokensTable = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_email_verification_tokens_user').on(t.userId),
    index('idx_email_verification_tokens_hash').on(t.tokenHash),
  ],
);
