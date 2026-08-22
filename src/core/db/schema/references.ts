import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const usersReferenceTable = pgTable('users', {
  id: uuid('id').primaryKey(),
});

export const tenantsReferenceTable = pgTable('tenants', {
  id: uuid('id').primaryKey(),
});

export const organizationsReferenceTable = pgTable('organizations', {
  id: uuid('id').primaryKey(),
});

/**
 * Read-only join reference to the `memberships` table (owned by the
 * `authorization` module). Carries only the two columns needed to test
 * "does this user belong to this organization/tenant" from another module,
 * without importing `authorization`'s real Drizzle schema — mirrors
 * `usersReferenceTable` / `organizationsReferenceTable` above, just for the
 * join table instead of a FK target. Used by the `user` module's admin
 * surface to scope cross-user queries to the caller's own tenant in the same
 * SQL predicate as the read/mutation (see SEC-26 in
 * `docs/ai/general/SECURITY_CODING_PATTERNS.md`).
 */
export const membershipsReferenceTable = pgTable('memberships', {
  userId: uuid('user_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
});
