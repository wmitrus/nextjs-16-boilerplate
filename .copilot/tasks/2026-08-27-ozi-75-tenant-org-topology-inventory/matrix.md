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

**Local dry-run signal** (`dev-db`, which carries real usage history from
manual testing, unlike `test-db` which is truncated between test runs):
`audit_events.tenant_id` had a non-trivial number of non-null values, and
**zero** of them matched an internal `tenants.id` as a valid uuid — i.e.
every populated value in this local environment is external-provider-shaped
or otherwise not an internal tenant uuid. `feature_flags` and
`audit_log_settings` had no non-null `tenant_id` values in this local run.
Exact counts are local-environment-specific and are not reproduced here —
see the raw evidence file path in `validation-report.md` if you have local
access to it.

## Other real-data signals surfaced by the dry-run

- **Quota enforcement (S7)**: `quotaEnforcementSignal` found at least one
  local tenant whose actual organization count exceeds its
  `tenant_attributes.max_organizations` value — i.e. nothing in the runtime
  path currently enforces that quota. Confirms this is a real gap, not
  hypothetical.
- **Multi-organization tenant (S1)**: the local `dev-db` already has a
  tenant with more than one organization — the exact topology OZI-77's fix
  was built to contain, present even in local development data.
- **Multi-organization user (S4)**: at least one local user holds
  memberships in more than one organization.
- **Provider mapping (S5)**: several local organizations have no
  `auth_organization_identities` row — expected for DB/AuthJS-provider
  tenancy mode where no external org mapping is created; would need
  re-checking under a Clerk-backed environment.
- **`policies.organization_id IS NULL` (schema question)**: zero such rows
  in this local run — the nullable column exists in the schema but nothing
  local currently uses it as a global/system policy. Worth confirming
  against a larger dataset before deciding whether to make it `NOT NULL`.

Exact counts for all of the above are environment-specific and are kept
outside the repository per the evidence-storage constraint (see
`validation-report.md`); this section reports only the qualitative
finding, not the numbers.
