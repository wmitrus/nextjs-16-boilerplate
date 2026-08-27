# OZI-75 — Table Ownership Matrix and Identifier-Semantics Inventory

Human-readable mirror of `scripts/tenancy-inventory/ownership-matrix.ts`
(the source of truth — re-derive both together when the schema changes).
Built by reading all 8 module schema files (21 real tables) on
`main` at `92a3ba8c`.

## Ownership summary

| Owner | Count | Tables |
|---|---|---|
| platform | 9 | tenants, users, auth_user_identities, user_credentials, password_reset_tokens, email_verification_tokens, user_mfa_totp, user_mfa_recovery_codes, rate_limit_counters |
| tenant | 3 | organizations, tenant_attributes, subscriptions |
| organization | 5 | roles, memberships, policies, invitations, auth_organization_identities |
| ambiguous | 4 | waitlist_entries, feature_flags, audit_log_settings, audit_events |

## The core cross-cutting finding

`organizations.tenant_id` models a real one-to-many relationship (a tenant
can have multiple organizations, schema-valid), but delivery-layer code
across the admin surface (`TenantContext`, `AdminOrganizationsScope`, every
route fixed under OZI-77) treats the active organization id as if it were
the tenant id. A tenant with multiple organizations is exactly the shape
OZI-77 had to contain. Every "ambiguous" row below is a symptom of this
same underlying conflation.

## Ambiguous / unresolved rows (detail)

### `waitlist_entries` — ANOMALY (schema/code drift, not by design)

The schema carries both a nullable `organization_id` uuid FK and a
nullable `tenant_id` uuid FK. `DrizzleWaitlistRepository` never reads or
writes `tenant_id` — `CreateWaitlistEntryData` has no `tenantId` field at
all. Application code and the admin route's own doc comments
(`src/app/api/admin/waitlist/route.ts`, OZI-76) describe this table as
fully platform-global with "no trustworthy scope" — correct for
`organization_id` (an unvalidated claim from an anonymous joiner), but that
doesn't explain why `tenant_id` exists in the schema at all.

**Local dry-run signal**: `waitlistEntriesWithTenantIdCount` returned `0`
against both local databases at the time of this run — consistent with the
"dead column" hypothesis, but not yet confirmed against a larger dataset.
Phase 1 should decide: drop the column, or find out why it was added and
wire it up.

### `feature_flags`, `audit_log_settings`, `audit_events` — ANOMALY (by design, documented)

`tenant_id` is `text`, not a `uuid` FK to `tenants.id`. `NULL` means the
global default; a populated value is documented to be the caller's
`tenantId` — but `TenantContext.tenantId` can itself hold either the
internal `tenants.id` uuid or a raw external-provider (Clerk) org id,
depending on `TENANT_CONTEXT_SOURCE`. The column's value shape is
therefore configuration-dependent and cannot be validated as a uuid at the
schema level.

**Local dry-run signal, second pass** (`dev-db`, which carries real usage
history from manual testing, unlike `test-db` which is truncated between
test runs) — `tenantIdShapeCounts` now reports three buckets instead of
one (`matchesInternalTenantUuid` / `matchesInternalOrganizationUuid` /
`matchesNeither`), specifically to resolve S6 precisely rather than
lumping every non-tenant value together:

**Every single non-null `audit_events.tenant_id` value in this local
environment matches a real `organizations.id`, and none match a
`tenants.id`.** This is no longer "external-provider-shaped or otherwise
unrecognized" (the first pass's weaker, single-bucket finding) — it is a
directly confirmed instance of the exact conflation this whole
migration exists to resolve: a column named `tenant_id` is, in this
environment's real data, actually holding organization uuids.
`feature_flags` and `audit_log_settings` had no non-null `tenant_id`
values in this local run, so this signal is specific to `audit_events`
here — worth re-checking once other environments are in scope.

## Other real-data signals surfaced by the dry-run (second pass)

- **Quota enforcement (S7)**: `quotaEnforcementSignal` found at least one
  local tenant whose actual organization count exceeds its
  `tenant_attributes.max_organizations` value. **Read this as**: the
  configured quota is exceeded in observed data; enforcement effectiveness
  requires runtime-path verification. The data alone does not prove
  nothing enforces it — the exceeding row(s) could predate enforcement,
  come through a special/import path, or an administrative bypass.
- **Multi-organization tenant (S1)**: the local `dev-db` already has a
  tenant with more than one organization — the exact topology OZI-77's fix
  was built to contain, present even in local development data.
- **Multi-organization, single-tenant user (S4)**: at least one local user
  holds memberships in more than one organization. Split into two
  precise signals in this pass: `usersInMultipleOrganizationsCount` (any
  multi-org membership) and `usersInMultipleTenantsCount` (memberships
  spanning more than one *tenant*, via each organization's `tenant_id`) —
  architecturally different states. In this local run the one
  multi-organization user's organizations belong to a single tenant, i.e.
  a normal multi-workspace user, not a cross-tenant one.
- **Organization provider mapping (S5)**: several local organizations have
  no `auth_organization_identities` row — expected for DB/AuthJS-provider
  tenancy mode where no external org mapping is created; would need
  re-checking under a Clerk-backed environment. The duplicate-mapping
  check now groups by `(organization_id, provider)`, not just
  `organization_id` — a single organization legitimately holding one
  mapping per provider (e.g. one Clerk mapping and one AuthJS mapping) is
  healthy provider-parity, and the first pass's query would have
  false-positived that as an anomaly.
- **User provider mapping (S5, new)**: OZI-75 scoped both user and
  organization provider mappings, but the first pass only covered
  organizations (`auth_organization_identities`) and never inventoried
  `auth_user_identities`. Now covered: local `dev-db` has at least one
  user with more than one mapping for the *same* provider (a genuine
  anomaly under the same-provider grouping, not a healthy multi-provider
  case).
- **`policies.organization_id IS NULL` (schema question)**: zero such rows
  in this local run — the nullable column exists in the schema but nothing
  local currently uses it as a global/system policy. Worth confirming
  against a larger dataset before deciding whether to make it `NOT NULL`.

Exact counts for all of the above are environment-specific and are kept
outside the repository per the evidence-storage constraint (see
`validation-report.md`); this section reports only the qualitative
finding, not the numbers.

## Evidence integrity (second pass additions)

- Every evidence report now records `schemaVersion` (the latest applied
  migration id/hash from `drizzle.__drizzle_migrations`) alongside
  `commitSha` — a report is tied to the DB schema state it actually ran
  against, not just the application code's git state, which can drift
  from it.
- `commitSha` alone could not detect an uncommitted local change to the
  query set itself. `scan` now checks `git status --porcelain` and
  **refuses to run** against a dirty working tree unless `--allow-dirty`
  is explicitly passed; every report records `workingTreeDirty` either
  way, so an `--allow-dirty` report remains self-describing evidence
  rather than silently ambiguous.
- Evidence-directory confinement is now symlink-safe (`lstat` on every
  path segment, not just a lexical `path.resolve` + prefix check) and the
  directory/file are given explicit `0700`/`0600` permissions rather than
  relying on the process umask.
- All connection-level safety was previously limited to `connect_timeout`.
  Every read-only connection now also sets `statement_timeout`,
  `lock_timeout`, `idle_in_transaction_session_timeout`, and
  `default_transaction_read_only` as a session-level default layered on
  top of (not instead of) the explicit per-transaction `accessMode: 'read
  only'`.
