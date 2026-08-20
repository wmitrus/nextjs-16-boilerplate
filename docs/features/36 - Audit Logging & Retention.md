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
        effective-settings.ts              ← resolveEffectiveAuditSetting() — shared by writer + purge job
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

`audit_log_settings` mirrors `feature_flags`' global/tenant-override shape:
one row per `(category, tenantId)` pair. `tenantId: null` is the global
default; a tenant row is an override. A missing row for a given pair is not
an error — it means "use the taxonomy default" from `category.ts`.

Effective-settings resolution (`resolveEffectiveAuditSetting()` in
`infrastructure/drizzle/effective-settings.ts`) is a single query: order by
`tenantId ASC` and take the first row. Postgres's default `NULLS LAST` for
ascending sort means a real tenant match naturally sorts before the
global/null row, so `LIMIT 1` picks the tenant override when one exists,
otherwise the global row, otherwise nothing (in which case the caller falls
back to the taxonomy default). **This one function is shared by the write
path and the purge job** — both apply identical enabled/retention/sampling
rules and can never independently drift.

Unlike the settings table, the `audit_events` trail itself has **no
overlay/inheritance semantic**. A tenant-scoped reader (browse UI, purge job
scoping) only ever sees that tenant's own rows — never `tenantId: null`
(platform-level) rows, never another tenant's rows (SEC-26, see
[SECURITY_CODING_PATTERNS.md](../ai/general/SECURITY_CODING_PATTERNS.md)).

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
2. Resolve the effective setting for `(category, tenantId)`. If disabled,
   drop the event.
3. Sampling: if `outcome === 'success'` and `sampleRate` is set, roll the
   dice — a `failure` or `denied` outcome is **never** dropped by sampling,
   regardless of the configured rate, so compliance/security evidence is
   never silently lost to a rate meant for high-volume success chatter.
4. Metadata capture: always captured on `failure`/`denied`; captured on
   `success` only if `captureInputOnSuccess` is true for that category.
5. Metadata is size-capped at 8 KB (serialized). Oversized metadata is
   replaced with `{ truncated: true, originalSizeBytes }` rather than stored
   raw or dropped entirely.
6. Insert into `audit_events`.

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
settings route. **SEC-26-correct tenant scoping**: an env-based platform
admin gets `DrizzleAuditLogReadService.listGlobal(...)` (unscoped, all
tenants); an ABAC-authorized non-platform-admin caller always gets
`listForTenant(access.tenant.tenantId, ...)`, deriving the scope from the
server-verified security context — never from a client-supplied query
parameter (there is no `tenantId` filter on this route at all).

---

## 7. Retention Enforcement (Purge Job)

`purgeExpiredAuditEvents()` (`src/modules/audit-log/infrastructure/drizzle/purge-expired-events.ts`):

1. Find every distinct `(category, tenantId)` pair actually present in
   `audit_events` (not the full taxonomy × every tenant ever seen — only
   pairs with rows).
2. For each pair, resolve its currently-effective retention via
   `resolveEffectiveAuditSetting()` — the same function the writer uses.
3. Delete rows older than `now - retentionDays` for that pair, in batches of
   500, looping until nothing older than the cutoff remains. Batching avoids
   holding row locks for too long on a high-volume append-only table with a
   single giant `DELETE`.

`scripts/audit-log/purge-expired.ts` is a thin CLI wrapper: resolves
provider/driver/URL from env (mirroring every other standalone script in
`scripts/`, e.g. `db-seed.ts`), creates a DB connection, calls the function
above, prints a per-pair summary, and closes the connection. Supports
`--dry-run` (reports what would be deleted without deleting anything).

```bash
# Local dry run (PGlite/local Postgres, whatever DATABASE_URL resolves to)
pnpm audit-log:purge:dry-run

# Local run against a real connection
pnpm audit-log:purge

# Against the same production env Vercel would use, from your machine
pnpm audit-log:purge:prod:local

# What the scheduled workflow actually invokes
pnpm audit-log:purge:vercel:prod
```

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
- **SEC-26 (tenant scope)**: both the settings routes and the new browse
  route derive a non-platform-admin caller's tenant scope from the
  server-verified security context, never from a client-supplied value. See
  [SECURITY_CODING_PATTERNS.md](../ai/general/SECURITY_CODING_PATTERNS.md).
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

- `DrizzleAuditLogService.db.test.ts` — enabled/disabled gating, tenant
  override precedence, sampling (never drops failure/denied), metadata
  capture rules, size-cap truncation, unknown-category handling, userAgent
  truncation.
- `DrizzleAuditLogSettingsAdminService.db.test.ts` — settings CRUD.
- `DrizzleAuditLogReadService.db.test.ts` — global vs. tenant-scoped
  listing, filters, pagination, SEC-26 tenant-scoping regression.
- `purge-expired-events.db.test.ts` — taxonomy-default retention, admin
  override retention, dry-run, batching loop, null-tenant vs. real-tenant
  scoping.

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
