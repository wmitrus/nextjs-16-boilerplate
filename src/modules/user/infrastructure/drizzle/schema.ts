import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    email: text('email').unique().notNull(),
    onboardingComplete: boolean('onboarding_complete').notNull().default(false),
    displayName: text('display_name'),
    locale: text('locale'),
    timezone: text('timezone'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_users_email').on(t.email)],
);
