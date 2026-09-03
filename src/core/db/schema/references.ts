import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const usersReferenceTable = pgTable('users', {
  id: uuid('id').primaryKey(),
});

export const tenantsReferenceTable = pgTable('tenants', {
  id: uuid('id').primaryKey(),
});

/**
 * Read-only reference to the `organizations` table (owned by the
 * `authorization` module). Carries `id` (for FK targets) plus `tenant_id`,
 * the authoritative strict-1:N parent tenant of an organization
 * (`organizations.tenant_id`, `NOT NULL`, immutable — OZI-71). `tenant_id` is
 * here so another module can bind the full canonical organization scope tuple
 * (`organizationId` AND `tenantId`) inside a single SQL statement without
 * importing `authorization`'s real Drizzle schema — the `user` module's admin
 * surface uses it to reject an internally inconsistent `DataScope`
 * (OZI-71 Slice 4B; see SEC-26 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`).
 * Never migrated (excluded from the `drizzle-kit` schema glob), only queried.
 */
export const organizationsReferenceTable = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
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

/**
 * Read-only reference to the `auth_organization_identities` table (owned by the
 * `auth` module): `(provider, external_org_id)` -> internal `organization_id`.
 * Carries just the three columns another module / a migration script needs to
 * resolve a legacy external-organization string to every internal organization
 * it authoritatively maps to — across ALL providers, since historical data does
 * not record which provider produced the value (OZI-71 FF·C, plan §14a.10 Case
 * G). Read-only, never migrated (excluded from the `drizzle-kit` schema glob).
 */
export const authOrganizationIdentitiesReferenceTable = pgTable(
  'auth_organization_identities',
  {
    provider: text('provider').notNull(),
    externalOrgId: text('external_org_id').notNull(),
    organizationId: uuid('organization_id').notNull(),
  },
);
