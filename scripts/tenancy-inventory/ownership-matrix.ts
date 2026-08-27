/**
 * OZI-75: static table-ownership matrix and identifier-semantics inventory,
 * built by inspecting the live Drizzle schema (`src/modules/*\/infrastructure/drizzle/schema.ts`,
 * `src/core/db/schema/references.ts`) on the branch this tool ships on.
 * Pure data -- no DB connection, no side effects. Re-derive by hand when the
 * schema changes; this is a Phase 0 audit artifact, not a generated report.
 */

export type Owner = 'platform' | 'tenant' | 'organization' | 'ambiguous';

export interface TableOwnership {
  readonly table: string;
  readonly module: string;
  readonly owner: Owner;
  /** The column carrying the scope, or null when the table has none. */
  readonly scopeColumn: string | null;
  readonly rationale: string;
}

export const TABLE_OWNERSHIP: readonly TableOwnership[] = [
  // authorization module
  {
    table: 'tenants',
    module: 'authorization',
    owner: 'platform',
    scopeColumn: null,
    rationale: 'Root entity; every other tenant-scoped table hangs off this.',
  },
  {
    table: 'organizations',
    module: 'authorization',
    owner: 'tenant',
    scopeColumn: 'tenant_id',
    rationale: "NOT NULL uuid FK -> tenants.id, one tenant's workspace.",
  },
  {
    table: 'roles',
    module: 'authorization',
    owner: 'organization',
    scopeColumn: 'organization_id',
    rationale: 'NOT NULL uuid FK -> organizations.id.',
  },
  {
    table: 'memberships',
    module: 'authorization',
    owner: 'organization',
    scopeColumn: 'organization_id',
    rationale:
      'NOT NULL uuid FK -> organizations.id; PK is (user_id, organization_id).',
  },
  {
    table: 'policies',
    module: 'authorization',
    owner: 'organization',
    scopeColumn: 'organization_id',
    rationale:
      'Nullable uuid FK -> organizations.id -- a null row is presumably a global/system policy. Confirm with a real-data count (see topology-queries.policiesWithNullOrganization); Phase 1 should decide whether "global policy" is an intended state or dead data.',
  },
  {
    table: 'tenant_attributes',
    module: 'authorization',
    owner: 'tenant',
    scopeColumn: 'tenant_id',
    rationale:
      'PK is tenant_id itself (uuid FK -> tenants.id); one row per tenant.',
  },
  {
    table: 'invitations',
    module: 'authorization',
    owner: 'organization',
    scopeColumn: 'organization_id',
    rationale: 'NOT NULL uuid FK -> organizations.id.',
  },
  {
    table: 'waitlist_entries',
    module: 'authorization',
    owner: 'ambiguous',
    scopeColumn: 'organization_id, tenant_id',
    rationale:
      'ANOMALY: the schema carries both a nullable organization_id uuid FK and a nullable tenant_id uuid FK, but ' +
      'DrizzleWaitlistRepository (src/modules/waitlist/infrastructure/drizzle/DrizzleWaitlistRepository.ts) never ' +
      'reads or writes tenant_id -- CreateWaitlistEntryData has no tenantId field at all. Application code and ' +
      'admin-route doc comments (src/app/api/admin/waitlist/route.ts) describe this table as fully platform-global ' +
      'with "no trustworthy scope", which is correct for organization_id (an unvalidated claim from an anonymous ' +
      'joiner) but does not explain why tenant_id exists in the schema at all. Confirm with a real-data count ' +
      '(topology-queries.waitlistEntriesWithTenantId) whether this is dead schema or silently-populated data before ' +
      'Phase 1 decides whether to drop the column or wire it up.',
  },

  // user module
  {
    table: 'users',
    module: 'user',
    owner: 'platform',
    scopeColumn: null,
    rationale:
      'No tenant/org column; org membership lives entirely in memberships.',
  },

  // auth module
  {
    table: 'auth_user_identities',
    module: 'auth',
    owner: 'platform',
    scopeColumn: null,
    rationale:
      'Provider<->user identity mapping, keyed by user_id, not tenant-scoped.',
  },
  {
    table: 'auth_organization_identities',
    module: 'auth',
    owner: 'organization',
    scopeColumn: 'organization_id',
    rationale:
      'NOT NULL uuid FK -> organizations.id; provider<->org identity mapping.',
  },
  {
    table: 'user_credentials',
    module: 'auth',
    owner: 'platform',
    scopeColumn: null,
    rationale:
      'Keyed by user_id (PK); AuthJS credential storage, not tenant-scoped.',
  },
  {
    table: 'password_reset_tokens',
    module: 'auth',
    owner: 'platform',
    scopeColumn: null,
    rationale: 'Keyed by user_id, not tenant-scoped.',
  },
  {
    table: 'email_verification_tokens',
    module: 'auth',
    owner: 'platform',
    scopeColumn: null,
    rationale: 'Keyed by user_id, not tenant-scoped.',
  },
  {
    table: 'user_mfa_totp',
    module: 'auth',
    owner: 'platform',
    scopeColumn: null,
    rationale: 'Keyed by user_id (PK), not tenant-scoped.',
  },
  {
    table: 'user_mfa_recovery_codes',
    module: 'auth',
    owner: 'platform',
    scopeColumn: null,
    rationale: 'Keyed by user_id, not tenant-scoped.',
  },

  // billing module
  {
    table: 'subscriptions',
    module: 'billing',
    owner: 'tenant',
    scopeColumn: 'tenant_id',
    rationale: 'NOT NULL uuid FK -> tenants.id.',
  },

  // feature-flags module
  {
    table: 'feature_flags',
    module: 'feature-flags',
    owner: 'ambiguous',
    scopeColumn: 'tenant_id',
    rationale:
      'ANOMALY (by design, not a bug): tenant_id is `text`, not a uuid FK to tenants.id. Null means the global ' +
      'default; a populated value is documented (DrizzleFeatureFlagAdminService, MutationScope) to be the ' +
      "caller's tenantId -- but TenantContext.tenantId can itself hold either the internal tenants.id uuid or a " +
      "raw external provider (Clerk) org id, depending on TENANT_CONTEXT_SOURCE. The column's value shape is " +
      'therefore config-dependent and cannot be validated as a uuid at the schema level. Quantify with ' +
      'topology-queries.tenantIdShapeCounts before Phase 1 decides the canonical id.',
  },

  // rate-limit module
  {
    table: 'rate_limit_counters',
    module: 'rate-limit',
    owner: 'platform',
    scopeColumn: null,
    rationale:
      'Keyed by an opaque `identifier` string (caller-defined, e.g. ip/user composite), not tenant-scoped.',
  },

  // audit-log module
  {
    table: 'audit_log_settings',
    module: 'audit-log',
    owner: 'ambiguous',
    scopeColumn: 'tenant_id',
    rationale:
      'Same documented ambiguity as feature_flags.tenant_id (text, not uuid FK; null = global default). See that ' +
      'entry for the TENANT_CONTEXT_SOURCE rationale.',
  },
  {
    table: 'audit_events',
    module: 'audit-log',
    owner: 'ambiguous',
    scopeColumn: 'tenant_id',
    rationale:
      'Same documented ambiguity as feature_flags.tenant_id (text, not uuid FK). No organization_id column at ' +
      'all yet -- the schema comment explicitly defers adding one until a real caller settles which id it needs.',
  },
] as const;

/**
 * The single most important cross-cutting finding for OZI-75: throughout
 * the authorization/admin surface (see AdminOrganizationsScope,
 * OZI-77's fix), `TenantContext.tenantId` and `TenantContext.organizationId`
 * are populated with the *same* value at runtime -- i.e. application code
 * widely treats "the active organization" as if it were "the tenant",
 * even though the schema models them as two separate tables with a real
 * one-tenant-to-many-organizations relationship (a tenant with more than
 * one organization is a schema-valid, and per OZI-77, security-relevant,
 * state). This is the structural problem the eventual two-ID migration
 * exists to resolve; every "ambiguous" row above is a symptom of it.
 */
export const TENANT_ORG_CONFLATION_NOTE =
  'organizations.tenant_id models a real one-to-many relationship, but ' +
  'delivery-layer code (TenantContext, AdminOrganizationsScope, and every ' +
  'admin route fixed under OZI-77) treats the active organization id as ' +
  'the tenant id. A tenant with multiple organizations is schema-valid ' +
  'and was the exact shape OZI-77 had to contain.';

export function summarizeOwnership(): Record<Owner, number> {
  const counts: Record<Owner, number> = {
    platform: 0,
    tenant: 0,
    organization: 0,
    ambiguous: 0,
  };
  for (const row of TABLE_OWNERSHIP) {
    counts[row.owner] += 1;
  }
  return counts;
}
