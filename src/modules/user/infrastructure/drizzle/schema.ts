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
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    /**
     * Any session issued before this instant is no longer accepted. Set to
     * NOW() by account-security events (today: a completed password reset)
     * so that stateless, long-lived JWTs stop being usable immediately
     * rather than lingering until they expire on their own. Compared
     * against the JWT's own `iat` claim by both central access evaluators.
     * NULL means "nothing has ever been revoked for this user". See SEC-36.
     */
    sessionsValidFrom: timestamp('sessions_valid_from', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_users_email').on(t.email)],
);
