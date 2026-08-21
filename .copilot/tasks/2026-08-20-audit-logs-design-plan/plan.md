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

| Capability                             | Today                                                                                            | Gap                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Structured logging of mutations        | ✅ `logActionAudit` (Pino, redacted, Logflare-shippable)                                         | Log lines only — not queryable in-app, not retained on a schedule you control      |
| High-severity security events          | ✅ `logSecurityEvent` (fatal-level, alertable)                                                   | Same — log-only                                                                    |
| On/off control                         | ✅ `SECURITY_AUDIT_LOG_ENABLED` env var                                                          | Single global switch, redeploy to change, no per-category granularity, no admin UI |
| Admin-viewable trail                   | ❌                                                                                               | No in-app browse/search/filter of what happened                                    |
| Retention / DB-space control           | ❌ (nothing persists to DB yet)                                                                  | Needs explicit design before any DB writer ships                                   |
| RBAC for reading/managing audit config | 🟡 `SECURITY_READ_AUDIT` action already defined and already granted in the admin policy template | Defined but nothing implements it yet                                              |

The design below **adds a DB-backed, admin-manageable trail as a second
sink alongside** the existing Pino/Logflare pipeline — it does not replace
it. Logflare/New Relic remain the observability/alerting surface; the new
`audit_events` table is the compliance-grade, admin-queryable, retention-
governed record.

### A.2 Category taxonomy (this is "which features" the admin toggles)

Toggling must happen at a **category** granularity — coarse enough to be a
usable admin UI (not one switch per literal action name), fine enough that
turning off noisy, low-value categories actually saves meaningful DB space.

| Category         | Covers                                                   | Suggested default                                | Suggested default retention |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------ | --------------------------- |
| `auth`           | sign-in/out, sign-up, password reset, session revocation | ON                                               | 180 days                    |
| `admin_access`   | admin-panel grant/deny (`admin_guard:*`)                 | ON                                               | 180 days                    |
| `organization`   | org create/update/status change                          | ON                                               | 365 days                    |
| `membership`     | invite, accept, revoke, role change                      | ON                                               | 365 days                    |
| `rbac_policy`    | role/policy create/update/delete                         | ON                                               | 365 days                    |
| `feature_flag`   | flag create/update/delete                                | ON                                               | 90 days                     |
| `waitlist`       | approve/reject                                           | OFF                                              | 30 days                     |
| `billing`        | plan/subscription changes                                | ON                                               | 365 days                    |
| `security_event` | SSRF attempts, tenant violations, rate-limit trips       | ON, never sampled                                | 365 days                    |
| `server_action`  | generic `createSecureAction` catch-all not covered above | ON, success events capture minimal metadata only | 30 days                     |

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

| Route                                                                                                                    | Category                     |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `src/app/api/admin/users/route.ts`, `.../[id]/route.ts`                                                                  | `admin_access`               |
| `src/app/api/admin/organizations/route.ts`, `.../[organizationId]/route.ts`                                              | `organization`               |
| `src/app/api/admin/organizations/[organizationId]/policies/**`                                                           | `rbac_policy`                |
| `src/app/admin/organizations/[organizationId]/roles/**`, `.../members/**`, `.../invitations/**` (+ their server actions) | `rbac_policy` / `membership` |
| `src/app/api/admin/feature-flags/route.ts`, `.../[id]/route.ts`                                                          | `feature_flag`               |
| `src/app/api/admin/waitlist/route.ts`, `.../[id]/route.ts`                                                               | `waitlist`                   |
| `src/app/admin/layout.tsx` (`admin_guard:access_allowed_*` / `access_denied`)                                            | `admin_access`               |

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
- **Phase 2 — COMPLETE (2026-08-20).** `audit_events` table + migration
  (`0016_wise_norman_osborn.sql`), `AuditLogService` contract
  (`src/core/contracts/audit-log.ts`) + `AUDIT_LOG.SERVICE` DI token,
  **DI-registered** (unlike Phase 1's admin CRUD service) in
  `src/core/runtime/bootstrap.ts`, `DrizzleAuditLogService` (effective-setting
  resolution, enabled/sampling/`captureInputOnSuccess` gating, redaction-cap,
  insert), `ResilientAuditLogService` (fail-open wrapper), and redaction
  extracted to `src/security/actions/redact.ts`. `logActionAudit`
  (category `server_action`) and `logSecurityEvent` (category
  `security_event`, outcome `failure`) both now call
  `AuditLogService.record()` alongside their unchanged Pino calls.
  Two design deviations from this doc's original sketch, found while
  wiring the writer (see `01 - Architecture Guard - Summary.md`'s Phase 2
  entry for full reasoning): redaction lives in `src/security/actions/`,
  not `src/modules/audit-log` (module dependency direction forbids it);
  `audit_events.tenantId` is `text`, not `uuid`+FK (a real external
  provider org id can appear there, not just internal `tenants.id` UUIDs),
  and `organizationId` was dropped from the schema until a real caller
  needs it. Both resolution-of-the-service and `record()` itself are
  wrapped fail-open at the call site (`action-audit.ts`/`security-logger.ts`),
  since a container that never registered `AUDIT_LOG.SERVICE` (confirmed:
  the global unit-test double in `tests/setup.tsx`) throws on `resolve()`
  before `ResilientAuditLogService`'s own guarantee ever applies. Verified
  against the full unit suite (207 files / 1437 tests) including
  `src/testing/integration/server-actions.test.ts` (the one test file using
  the real, non-mocked composition root) and the full DB suite (16 files /
  132 tests) with new real-Postgres(PGlite) coverage for
  `DrizzleAuditLogService`. `pnpm typecheck`, `pnpm test`, `pnpm test:db`,
  `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check` all pass.
  `pnpm lint --fix` was initially skipped per the documented blocker, then
  actually run mid-phase on explicit user instruction that the blocker is
  Codex-specific and does not reproduce in Claude Code's shell (confirmed:
  it doesn't) — the resulting 3 new-code `security/detect-object-injection`
  warnings in `src/modules/audit-log/domain/category.ts`/`.test.ts` were
  fixed (bracket access on a `Record<AuditCategory, ...>` replaced with a
  `Map`-backed accessor), leaving only pre-existing, unrelated warnings
  repo-wide. The blocker note itself was narrowed to Codex-only across
  `AGENTS.md`, `CLAUDE.md`, `docs/ai/general/REPOSITORY_AI_CONTEXT.md`, and
  the two Claude skill files that quoted it. No partitioning, no purge job,
  and no explicit admin-route instrumentation yet — `audit_events` grows
  unbounded until Phase 4 ships retention enforcement, which is an
  accepted, deliberate risk of this phase's sequencing (Phase 1 already
  shipped the retention _configuration_ surface before any row was ever
  written; only the _enforcement_ job is still pending).
- **Phase 3 — COMPLETE (2026-08-20).** Instrumented every existing
  `/api/admin/**` mutation route (confirmed: none use `createSecureAction`,
  so none had Phase 2's automatic coverage) plus `src/app/admin/layout.tsx`'s
  admin-panel access-grant/deny events. New shared helper
  `src/security/actions/record-admin-audit-event.ts` (a standalone copy of
  Phase 2's resolve+record+catch pattern, not a further extraction of
  `action-audit.ts`/`security-logger.ts` — three call sites wasn't enough
  duplication to justify coupling already-shipped code to a new shared
  module) is called at ~19 mutation success points across 15 route files:
  `feature_flag` (create/update/delete), `organization` (update_status),
  `rbac_policy` (policy create/update/delete, role create/rename/delete),
  `membership` (member role update, invitation create/revoke ×2 route
  shapes), `admin_access` (user update/deactivate, admin-panel
  access-granted/denied ×3), `waitlist` (approve/reject). Category
  mapping matches `plan.md` Part B.5 exactly. Scope intentionally limited
  to each route's existing mutation-success point (matching the plan's own
  text) — 403/404/409 branches are not separately audited, and where a
  route had no pre-existing `logger.info` call, none was added; only the
  new `recordAdminAuditEvent` call was.
  Wiring-verification test assertions were added to 5 representative
  existing route test files spanning 4 of the 5 touched categories
  (`feature-flags/route.test.ts`, `organizations/[organizationId]/route.test.ts`,
  `organizations/[organizationId]/members/[userId]/route.test.ts`,
  `users/[id]/route.test.ts`, `invitations/route.test.ts`) plus a full unit
  suite for the new helper itself
  (`record-admin-audit-event.test.ts`, 3 tests). **Not** added to every one
  of the ~15 touched files: the `rbac_policy` route test files
  (`policies/route.test.ts`, `policies/[policyId]/route.test.ts`,
  `roles/route.test.ts`, `roles/[roleId]/route.test.ts`) have **no existing
  success-path test at all** (pre-existing gap, not introduced by this
  phase — they only test the archived-organization 409 guard). Adding
  those from scratch was out of scope for this phase; flagged as residual
  test-coverage debt below.
  **Security finding — found here, fixed as a separate follow-up commit
  at the user's request (not folded into the Phase 3 commit):** while
  reading `waitlist/[id]/route.ts`'s `POST` handler to wire its audit
  event, found it had **no admin authorization check at all** — unlike
  its sibling `GET` handler (which calls `checkAdminAccess`), `POST` only
  relied on `withNodeProvisioning` (authenticated + provisioned, not
  admin). Any authenticated, provisioned user could call
  `POST /api/admin/waitlist/[id]?action=approve` and create a real
  invitation. Reported via `AskUserQuestion`; user chose to fix it
  immediately. Fixed by adding the same `checkAdminAccess()` gate the
  sibling `GET` already has, plus a full new test file for this route
  (`waitlist/[id]/route.test.ts` — it had none before, itself a
  pre-existing gap now closed) covering the 403/admin-grant/success/audit
  paths. Documented as `SEC-27` in
  `docs/ai/general/SECURITY_CODING_PATTERNS.md`. Full writeup:
  `02 - Security & Auth - Summary.md`'s Phase 3 entry.
  Validated: `pnpm typecheck`, `pnpm test` (209 files/1446 tests), `pnpm test:db`
  (16 files/132 tests), `pnpm skott:check:only`, `pnpm depcheck`,
  `pnpm env:check`, and `pnpm lint --fix` (0 errors, only pre-existing
  unrelated warnings) all pass.
- **Phase 4 — COMPLETE (2026-08-20).** Shipped the read/browse UI and
  retention-enforcement job — the two pieces `audit_events` needed to stop
  being a table nothing ever reads or deletes from.
  `DrizzleAuditLogReadService` (deliberately not DI-registered, same
  rationale as Phase 1's settings-admin service) backs a new
  `GET /api/admin/audit-logs` route: filterable (category, outcome,
  actorUserId, targetType/targetId, date range), paginated (`limit` capped
  at 200, default 50), gated on `ACTIONS.SECURITY_READ_AUDIT` (pre-existing,
  previously-unused) or `isEnvBasedPlatformAdmin`. SEC-26-correct: a
  non-platform-admin caller's requests are always routed through
  `listForTenant(access.tenant.tenantId, …)`, never the unscoped
  `listGlobal`, and `listForTenant` scopes strictly to
  `tenantId = callerTenantId` — no override/overlay semantic like the
  settings table has, since an audit trail has no "global default" a
  tenant-scoped viewer should ever see. `/admin/security/audit-logs`
  (new `page.tsx` + `AuditLogsClient.tsx`) is a sibling of the existing
  `/admin/security` settings page, linked from it via a "View audit trail →"
  header link (the settings URL itself did not move); filter form, a
  paginated table with expandable per-row metadata detail, and a scope
  banner distinguishing "all tenants" from "your tenant only".
  Retention enforcement: `resolveEffectiveSetting` was extracted out of
  `DrizzleAuditLogService` into a shared
  `infrastructure/drizzle/effective-settings.ts` (`resolveEffectiveAuditSetting`)
  so the write path and the purge job resolve "is this enabled / what's the
  retention" identically and can never drift apart. The purge logic itself
  lives in `infrastructure/drizzle/purge-expired-events.ts`
  (`listPresentCategoryTenantPairs` + `purgeExpiredAuditEvents`, batched
  `DELETE`s of 500 rows at a time per (category, tenantId) pair, looping
  until nothing older than that pair's currently-effective retention
  remains) so it gets real-DB test coverage under the existing
  `src/**/*.db.test.ts` convention; `scripts/audit-log/purge-expired.ts` is
  a thin CLI wrapper (env/driver resolution, `--dry-run` flag, structured
  console output, `dbRuntime.close?.()` cleanup, non-zero exit on fatal
  error) following this repo's established standalone-script pattern
  (`import '../load-env'`, per-script `resolveProvider`/`resolveDriver`/
  `resolveDatabaseUrl`, duplicated rather than shared — same as
  `scripts/db-seed.ts` and `scripts/flags/migrate.ts`). Wired as a daily
  scheduled job: `.github/workflows/audit-log-purge.yml` (cron `0 3 * * *`
  UTC + `workflow_dispatch`), using the same
  `vercel pull --environment=production --token=…` pattern
  `prod-deploy.yml` already uses to obtain `.vercel/.env.production.local`
  — confirmed via `.github/workflows/*.yml` that this repo has no raw
  `DATABASE_URL` secret pattern for scheduled workflows, so this reuses the
  existing one rather than inventing a new secret. New `package.json`
  scripts: `audit-log:purge`, `audit-log:purge:dry-run`,
  `audit-log:purge:prod:local`, `audit-log:purge:vercel:prod` (the last is
  what the workflow invokes).
  **Deliberately deferred, not attempted this phase: native Postgres table
  partitioning** (this doc's Part A.4 item 7 / Part B.3). Converting the
  already-created plain `audit_events` table to a partitioned one is a real
  data migration this remote session cannot safely verify against the
  actual production database, and the plan's own text already flagged it as
  needing hosting-tier confirmation first (Neon/Supabase declarative
  partitioning support — see "Known risks" below). The row-level
  batched-`DELETE` purge job shipped this phase fully satisfies the
  retention-enforcement requirement on its own — partitioning is a
  performance/VACUUM-cost optimization on top of working retention
  enforcement, not a prerequisite for it. Revisit once the row-level purge
  job's real-world volume/duration is known from production runs.
  New tests: `purge-expired-events.db.test.ts` (9 cases: taxonomy-default
  retention, admin-configured retention override, dry-run, batching loop,
  null-tenant vs. real-tenant scoping, empty-table edge case),
  `DrizzleAuditLogReadService.db.test.ts` (7 cases: global listing,
  category/outcome filters, newest-first pagination, SEC-26 tenant
  scoping, combined tenant+filter scoping), `route.test.ts` for
  `/api/admin/audit-logs` (8 cases mirroring the audit-log-settings route
  test's auth/SEC-26/validation shape), `AuditLogsClient.test.tsx` (7
  cases: listing, scope banners, empty state, error state, row expansion,
  filter submission, pagination), and `purge-expired.test.ts` (pure
  `resolveDatabaseUrl` coverage, mirroring `db-seed.test.ts`'s convention
  of not exercising DB-query-chaining logic directly in `scripts/`).
  Validated: `pnpm typecheck`, `pnpm test` (212 files/1467 tests),
  `pnpm test:db` (18 files/145 tests), `pnpm skott:check:only`,
  `pnpm depcheck`, `pnpm env:check`, and `pnpm lint --fix` (0 errors, only
  pre-existing unrelated warnings) all pass.
- **Residual test-coverage debt (flagged in Phase 3) — CLOSED (2026-08-20).**
  `policies/route.test.ts`, `policies/[policyId]/route.test.ts`,
  `roles/route.test.ts`, `roles/[roleId]/route.test.ts` previously only
  exercised the 409-archived-organization branch, with no success-path
  coverage at all. Added, per route: a 403 (non-organizations-admin caller)
  case, a success case for an active organization asserting the mutation
  service is called with the right arguments and that
  `recordAdminAuditEvent` fires with the correct
  category/action/outcome/target, and one representative domain-error
  branch (404/409/400, matching each route's own catch block) confirming
  the audit event is **not** recorded when the mutation fails. 18 new tests
  (1467 → 1485). `pnpm typecheck`, `pnpm lint --fix` (0 errors), and the
  full unit suite (212 files/1485 tests) all pass. Shipped as its own
  commit, separate from Phase 5's docs work.
- **Phase 5 — COMPLETE (2026-08-20).** Docs-only phase, no code changes.
  New `docs/features/36 - Audit Logging & Retention.md`: full design
  writeup (architecture, category taxonomy table, settings model, write
  path + wired call sites, browse UI, purge job + scheduled workflow +
  the partitioning-deferral rationale, security notes, testing, "adding a
  new category" runbook). `docs/features/20 - Enterprise Security
Architecture.md` §6 gained a new §6.3 pointing at the new doc and
  distinguishing the DB-backed trail from the existing Pino/Logflare
  sink; §7's config table entry for `SECURITY_AUDIT_LOG_ENABLED` was
  corrected rather than left inaccurate (see drift note below).
  `docs/architecture/10 - Modular Monolith - File Catalog.md` §8.4 gained
  a `modules/audit-log` entry cataloguing every file in the module,
  matching the format already used for `modules/auth`/`modules/authorization`/`modules/user`.
  No new env vars were introduced by Phases 1-4, so `.env.example` /
  `src/core/env.ts` needed no changes (the plan's original
  `AUDIT_LOG_PURGE_ENABLED` was an illustrative placeholder, never
  actually needed — retention is governed entirely by per-category DB
  settings plus the scheduled workflow, with no separate kill-switch env
  var).
  **Drift found and corrected, not silently reconciled:** while writing
  §6.3/§7, confirmed by direct grep that `SECURITY_AUDIT_LOG_ENABLED`
  (`src/core/env.ts`) is defined in the env schema but is **not** read by
  `logActionAudit`, `logSecurityEvent`, `recordAdminAuditEvent`, or
  anywhere else in `src/security/` — it does not actually gate anything
  today, despite `docs/features/20`'s §7 table (pre-existing, before this
  task) describing it as "Toggle structured audit logging" and this
  task's own `intake.md` (Phase 0) having repeated that same
  characterization without independently re-verifying it. The table entry
  now states the actual (unwired) state of the code and points at where
  the DB-backed trail's real on/off control lives instead. The
  underlying dead-code cleanup (wiring the var up, or removing it) is out
  of scope for this task and was not attempted.
  **Also noted, not fixed (separate pre-existing gaps, out of scope):**
  `modules/feature-flags` has no catalog entry in
  `docs/architecture/10 - Modular Monolith - File Catalog.md` §8.4 either
  (predates this task) — `modules/audit-log` was added without
  backfilling that sibling gap, to keep this phase's diff scoped to the
  module it actually shipped. §9.4's DB-ownership traceability matrix
  also does not list `feature_flags`' or `audit_events`'/`audit_log_settings`'
  schema anchors — same reasoning, left alone.

- **Phase 6 — IMPLEMENTATION COMPLETE / EXECUTION BLOCKED (2026-08-21).**
  E2E validation of the shipped feature, at the user's explicit request:
  enable a normally-off category, disable a normally-on category, perform
  real actions mapped to each, assert enabled categories record events and
  disabled categories record none, and assert category filters never mix
  categories. New `Admin Audit Logs (/admin/security)` describe block in
  `e2e/admin.spec.ts` (6 cases) plus a new `pnpm e2e:admin:audit-logs`
  script (`AUTH_PROVIDER=authjs FEATURE_FLAG_PROVIDER=db
REGISTRATION_MODE=invite-only E2E_BACKEND_MODE=container`).
  **Confirmed via `AskUserQuestion` before implementing:** "login" has no
  wired audit write path at all — grep-confirmed the `auth` category (see
  the still-open "Auth event hook points" risk noted above, never resolved
  in Phases 1-4) has zero call sites in production code, only taxonomy
  defaults. Substituted admin-panel access (`admin_access`, genuinely
  wired via `admin/layout.tsx`) as the login-analog, per the user's choice.
  Categories exercised: `feature_flag` (enable-by-default, create/update/delete
  cycle), `waitlist` (explicitly toggled on via the settings UI, entry
  created via the public `POST /api/auth/waitlist` + approved via the admin
  UI), `admin_access` (explicitly toggled off via the settings UI —
  demonstrates a normally-on category's write stops immediately, no
  redeploy, while admin-panel access itself keeps working since the audit
  toggle never gates authorization). Category-isolation asserted both via
  `GET /api/admin/audit-logs?category=...` (every returned event's
  `category` field matches the filter) and via the `/admin/security/audit-logs`
  browse UI. `pnpm typecheck` and `pnpm lint --fix` both pass clean.
  **Execution blocked in this session**, not by anything in the new test
  code: no Docker daemon (blocks the shipped script's
  `E2E_BACKEND_MODE=container`) and no Clerk E2E test credentials anywhere
  this session can read (blocks Playwright's global setup unconditionally
  — confirmed this would block the pre-existing `pnpm e2e:authjs:core`
  identically in this same session, so it is a session/environment gap,
  not something specific to this work). Full detail, evidence, and the
  exact re-run command: `07 - Playwright E2E - Summary.md`. Do not treat
  this coverage as verified until it has actually been run somewhere with
  Docker + Clerk credentials and that summary's Scenario Status Mapping
  has been updated with real results.

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

## PR #72 CI fixes (2026-08-21)

Two failures surfaced on PR #72 after Phase 6 pushed — neither is new scope,
both are fixed directly on this branch:

- **Deploy Preview failure (root cause, not a symptom of my E2E work):**
  `pnpm db:migrate:prod` — which the preview build runs before `pnpm build`
  — applies migrations via `drizzle-kit migrate` successfully, then calls
  `repairKnownMigrationJournalDrift()`/`validateMigrationJournal()`
  (`scripts/validate-migration-journal.ts`) to reconcile the journal against
  the live DB. Both funnel through `readMigrationSql()`, a hardcoded switch
  over every known migration tag that must be updated by hand per new
  migration — Phase 1 and Phase 2's migrations
  (`0015_messy_doctor_faustus`, `0016_wise_norman_osborn`) were never added
  to it, so the switch's `default` throws `Unsupported journal entry`,
  which the wrapper script treats as fatal even though the actual SQL had
  already applied cleanly. Fixed by adding both as new `case` entries,
  exactly matching every prior entry's shape. Verified locally (no live DB
  needed for this part): `resolveExpectedMigrations()` now resolves all 17
  entries without throwing.
- **Codacy critical (Security, `DrizzleAuditLogService.ts:74`):** flagged
  `Math.random()` as a weak PRNG. Not a real vulnerability here — it only
  decides whether a `success` event survives sampling, never a
  security-significant value — but fixing it outright is cheaper than
  carrying a suppression annotation forward, so replaced with
  `crypto.randomInt`-backed `randomUnitInterval()` (six-decimal-digit
  resolution, far finer than any configured `sampleRate`). No behavior
  change: `sampleRate: 0`/`1` boundary tests are unaffected (deterministic
  regardless of RNG), and the "never drop failure/denied" sampling
  invariant is untouched.

`pnpm typecheck`, `pnpm lint --fix` (0 errors), the full unit suite (212
files/1485 tests), and `pnpm test:db` (18 files/145 tests — confirmed
flaky-not-broken via two consecutive full runs, both 18/18 green) all pass
on this branch after both fixes.
