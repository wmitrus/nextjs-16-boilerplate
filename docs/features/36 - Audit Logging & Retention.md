# Audit Logging & Retention

This document covers the DB-backed audit trail: the category taxonomy, the
admin-manageable on/off + retention settings, the write path, the
admin-facing browse UI, and the scheduled retention-enforcement (purge) job.

It complements, and does not replace, the existing Pino-based structured
logging described in
[20 - Enterprise Security Architecture.md](./20%20-%20Enterprise%20Security%20Architecture.md)
§6 — every audited mutation still logs to Pino/Logflare as before. This
feature adds a second, queryable, retention-governed sink for the same class
of events.

---

## 1. Why this exists

Before this feature, the only "audit" surface in the app was Pino structured
logging: useful for tailing and for shipping to Logflare, but not queryable
in-app, not retained on a schedule anyone controls, and gated by a single
global env var (`SECURITY_AUDIT_LOG_ENABLED`) that requires a redeploy to
change.

This feature adds a second, DB-backed trail (`audit_events`) with:

- **Per-category on/off**, changeable by an admin at runtime, no redeploy.
- **Per-category retention**, enforced by a scheduled purge job — the table
  does not grow unbounded.
- **An in-app browse UI** for admins to search/filter what happened.
- **Sampling** for high-volume, low-value categories, that never drops a
  `failure` or `denied` outcome — only thins `success` noise.
- **Metadata redaction and a hard size cap** before anything is persisted.

## 2. Architecture Overview

```
src/
  core/contracts/audit-log.ts              ← AuditEventInput / AuditLogService interface (no module import)
  modules/audit-log/
    domain/
      category.ts                          ← AUDIT_CATEGORIES taxonomy + per-category defaults
      errors.ts                            ← domain error types
    factory.ts                             ← createAuditLogService(db) — wraps the writer in ResilientAuditLogService
    infrastructure/
      drizzle/
        schema.ts                          ← audit_log_settings + audit_events tables
        effective-settings.ts              ← canonical effective settings + bounded legacy retention compatibility
        DrizzleAuditLogService.ts          ← write path (enabled/sampling/capture/cap → insert)
        DrizzleAuditLogSettingsAdminService.ts  ← admin CRUD for settings (not DI-registered)
        DrizzleAuditLogReadService.ts      ← admin browse/read path (not DI-registered)
        purge-expired-events.ts            ← retention-enforcement logic, invoked by the CLI script
      resilient/
        ResilientAuditLogService.ts        ← fail-open wrapper (record() never throws)
  security/actions/
    redact.ts                              ← shared redaction, used before crossing the AuditLogService boundary
    action-audit.ts                        ← logActionAudit() — server_action category, wired to the writer
    record-admin-audit-event.ts            ← shared resolve+record+catch helper for /api/admin/** routes
  security/utils/security-logger.ts        ← logSecurityEvent() — security_event category, wired to the writer
app/
  api/admin/audit-log-settings/route.ts    ← GET/PATCH/DELETE settings
  api/admin/audit-logs/route.ts            ← GET the trail (paginated, filtered)
  admin/security/page.tsx                  ← settings UI
  admin/security/audit-logs/page.tsx       ← browse UI
scripts/audit-log/purge-expired.ts         ← CLI wrapper around purge-expired-events.ts
.github/workflows/audit-log-purge.yml      ← daily scheduled purge
```

**Fail-open guarantee**: an audit-write failure never fails, delays, or
changes the outcome of the underlying request. `AuditLogService` (the DI
token, `AUDIT_LOG.SERVICE`) is always the DB writer wrapped in
`ResilientAuditLogService`. Every call site additionally wraps both
_resolving_ the service from the container and calling `record()` in a
single `try`/`catch` — a container that never registered `AUDIT_LOG.SERVICE`
(the global unit-test double does not) throws on `resolve()` before
`ResilientAuditLogService`'s own guarantee would ever apply. On any failure,
a warning is logged and the caller proceeds exactly as if the audit call had
never been made.

**Redaction stays in `src/security/`, not in the module.** `modules ->
security` is not an allowed dependency direction in this repo (see
[10 - Modular Monolith - File Catalog.md](../architecture/10%20-%20Modular%20Monolith%20-%20File%20Catalog.md)
§2). Callers (`action-audit.ts`, `security-logger.ts`,
`record-admin-audit-event.ts`) redact via `src/security/actions/redact.ts`
_before_ the value crosses the `AuditLogService` contract boundary. The
module only decides whether to _persist_ the already-redacted value
(governed by `captureInputOnSuccess`) and applies its own generic
size cap on top.

---

## 3. Category Taxonomy

Categories are deliberately coarse — one switch per functional area, not per
literal action name — so the admin toggle screen stays a short, legible
table while still letting low-value categories be turned off or retained
briefly.

| Category         | Label                    | Default enabled | Default retention | Sampled? | Capture input on success? |
| ---------------- | ------------------------ | --------------- | ----------------- | -------- | ------------------------- |
| `auth`           | Authentication           | ✅              | 180 days          | No       | No                        |
| `admin_access`   | Admin panel access       | ✅              | 180 days          | No       | No                        |
| `organization`   | Organizations            | ✅              | 365 days          | No       | No                        |
| `membership`     | Memberships              | ✅              | 365 days          | No       | No                        |
| `rbac_policy`    | RBAC & policies          | ✅              | 365 days          | No       | No                        |
| `feature_flag`   | Feature flags            | ✅              | 90 days           | No       | No                        |
| `waitlist`       | Waitlist                 | ❌              | 30 days           | No       | No                        |
| `billing`        | Billing                  | ✅              | 365 days          | No       | No                        |
| `security_event` | Security events          | ✅              | 365 days          | Never    | No                        |
| `server_action`  | Server actions (generic) | ✅              | 30 days           | No       | No                        |

Source of truth: `src/modules/audit-log/domain/category.ts` (`AUDIT_CATEGORIES`,
`AUDIT_CATEGORY_DEFAULTS`). Adding a category is a deliberate migration (a
new value in `auditCategoryEnum`, `src/modules/audit-log/infrastructure/drizzle/schema.ts`),
not a runtime free-for-all.

Server-enforced bounds on admin-configured values (`src/modules/audit-log/domain/category.ts`):

- `retentionDays`: `7`–`730`
- `sampleRate`: `0`–`1`, or `null` (no sampling — capture every event)

`security_event` is never sampled, regardless of what an admin sets —
enforced at the write path, not just as a default.

---

## 4. Settings Model

AUD·D uses canonical Organization ownership.

`organizations.tenant_id` is the authoritative Tenant → Organization parent
relation. Legacy `audit_log_settings.tenant_id` and `audit_events.tenant_id`
remain rollback/data-migration compatibility data where required, but they are
not canonical authorization authority.

Canonical organization scope is:

    {
      kind: 'organization';
      organizationId;
      tenantId;
    }

Both identifiers are load-bearing. The tuple must be proven against
`organizations` before an organization-scoped read, write, or settings
evaluation is admitted.

Canonical effective-settings resolution is handled by
`resolveCanonicalEffectiveAuditSetting()`:

- organization scope:
  exact canonical organization override → `intentional_global` → taxonomy;
- platform-global scope:
  `intentional_global` → taxonomy.

For organization scope, fallback is permitted only after the complete
`(organizationId, tenantId)` tuple is proven against `organizations`. An
invalid tuple returns no canonical setting; it does not fall through to global
or taxonomy.

`unresolved_legacy` and `quarantined` settings never participate in canonical
effective evaluation.

`resolveLegacyAuditRetentionCompat()` is intentionally separate and is
**data-migration compatibility only**. It exists only for retention of
historical `unresolved_legacy` / `quarantined` events until the later cleanup
phase removes that compatibility path.

The `audit_events` trail itself has no organization/global overlay semantic.
An ordinary organization viewer sees only rows with its exact
`organization_id`, and the parent Tenant tuple must still validate. It never
receives `intentional_global`, NULL-organization, or sibling-organization rows.

### Managing settings

`/admin/security` — toggle each category on/off, edit its retention (bounded
`7`–`730` days), reset a category to its taxonomy default. Backed by
`GET /api/admin/audit-log-settings` / `PATCH` / `DELETE`, gated on
`ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS` (write) or
`ACTIONS.SECURITY_READ_AUDIT` (read), or `isEnvBasedPlatformAdmin`.

---

## 5. Write Path

`DrizzleAuditLogService.record(event: AuditEventInput)`:

1. Reject unknown categories (log a warning, drop the event — never throw).
2. Resolve the effective setting from the full canonical `AuditWriteScope`.
   Organization scope must prove `(organizationId, tenantId)` against
   `organizations`. An invalid tuple fails closed and is never retried as
   platform-global. If the resolved setting is disabled, drop the event.
3. Sampling: if `outcome === 'success'` and `sampleRate` is set, roll the
   dice — a `failure` or `denied` outcome is **never** dropped by sampling,
   regardless of the configured rate, so compliance/security evidence is
   never silently lost to a rate meant for high-volume success chatter.
4. Metadata capture: always captured on `failure`/`denied`; captured on
   `success` only if `captureInputOnSuccess` is true for that category.
5. Metadata is size-capped at 8 KB (serialized). Oversized metadata is
   replaced with `{ truncated: true, originalSizeBytes }` rather than stored
   raw or dropped entirely.
6. Insert into `audit_events`. Organization writes prove the complete
   `(organizationId, tenantId)` tuple in the same SQL statement that performs
   the INSERT. Legacy `tenant_id` remains compatibility/rollback data; it is
   not canonical authority.

### Existing wired call sites

| Call site                                                                  | Category                                                                                         | Notes                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logActionAudit()` (`security/actions/action-audit.ts`)                    | `server_action`                                                                                  | Every `createSecureAction` mutation, alongside its existing Pino call.                                                                                                                                                                                                  |
| `logSecurityEvent()` (`security/utils/security-logger.ts`)                 | `security_event`, outcome `failure`                                                              | SSRF attempts, tenant violations, rate-limit trips, replay attacks, auth failures.                                                                                                                                                                                      |
| `recordAdminAuditEvent()` (`security/actions/record-admin-audit-event.ts`) | varies (`feature_flag`, `organization`, `rbac_policy`, `membership`, `admin_access`, `waitlist`) | Every `/api/admin/**` mutation route — these bypass `createSecureAction`, so they don't get `logActionAudit`'s automatic coverage. Called at ~19 mutation-success points across 15 route files, plus `src/app/admin/layout.tsx`'s admin-panel access-grant/deny events. |

`recordAdminAuditEvent` is a deliberate standalone copy of the same
resolve+record+catch shape as `logActionAudit`/`logSecurityEvent`, not a
further extraction shared with them — three near-identical call sites was
not (yet) enough duplication to justify coupling already-shipped, already-tested
code to a new shared module.

Scope is limited to each route's existing mutation-success point — 403/404/409
branches are not separately audited.

---

## 6. Browse UI

`/admin/security/audit-logs` — linked from `/admin/security` via a "View
audit trail →" header link (the settings page's own URL did not move).

Filters: category, outcome (`success`/`failure`/`denied`), actor user ID,
target type/ID, date range. Paginated (25 per page in the UI; the API caps
`limit` at 200). Rows expand to show tenant, IP, correlation ID, and
metadata (pretty-printed JSON).

Backed by `GET /api/admin/audit-logs`
(`src/app/api/admin/audit-logs/route.ts`), gated the same way as the
settings route.

AUD·D derives an explicit canonical data scope before calling
`DrizzleAuditLogReadService.list(scope)`:

- ordinary membership yields organization scope only;
- platform-global access is explicit;
- organization reads require exact `organization_id` plus proof that
  `organizations.tenant_id = scope.tenantId`.

An invalid Organization/Tenant tuple returns no rows. There is no NULL/global
overlay for an ordinary organization viewer, and no client-supplied legacy
`tenant_id` is accepted as authorization input.

---

## 7. Retention Enforcement (Purge Job)

`purgeExpiredAuditEvents()` uses discriminated retention keys rather than the
legacy `(category, tenantId)` pair.

The retention groups are:

1. live canonical organization:
   `(category, organization_id, canonical_organization)`;
2. canonical organization with `organization_id IS NULL`:
   `(category, canonical_organization)`;
3. organization-owned orphaned:
   `(category, organization_owned_orphaned)`;
4. intentional global:
   `(category, intentional_global)`;
5. historical `unresolved_legacy` / `quarantined`:
   `(category, legacy audit_events.tenant_id, ownership_state)`.

Retention resolution is:

- live canonical organization:
  canonical organization setting → intentional global → taxonomy;
- canonical NULL-owned, orphaned, and intentional-global groups:
  intentional global → taxonomy;
- unresolved legacy / quarantined:
  `resolveLegacyAuditRetentionCompat()` only.

Legacy NULL tenant grouping uses PostgreSQL `IS NOT DISTINCT FROM`, so NULL is
part of the legacy retention identity rather than an unmatchable equality
value.

Dry-run COUNT and real DELETE both bind the same discriminated retention key
and cutoff. DELETE additionally re-binds that key at deletion time, so a row
reconciled between SELECT and DELETE cannot be deleted under its former
ownership.

Rows are deleted in batches of 500, looping until nothing older than the
cutoff remains. Batching avoids holding row locks for too long on a
high-volume append-only table.

Retention configuration has snapshot semantics for each key being processed.
If an admin changes retention after that key has already been resolved in the
current purge run, that already-resolved key is not retroactively recalculated.

If a canonical organization key was enumerated and the Organization is deleted
before processing, purge re-checks the exact original key. If that exact group
disappeared, the stale key is skipped. If canonical rows still reference the
missing Organization, purge fails closed with
`AuditPurgeOwnershipInvariantError`; it never falls back to global, taxonomy,
or legacy authority.

`scripts/audit-log/purge-expired.ts` is a thin CLI wrapper: it resolves the
provider/driver/URL from env, creates a DB connection, invokes the purge,
prints a per-retention-key summary, and closes the connection. It supports
`--dry-run`, which reports what would be deleted without deleting anything.

### Scheduled workflow

`.github/workflows/audit-log-purge.yml` runs daily (`0 3 * * *` UTC) plus
`workflow_dispatch` for manual runs. It reuses the same
`vercel pull --environment=production --token=${{ secrets.VERCEL_TOKEN }}`
step already proven in `prod-deploy.yml` to materialize
`.vercel/.env.production.local`, then runs
`pnpm audit-log:purge:vercel:prod`. This repo has no separate raw
`DATABASE_URL` secret pattern for scheduled workflows — production DB access
always goes through the Vercel-pulled environment, and this job follows that
existing convention rather than inventing a new one.

### Deferred: native table partitioning

Native Postgres `RANGE` partitioning of `audit_events` (monthly partitions,
drop-instead-of-delete for aged-out data) was considered during design and
explicitly **deferred**, not attempted. Converting the already-created plain
table to a partitioned one is a real data migration that needs the actual
hosting tier's partitioning support confirmed first (Neon/Supabase), and
cannot be safely verified against a production database from a sandboxed
session. The row-level batched-`DELETE` purge job shipped in this feature
fully satisfies the retention-enforcement requirement on its own —
partitioning is a VACUUM-cost/performance optimization on top of working
retention enforcement, not a prerequisite for it. Revisit once the
row-level purge job's real-world volume/duration is known from production
runs.

---

## 8. Security Notes

- **Fail-open by design.** An audit-write failure never blocks, delays, or
  changes the response of the request it's describing. This is a
  deliberate tradeoff — availability of the primary action over completeness
  of the audit trail — consistent with `ResilientFeatureFlagService`'s
  established pattern in this repo.
- **Canonical organization scope**: ordinary callers derive Organization
  scope from the server-verified security context. Both `organizationId` and
  its authoritative parent `tenantId` are required and proven against
  `organizations`. Legacy `tenant_id` columns are never canonical
  authorization authority. Platform-global access is explicit.
- **Redaction happens before persistence, always.** The same redaction
  rules used for Pino output are applied before a value ever reaches
  `AuditLogService.record()` — nothing unredacted is stored via either sink.
- **Metadata is bounded.** An 8 KB size cap prevents a single pathological
  event from blowing up storage; oversized metadata is replaced with a
  `truncated` marker rather than silently dropped or stored raw.
- **`SECURITY_AUDIT_LOG_ENABLED` (`src/core/env.ts`) is a separate,
  pre-existing env var and does not gate this feature.** It is documented in
  [20 - Enterprise Security Architecture.md](./20%20-%20Enterprise%20Security%20Architecture.md)
  §7 as toggling "structured audit logging", but as of this writing it is
  not read by `logActionAudit`/`logSecurityEvent` or anywhere else in
  `src/security/` — it is defined in the env schema but currently unwired.
  This is pre-existing drift, not something this feature introduced or
  relies on; flagged here rather than silently reconciled, per this repo's
  documentation-vs-code precedence rule.

---

## 9. Testing

### Domain unit tests

`src/modules/audit-log/domain/category.test.ts` — taxonomy shape, default
lookups, bounds constants.

### DB integration tests (`*.db.test.ts`)

Use `resolveTestDb()` from `@/testing/db/create-test-db` (PGlite in-memory),
same pattern as every other module's DB test suite:

- `DrizzleAuditLogService.db.test.ts` — canonical effective-setting gating,
  same-statement Organization/Tenant tuple proof, sampling (never drops
  failure/denied), metadata capture rules, size-cap truncation,
  unknown-category handling, userAgent truncation.
- `DrizzleAuditLogSettingsAdminService.db.test.ts` — canonical settings CRUD,
  tuple validation, and intentional-global fallback/uniqueness behavior.
- `DrizzleAuditLogReadService.db.test.ts` — canonical Organization
  containment, platform-global access, filters, pagination, invalid-tuple,
  and sibling-Organization regressions.
- `purge-expired-events.db.test.ts` — discriminated retention keys, canonical
  Organization/global/legacy retention, NULL legacy semantics, dry-run/delete
  parity, batching, and stale-key handling after concurrent Organization
  deletion.

### Route tests (mocked container)

`src/app/api/admin/audit-log-settings/route.test.ts`,
`src/app/api/admin/audit-logs/route.test.ts` — auth (401/403), validation,
SEC-26 scoping regressions, success paths. Mirror the mocking pattern
already used across every other `/api/admin/**` route test in this repo:
mock `next/server`'s `connection`, `resolveNodeProvisioningAccess`,
`isEnvBasedPlatformAdmin`, `getAppContainer`, and the Drizzle service class.

### Component tests

`AuditSettingsClient.test.tsx`, `AuditLogsClient.test.tsx` — listing, scope
banners, filter/pagination interaction, error/empty states.

### Script tests

`scripts/audit-log/purge-expired.test.ts` — pure `resolveDatabaseUrl()`
coverage only, mirroring `db-seed.test.ts`'s convention: `scripts/**`
DB-query-chaining logic is not exercised directly (that's what
`purge-expired-events.db.test.ts` is for, under `src/`, where the
`*.db.test.ts` convention applies).

---

## 10. Adding a New Category

1. Add the value to `AUDIT_CATEGORIES` in
   `src/modules/audit-log/domain/category.ts`, and its default entry in
   `AUDIT_CATEGORY_DEFAULTS`.
2. Add the same value to `auditCategoryEnum` in
   `src/modules/audit-log/infrastructure/drizzle/schema.ts`.
3. Generate and apply the migration (`pnpm db:generate`, then the
   appropriate `db:*:migrate` script).
4. Call `logActionAudit`/`logSecurityEvent`/`recordAdminAuditEvent` (or add
   a new call site) with the new category from wherever the event actually
   occurs.

Do not add a category without a migration — the enum is a closed set by
design, not a runtime free-for-all.
