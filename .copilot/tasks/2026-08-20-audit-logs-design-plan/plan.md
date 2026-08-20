# Audit Logging & Admin Controls — Design Plan

## Task Metadata

- Task ID: `2026-08-20-audit-logs-design-plan`
- Branch: `claude/audit-logs-design-plan-w7bvow`
- Objective: Design a professional, DB-space-conscious audit-logging system
  with per-category admin on/off controls, plus a concrete map of every
  place in the app that must be instrumented once this is built.
- Non-goal: Implementation. No schema/migration/route code ships in this task.
- Leantime: no live credentials in this sandbox (see `intake.md`) — status
  intentionally not claimed as opened/closed.

---

## Part A — Feature Plan

### A.1 What exists today vs. what's missing

| Capability | Today | Gap |
| --- | --- | --- |
| Structured logging of mutations | ✅ `logActionAudit` (Pino, redacted, Logflare-shippable) | Log lines only — not queryable in-app, not retained on a schedule you control |
| High-severity security events | ✅ `logSecurityEvent` (fatal-level, alertable) | Same — log-only |
| On/off control | ✅ `SECURITY_AUDIT_LOG_ENABLED` env var | Single global switch, redeploy to change, no per-category granularity, no admin UI |
| Admin-viewable trail | ❌ | No in-app browse/search/filter of what happened |
| Retention / DB-space control | ❌ (nothing persists to DB yet) | Needs explicit design before any DB writer ships |
| RBAC for reading/managing audit config | 🟡 `SECURITY_READ_AUDIT` action already defined and already granted in the admin policy template | Defined but nothing implements it yet |

The design below **adds a DB-backed, admin-manageable trail as a second
sink alongside** the existing Pino/Logflare pipeline — it does not replace
it. Logflare/New Relic remain the observability/alerting surface; the new
`audit_events` table is the compliance-grade, admin-queryable, retention-
governed record.

### A.2 Category taxonomy (this is "which features" the admin toggles)

Toggling must happen at a **category** granularity — coarse enough to be a
usable admin UI (not one switch per literal action name), fine enough that
turning off noisy, low-value categories actually saves meaningful DB space.

| Category | Covers | Suggested default | Suggested default retention |
| --- | --- | --- | --- |
| `auth` | sign-in/out, sign-up, password reset, session revocation | ON | 180 days |
| `admin_access` | admin-panel grant/deny (`admin_guard:*`) | ON | 180 days |
| `organization` | org create/update/status change | ON | 365 days |
| `membership` | invite, accept, revoke, role change | ON | 365 days |
| `rbac_policy` | role/policy create/update/delete | ON | 365 days |
| `feature_flag` | flag create/update/delete | ON | 90 days |
| `waitlist` | approve/reject | OFF | 30 days |
| `billing` | plan/subscription changes | ON | 365 days |
| `security_event` | SSRF attempts, tenant violations, rate-limit trips | ON, never sampled | 365 days |
| `server_action` | generic `createSecureAction` catch-all not covered above | ON, success events capture minimal metadata only | 30 days |

Categories are a curated, rarely-changing list — adding one is a deliberate
migration, not a runtime free-for-all. This keeps the admin toggle screen a
short, legible table instead of an unbounded list of per-endpoint switches.

### A.3 Data model (Drizzle / Postgres)

Two tables, new module `src/modules/audit-log/`:

**`audit_log_settings`** — small, admin-managed, mirrors
`featureFlagsTable`'s global/tenant-override shape exactly:

```
id uuid pk default random
category audit_category_enum not null
tenantId text nullable            -- null = global default, same convention as feature_flags
enabled boolean not null default true
retentionDays integer not null
sampleRate real nullable          -- null/1.0 = capture everything
captureInputOnSuccess boolean not null default false
updatedByUserId uuid nullable
updatedAt timestamptz not null default now()

unique (category, tenantId) nulls not distinct   -- same as uq_feature_flags_key_tenant
index (category)
```

**`audit_events`** — the append-only trail; this is the table that needs
space discipline:

```
id bigserial primary key           -- bigint identity, not uuid: cheaper index/storage
                                    -- for a high-volume append-only log; no external
                                    -- callers need to guess this ID
occurredAt timestamptz not null default now()   -- primary query/partition axis
category audit_category_enum not null
action text not null                -- e.g. "org.update", "policy.delete", "auth.signin_failed"
outcome text not null               -- 'success' | 'failure' | 'denied'
tenantId uuid nullable references tenants(id) on delete set null
organizationId uuid nullable references organizations(id) on delete set null
actorUserId uuid nullable references users(id) on delete set null
targetType text nullable
targetId text nullable
ip text nullable
userAgent text nullable             -- bounded/truncated at insert
correlationId text nullable
requestId text nullable
metadata jsonb nullable             -- redacted + size-capped (see A.4)
createdAt timestamptz not null default now()

index (tenantId, occurredAt desc)
index (category, occurredAt desc)
index (actorUserId, occurredAt desc)
index (targetType, targetId)
```

Important deliberate deviation from every other table in this codebase:
`onDelete: 'set null'`, **not** `cascade`, on `actorUserId`/`organizationId`/
`tenantId`. Every other FK in `src/modules/*/infrastructure/drizzle/schema.ts`
cascades because deleting the parent should delete the dependent row. An
audit trail is the opposite — deleting a user or org must **not** delete the
history of what that user or org did. `set null` preserves the row and lets
the UI render "deleted user" instead of silently losing the record.

`category` as a Postgres `pgEnum` (same pattern as `contract_type` in
`src/modules/authorization/infrastructure/drizzle/schema.ts`), not free
text: the taxonomy is curated and DB-level integrity is worth the small
migration cost of adding a category later.

### A.4 DB-space controls (explicit, since this was called out directly)

1. **Category on/off is the first lever** — bytes are never written for a
   disabled category. Noisy/low-value categories (`waitlist`,
   `server_action` success paths) default OFF or minimal.
2. **Per-category retention**, admin-configurable but server-validated
   floor/ceiling (e.g. 7–730 days) so nobody accidentally sets unbounded
   retention on a high-volume category.
3. **Success/failure asymmetry** — `captureInputOnSuccess` defaults `false`.
   Failures always capture redacted input (mirrors `logActionAudit`'s
   existing behavior exactly); successes store only the fixed columns
   (actor, target, outcome, timestamps) unless the admin opts a category in.
4. **Redaction reuse, not reinvention** — the metadata redactor is the
   existing `redactAuditInput` logic from `action-audit.ts`, extracted to a
   shared location (`src/security/actions/redact.ts`) so both the logger
   path and the DB path apply the exact same rules and never drift apart.
5. **Hard payload cap** — serialized `metadata` truncated at a fixed size
   (e.g. 8 KB) with a `{ truncated: true, originalSize }` marker rather than
   storing arbitrarily large request bodies.
6. **Optional sampling** — `sampleRate` per category for high-volume,
   low-value events; `security_event` and `rbac_policy` are never sampled
   (compliance-critical), `server_action` may be.
7. **Partitioning over row-by-row delete** — `audit_events` is a native
   Postgres RANGE partition on `occurredAt` (monthly partitions). Dropping
   an aged-out partition is instant and avoids the VACUUM/bloat cost of
   deleting millions of rows individually. Drizzle has no first-class
   partition DDL, so partitioning is expressed as a raw SQL migration
   alongside the Drizzle-described table shape (documented in
   `docs/architecture/Enterprise-Ready DB layer/09 - MIGRATION FLOW (PROFESSIONAL).md`'s
   pattern for hand-authored migrations).
8. **Scheduled purge, not an in-app timer** — `scripts/audit-log/purge-expired.ts`,
   run as an external scheduled job (CI cron / platform scheduler), same
   operational model as `pnpm lt` and `migrate-cli.ts` are already CLI
   entrypoints rather than background threads. It drops partitions once
   every category present in that partition has aged past its configured
   retention, falling back to row-level `DELETE` for a partition that mixes
   a short-retention and a long-retention category.
9. **Async, best-effort writes** — the write path must never fail or slow
   the user's actual mutation. `ResilientAuditLogService` (same posture as
   the existing `ResilientFeatureFlagService`) wraps the Drizzle
   implementation: a DB write failure is logged and swallowed, never thrown
   back through `logActionAudit`/`logSecurityEvent`/route handlers.
10. **Visibility into cost** (v1.1, non-blocking) — a small admin-visible
    row-count-per-category readout so an admin can see the effect of a
    toggle before/after flipping it.

### A.5 Admin controls — the actual "switch on/off per feature" UI

- `/admin/audit-logs` — read/browse/filter the trail (category, actor,
  target, date range, outcome), paginated. (Phase 2+ — no trail exists yet.)
- `/admin/security` — the toggle matrix: one row per category with
  enabled / retention days / sample rate / capture-on-success / scope
  (global vs. this tenant's override) / last changed by+when. **Shipped in
  Phase 1 at this path, not `/admin/audit-logs/settings`** as originally
  sketched here — `src/app/admin/page.tsx` already advertised a "Security"
  hub card at `/admin/security` (status `coming-soon`) before this task;
  routing here fulfills that existing promise instead of creating a second,
  competing admin nav entry. See
  `01 - Architecture Guard - Summary.md`.
- Reuses the feature-flags admin pattern exactly:
  - `DrizzleAuditLogSettingsAdminService` — admin-only CRUD, **not**
    DI-registered (operator-only, low-frequency — same rationale documented
    on `DrizzleFeatureFlagAdminService`), every mutation takes a
    `MutationScope` (`{ tenantId } | null`) so a non-platform-admin caller
    can only ever touch their own tenant's override rows (SEC-26).
  - `GET/PATCH /api/admin/audit-log-settings` — ABAC-gated, with the
    existing `isEnvBasedPlatformAdmin` fallback, identical shape to
    `src/app/api/admin/feature-flags/route.ts`.
  - Effective-settings resolution (`effectiveFor(category, tenantId)` =
    tenant override row, else global row, else hardcoded taxonomy default)
    is implemented **once** in the module and consumed everywhere writes
    happen — never re-derived per call site.
- Authorization: reuse `RESOURCES.SECURITY` (not a new resource type) —
  `ACTIONS.SECURITY_READ_AUDIT` already exists and is already granted in the
  admin policy template for reading the trail; add one new action,
  `SECURITY_MANAGE_AUDIT_SETTINGS`, for toggling categories. This keeps the
  taxonomy consistent with the existing `SECURITY_MANAGE_POLICIES` /
  `SECURITY_READ_AUDIT` pair rather than inventing a parallel `AUDIT_LOG`
  resource for what is conceptually still a security-domain capability.

### A.6 Runtime write path

- New contract `AuditLogService` (`src/core/contracts/audit-log.ts`), DI
  token `AUDIT_LOG.SERVICE`, registered in the composition root the same
  way `AUTHORIZATION.SERVICE` is bound.
- `record(event: AuditEventInput): Promise<void>` — resolves effective
  category settings (cached per-request via the existing per-request
  container caching, see `docs/features/25 - Per-Request Container Caching.md`),
  applies enabled/sampling/capture-on-success, redacts, truncates, writes.
- **Two automatic integration points cover most of the app for free:**
  - `logActionAudit` (`src/security/actions/action-audit.ts`) calls
    `AuditLogService.record()` alongside its existing Pino call — every
    `createSecureAction` mutation is now DB-audited once its category is
    enabled, with zero per-feature wiring.
  - `logSecurityEvent` (`src/security/utils/security-logger.ts`) does the
    same for the `security_event` category.
- Everything that mutates **without** going through `createSecureAction`
  (see Part B.5 — this is most of `src/app/api/admin/**` today) needs an
  explicit `AuditLogService.record()` call added next to its existing
  `logger.info({ event: 'admin:...' })` line.
- Edge runtime (`src/proxy.ts`) cannot reach Postgres directly — rate-limit
  trips / internal-API-guard denials that should become `security_event`
  rows must go through the existing edge→node `/api/logs` ingest bridge
  (`docs/features/12 - Logging & Observability.md`), the same path edge
  logs already use, rather than a new direct DB dependency from Edge.

---

## Part B — Implementation location plan (what must be touched)

### B.1 New module scaffolding

- `src/modules/audit-log/domain/category.ts` — taxonomy + defaults (single source of truth for A.2's table)
- `src/modules/audit-log/domain/errors.ts`
- `src/modules/audit-log/infrastructure/drizzle/schema.ts` — `audit_log_settings`, `audit_events`, `auditCategoryEnum`
- `src/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogService.ts` — `record()` / query methods
- `src/modules/audit-log/infrastructure/drizzle/DrizzleAuditLogSettingsAdminService.ts` — settings CRUD (mirrors `DrizzleFeatureFlagAdminService`)
- `src/modules/audit-log/infrastructure/resilient/ResilientAuditLogService.ts` — swallow-and-log wrapper
- `src/modules/audit-log/factory.ts`, `src/modules/audit-log/index.ts`

### B.2 Core contracts / DI / authorization

- `src/core/contracts/audit-log.ts` — new contract
- `src/core/contracts/index.ts` — `AUDIT_LOG.SERVICE` token
- `src/core/contracts/resources-actions.ts` — add `ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS`
- `src/core/container/index.ts` (composition root) — bind `AUDIT_LOG.SERVICE`
- `src/modules/provisioning/policy/templates.ts` — grant the new action alongside the existing `SECURITY_READ_AUDIT` grant

### B.3 Database

- `src/core/db/migrations/generated/00XX_audit_log.sql` (drizzle-kit generated table shape)
- Hand-authored follow-up migration for native monthly RANGE partitioning
- `scripts/audit-log/purge-expired.ts` — new scheduled CLI job

### B.4 Security-layer integration points (automatic coverage)

- `src/security/actions/action-audit.ts` — `logActionAudit()`
- `src/security/utils/security-logger.ts` — `logSecurityEvent()`
- `src/security/actions/redact.ts` (new, extracted) — shared redaction used by both the logger path and the DB path

### B.5 Explicit call sites — every admin route that mutates outside `createSecureAction`

These currently log via ad hoc `logger.info({ event: 'admin:...' })` and need
one `AuditLogService.record()` call added at each mutation branch:

| Route | Category |
| --- | --- |
| `src/app/api/admin/users/route.ts`, `.../[id]/route.ts` | `admin_access` |
| `src/app/api/admin/organizations/route.ts`, `.../[organizationId]/route.ts` | `organization` |
| `src/app/api/admin/organizations/[organizationId]/policies/**` | `rbac_policy` |
| `src/app/admin/organizations/[organizationId]/roles/**`, `.../members/**`, `.../invitations/**` (+ their server actions) | `rbac_policy` / `membership` |
| `src/app/api/admin/feature-flags/route.ts`, `.../[id]/route.ts` | `feature_flag` |
| `src/app/api/admin/waitlist/route.ts`, `.../[id]/route.ts` | `waitlist` |
| `src/app/admin/layout.tsx` (`admin_guard:access_allowed_*` / `access_denied`) | `admin_access` |

### B.6 Auth events

- `src/modules/auth/infrastructure/**` (Clerk/AuthJS adapters) — sign-in,
  sign-out, sign-up, password reset, session revocation → category `auth`.
  Exact hook points depend on which provider is active; confirm at
  implementation time against the current `AUTH_PROVIDER` wiring.

### B.7 Admin UI

- `src/app/admin/audit-logs/page.tsx` + `AuditLogsClient.tsx` (list/filter, mirrors `feature-flags/page.tsx` + `FeatureFlagsClient.tsx`) — Phase 2+, no trail table yet.
- `src/app/admin/security/page.tsx` + `AuditSettingsClient.tsx` (the toggle matrix) — **shipped in Phase 1**, at `/admin/security` (see A.5 note on the path correction).
- `src/app/admin/page.tsx` — Security hub card flipped from `coming-soon` to `active` — **shipped in Phase 1**.
- `src/app/api/admin/audit-log-settings/route.ts` — GET/PATCH/DELETE, mirrors `feature-flags/route.ts` (DELETE added for "reset to default", body-keyed by `category` rather than a URL `[id]` since categories are a fixed natural key, not an opaque row id) — **shipped in Phase 1**.
- `src/app/api/admin/audit-logs/route.ts` — GET list with filters/pagination, gated by `SECURITY_READ_AUDIT` — Phase 2+, no trail table yet.

### B.8 Tests

- `DrizzleAuditLogService.db.test.ts`, `DrizzleAuditLogSettingsAdminService.db.test.ts`
- Unit tests: redaction, truncation, sampling, effective-settings resolution (global vs. tenant override), `set null` FK behavior on actor deletion
- `route.test.ts` for both new admin API routes, following the existing admin route test shape
- Purge script test (partition-drop vs. mixed-retention row delete)

### B.9 Docs

- `docs/features/36 - Audit Logging & Retention.md` (written once implemented, describing the shipped design + category table + env vars)
- Update `docs/features/20 - Enterprise Security Architecture.md` §6/§7 to describe the DB-backed trail alongside Pino/Logflare, and add any new env vars to its config table
- Update `docs/architecture/10 - Modular Monolith - File Catalog.md` with the new module
- `.env.example` + `src/core/env.ts` — new vars if introduced (e.g. `AUDIT_LOG_PURGE_ENABLED`)

---

## Phase status

- **Phase 1 — COMPLETE (2026-08-20).** `audit_log_settings` schema +
  migration (`0015_messy_doctor_faustus.sql`), `DrizzleAuditLogSettingsAdminService`
  (admin CRUD, not DI-registered), `ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS`
  (+ granted in the admin/owner policy template, `POLICY_TEMPLATE_VERSION`
  bumped to 2 so existing tenants get reconciled), `/api/admin/audit-log-settings`
  (GET/PATCH/DELETE), `/admin/security` toggle-matrix UI, and the admin hub
  card flipped from `coming-soon` to `active`. Full test coverage: domain
  unit tests, a real-DB (PGlite) service test suite including SEC-26
  tenant-scoping regressions, a mocked route test suite (also SEC-26), and
  a component test for the client. `pnpm typecheck`, `pnpm test`,
  `pnpm test:db`, `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check`
  all pass. `pnpm lint --fix` skipped per the documented ESLint agent-shell
  blocker (still in force at time of writing) — `prettier --write` run
  directly on every changed file instead. No `audit_events` table, no
  writer, and no existing route/action instrumentation in this phase —
  those remain Phase 2+.
- **Phases 2-5 — not started.**

## Rollout sequencing (recommended, low blast radius first)

1. **Schema + settings CRUD + admin toggle UI**, no writers yet — ships the
   "admin can configure" surface safely, with retention already governed
   before any row is ever written.
2. **Wire `logActionAudit` + `logSecurityEvent`** — automatic coverage for
   every `createSecureAction` mutation and every existing security event.
3. **Instrument the explicit admin routes** (B.5 table) one module at a time.
4. **Ship the read UI** (`/admin/audit-logs` browser) + partitioning + the
   scheduled purge job.
5. **Auth-event instrumentation** + docs finalization (`docs/features/36`,
   update `20`, update the architecture file catalog).

Each phase is independently reviewable and DB growth risk stays bounded:
retention is live before Phase 2 starts writing, and the highest-volume
call sites (Phase 3) land after the toggle/retention machinery already
exists to control them.

## Acceptance criteria (for the implementation task, not this one)

- [ ] Admin can view/edit the category matrix (enabled, retention, sample
      rate, capture-on-success), scoped correctly (platform admin
      unscoped, tenant admin scoped to their own tenant per SEC-26).
- [ ] Disabling a category stops new DB writes for it on the next request —
      no redeploy required, unlike today's `SECURITY_AUDIT_LOG_ENABLED`.
- [ ] No unredacted secret/PII field is ever persisted (verified by unit
      tests reusing the shared redactor).
- [ ] Data is actually removed on schedule per configured retention
      (verified by the purge script's test).
- [ ] An audit-write failure never fails or delays the underlying
      user-facing request (verified by a forced-DB-failure test against
      `ResilientAuditLogService`).
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm skott:check:only`, `pnpm depcheck`,
      `pnpm env:check` pass on the implementation branch; `pnpm lint --fix`
      run and reported (or explicitly noted as skipped if the documented
      shell-hang blocker is still in force at that time).

## Known risks / open decisions to confirm before implementation

- **Category granularity**: the ten categories in A.2 are a starting
  proposal — confirm against actual compliance requirements before coding
  the enum (adding a category later is a migration, not a config change).
- **Partition strategy for mixed retention**: a partition can only be
  dropped once every category present in it has aged out; if retention
  policies diverge a lot in practice, consider partitioning by
  `(category, month)` instead of `month` alone — re-evaluate once real
  category/retention choices are confirmed.
- **Neon/Supabase-hosted Postgres**: confirm native declarative partitioning
  is available on the actual hosting tier before committing to it as the
  retention mechanism (see `docs/architecture/Enterprise-Ready DB layer/07 - Postgres Driver (Supabase - PROD).md`).
- **Auth event hook points**: depend on which auth provider is active
  (`src/modules/auth/infrastructure/**`); confirm exact hook surface at
  implementation time rather than assuming Clerk-only.
