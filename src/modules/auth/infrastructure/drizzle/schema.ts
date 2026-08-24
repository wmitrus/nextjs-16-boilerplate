import {
  boolean,
  index,
  integer,
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

/**
 * Enrolled TOTP authenticator for an AuthJS (Credentials) account (SEC-48).
 *
 * Auth-module state, deliberately: whether an account has a second factor is
 * a fact about its credentials, not about its roles. Nothing here knows what
 * the account is allowed to do -- the admin gate asks this table "is this
 * account enrolled?" and answers the authorization question elsewhere.
 *
 * Clerk accounts have no row here: Clerk owns their factors, and
 * `ClerkMfaService` asks Clerk.
 */
export const userMfaTotpTable = pgTable('user_mfa_totp', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
  /**
   * The TOTP seed, AES-256-GCM encrypted (SEC-48). Never plaintext: a
   * verifier must be able to regenerate codes from the seed, so unlike a
   * password it cannot be stored as a hash -- which makes a database dump
   * alone enough to clone every admin's authenticator unless it is
   * encrypted with a key that lives outside the database.
   *
   * Format `v1.<keyId>.<nonce>.<ciphertext||tag>`; see
   * `src/core/security/envelope-encryption.ts`.
   */
  secretEnvelope: text('secret_envelope').notNull(),
  /**
   * NULL means enrollment was started but never confirmed with a real code.
   * A pending row must never satisfy an enrollment check -- that is the
   * difference between "has a second factor" and "once opened the setup page".
   */
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  /**
   * Highest RFC 6238 time step already accepted for this account, so a code
   * cannot be replayed for the rest of its 30-second life. Without it, one
   * observed code satisfies every challenge inside its window.
   */
  lastUsedTimeStep: integer('last_used_time_step'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Single-use MFA recovery codes (SEC-48).
 *
 * Each code is `<codeId>-<secret>`: `codeId` is a public lookup handle and
 * `secret` is the credential. Splitting them is what keeps verification at
 * exactly one Argon2id call -- the id selects one row, instead of the
 * verifier having to try the stored hash of every unused code.
 *
 * The secret is hashed with the same Argon2id parameters as passwords
 * (SEC-47): NIST SP 800-63B requires look-up secrets below 112 bits of
 * entropy to be stored under a password hashing scheme, and these are
 * deliberately short enough for a human to transcribe.
 */
export const userMfaRecoveryCodesTable = pgTable(
  'user_mfa_recovery_codes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReferenceTable.id, { onDelete: 'cascade' }),
    codeId: text('code_id').notNull(),
    secretHash: text('secret_hash').notNull(),
    /** Set exactly once, in the same statement that claims the code. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.codeId] }),
    index('idx_user_mfa_recovery_codes_user').on(t.userId),
  ],
);
