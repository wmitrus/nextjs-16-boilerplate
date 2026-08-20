# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-08-20-audit-logs-design-plan`
- Task Objective: Implement the audit-logging plan phase by phase. Phases 1-3 are complete.
- Current Run Scope: Phase 3 — explicit instrumentation of every `/api/admin/**` mutation route plus `src/app/admin/layout.tsx`'s admin-panel access events, via a new shared `recordAdminAuditEvent` helper.
- Status: COMPLETED
- Last Updated: 2026-08-20 (Phase 3)
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- modules / layers reviewed: `src/modules/feature-flags/**` (structural precedent), `src/core/contracts/**`, `src/core/db/**`, `src/app/admin/**`, `src/app/api/admin/**`
- change surface reviewed: new module scaffolding, DI/contract additions, new route, new admin UI route
- architecture questions in scope: module placement, DI registration (or deliberate non-registration), dependency direction, migration mechanism

## Inputs Reviewed

- code paths reviewed: `src/modules/feature-flags/{factory.ts,index.ts,infrastructure/drizzle/*}`, `src/app/api/admin/feature-flags/route.ts`, `src/app/admin/feature-flags/*`, `src/core/contracts/resources-actions.ts`, `src/modules/provisioning/policy/templates.ts`, `src/core/db/migrations/config/drizzle.dev.ts`, `src/app/admin/page.tsx`
- docs / ADRs / prompts reviewed: `AGENTS.md`, `docs/ai/general/REPOSITORY_AI_CONTEXT.md`, `docs/architecture/10 - Modular Monolith - File Catalog.md` (module layering rules)
- earlier task artifacts reviewed: this task's own `plan.md` (Part A/B)

## Actions Performed

- repository inspection performed: confirmed `src/modules/feature-flags/` is the load-bearing precedent for "admin-toggleable, DB-backed, tenant-scoped setting" (global row = `tenantId: null`, tenant override row, admin-only CRUD service intentionally excluded from DI)
- boundary checks performed: verified `modules -> core/shared` dependency direction is respected by the new module; verified no new dependency from `core` back into `modules`
- dependency / DI review performed: confirmed `DrizzleFeatureFlagAdminService` is deliberately **not** DI-registered (operator-only, low-frequency, directly instantiated at the route call site) — same rationale applies to the new `DrizzleAuditLogSettingsAdminService`, so it is built the same way
- docs-vs-code checks performed: found `src/app/admin/page.tsx` already advertises a `Security` hub card (`status: 'coming-soon'`, `href: '/admin/security'`, description "View audit logs, review security events, and manage API access policies") — this is undocumented in the design plan but is real, committed IA intent. Routing this phase's settings UI to `/admin/security` (rather than inventing `/admin/audit-logs/settings` as originally sketched in `plan.md`) fulfills that existing promise instead of creating a second, competing admin nav entry.

## Current-State Findings

- Confirmed: drizzle-kit's schema glob (`./src/modules/**/infrastructure/drizzle/schema.ts` in `src/core/db/migrations/config/drizzle.dev.ts`) auto-discovers a new module's `schema.ts` — no manual registration needed for `pnpm db:generate` to pick up `audit_log_settings`.
- Confirmed: `ACTIONS.SECURITY_READ_AUDIT` already exists in `src/core/contracts/resources-actions.ts` and is already granted in the admin/owner policy template (`src/modules/provisioning/policy/templates.ts:57`) — reusable as-is for the settings-read gate.
- Risks: none blocking. The `/admin/security` routing decision is a deliberate, documented deviation from the original `plan.md` sketch (`/admin/audit-logs/settings`) — noted below and reflected in an update to `plan.md`.
- Drift: `plan.md` (written before this route was discovered) named `/admin/audit-logs/settings`; corrected during this phase per the finding above.

## Boundary And Dependency Assessment

- module ownership assessment: new `src/modules/audit-log/` module owns its own domain (`category.ts`, `errors.ts`) and Drizzle infrastructure, matching `feature-flags`' shape exactly. No cross-module reach-through.
- dependency direction assessment: `src/modules/audit-log` depends only on `@/core/db` (types) and `drizzle-orm` — no dependency on `app`, `security`, or sibling modules. `src/app/api/admin/audit-log-settings/route.ts` depends on the module, `@/core/contracts`, `@/security/*` — same shape as the feature-flags route.
- DI / composition assessment: `AuditLogService` (the future writer, Phase 2+) will get a DI token; the Phase-1 admin CRUD service (`DrizzleAuditLogSettingsAdminService`) is intentionally **not** DI-registered, consistent with `DrizzleFeatureFlagAdminService`.
- cross-module coupling assessment: `src/modules/provisioning/policy/templates.ts` gains one new action reference (`ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS`) alongside the existing `SECURITY_READ_AUDIT` grant — this is the same pattern already used for every other resource/action pair in that file, not a new coupling shape.

## Architectural Decisions / Constraints

- approved architectural constraints:
  - New module at `src/modules/audit-log/` with `domain/`, `infrastructure/drizzle/` subfolders, mirroring `feature-flags`.
  - `DrizzleAuditLogSettingsAdminService` is admin-only, not DI-registered, instantiated directly in the route handler (same as `DrizzleFeatureFlagAdminService`).
  - Reuse `RESOURCES.SECURITY` (not a new `RESOURCES.AUDIT_LOG`) — add `ACTIONS.SECURITY_MANAGE_AUDIT_SETTINGS` alongside the existing `SECURITY_READ_AUDIT`.
  - Settings UI ships at `/admin/security` (fulfilling the existing "coming soon" hub card), not `/admin/audit-logs/settings`.
- rejected directions: a new top-level `RESOURCES.AUDIT_LOG` resource type — rejected as unnecessary fragmentation of an already-established `SECURITY` resource taxonomy that already covers audit reading.
- follow-up architectural guardrails: the `audit_events` table and its writer (`AuditLogService`, DI-registered) are explicitly deferred to Phase 2+ per `plan.md`; do not pull that scope forward.

## Artifact Synchronization

- `plan.md` updates: Part A.5/B.7 route paths corrected from `/admin/audit-logs/settings` to `/admin/security`; Phase 1 checklist marked in progress/complete as implementation lands.
- `intake.md` updates: none required (findings above are additive, not corrective of intake).
- `implementation-plan.md` updates: not used for this task — `plan.md` serves that role.
- specialist artifact updates: this file created; `02 - Security & Auth - Summary.md` and `03 - Next.js Runtime - Summary.md` created alongside.

## Open Questions / Blockers

- unresolved questions: none blocking Phase 1.
- blockers: none.
- evidence still needed: none for this phase; Phase 2 (writer wiring) will need to confirm the partitioning strategy against the actual hosted Postgres tier before implementation.

## Handoff Notes

- what the next agent should rely on: the `/admin/security` routing decision and the non-DI-registered admin-CRUD-service pattern are both settled — do not re-litigate without new evidence. As of Phase 2: redaction-stays-in-security, `tenantId: text` (no FK) on `audit_events`, and `AUDIT_LOG.SERVICE` being DI-registered are all settled too.
- what should not be re-decided without new evidence: resource/action reuse (`RESOURCES.SECURITY` + `SECURITY_MANAGE_AUDIT_SETTINGS`), module placement, migration mechanism (`pnpm db:generate` against the existing glob config), the `text`-not-`uuid` tenantId column type on both `audit_log_settings` and `audit_events`.
- recommended next specialist or step: Phase 3 (instrument the explicit admin API routes) should start with a Security/Auth pass on which category each route maps to, then Implementation.

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 1 implementation kickoff
- Summary of change: Initial architecture review completed; `/admin/security` routing correction identified and approved.
- Sections refreshed: all

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 2 implementation kickoff
- Summary of change: Reviewed the writer path's module-boundary implications. Two decisions worth recording:
  1. **Redaction stays in `src/security/actions/redact.ts`, not in `src/modules/audit-log`.** The plan's Part A.4 said "extract redaction to a shared location" without naming where; `modules -> security` is not an allowed dependency direction (`docs/architecture/10 - Modular Monolith - File Catalog.md` §2.1), so the audit-log module cannot import a security-owned redactor. Redaction now happens on the caller's side (`action-audit.ts`/`security-logger.ts`) before the already-redacted value crosses the `AuditLogService` contract; the module only decides whether to _persist_ it (via `captureInputOnSuccess`) and applies its own generic size cap. Documented in `02 - Security & Auth - Summary.md`.
  2. **`audit_events.tenantId` is `text`, not `uuid`+FK** (differs from the plan's Part A.3 sketch, which proposed `uuid` referencing `tenants.id`). Found while wiring the writer: `RequestScopedTenantResolver` (`src/modules/auth/infrastructure/RequestScopedTenantResolver.ts`) can populate `SecurityContext.user.tenantId` with a raw external provider org id (not a `tenants.id` UUID) depending on `TENANT_CONTEXT_SOURCE`. A `uuid` FK column would hard-fail on insert for that configuration. Fixed to match `featureFlagsTable`/`auditLogSettingsTable`'s existing `text`, no-FK convention. `organizationId` was dropped from the Phase 2 schema for the identical reason — nothing populates it yet, and the same resolver shows the same internal-UUID-vs-external-id ambiguity for it; add it once a real caller (a later phase) settles which one it needs. `actorUserId` stays `uuid`+FK — `SecurityContext.user.id` is always the internal app user id.
  3. **`AuditLogService` is DI-registered** (`AUDIT_LOG.SERVICE` in `src/core/runtime/bootstrap.ts`, bound to `createAuditLogService(dbRuntime.db)`), unlike Phase 1's admin CRUD service — this is the real runtime writer, resolved via `getAppContainer()` from `logActionAudit`/`logSecurityEvent`, matching `FEATURE_FLAGS.SERVICE`'s registration shape exactly.
- Sections refreshed: Task Context, Boundary And Dependency Assessment (implicitly, via this entry), Handoff Notes

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 3 implementation kickoff
- Summary of change: Confirmed the plan's Part B.5 premise directly against the code: none of the ~17 `/api/admin/**` route files use `createSecureAction` (grep-confirmed), so none had Phase 2's automatic coverage — every mutation genuinely needed explicit instrumentation. Added one new shared helper, `src/security/actions/record-admin-audit-event.ts`, deliberately a standalone copy of the resolve+record+catch pattern already in `action-audit.ts`/`security-logger.ts` rather than a further extraction shared with them — three call sites (now four, counting this one) is not yet enough duplication to justify coupling two already-shipped, already-tested modules to a new one; revisit this decision if a Phase 4+ need calls for a fourth near-identical copy. A secondary finding while reading every route for correct category mapping: several routes (`organizations/[organizationId]/route.ts`, all four `roles`/`policies` route files) have **no pre-existing `logger.info` call on their mutation success path at all** — the plan's assumption that "each of these currently already logs" only held for `users`, `feature-flags`, and `waitlist`. Where missing, only the new audit-record call was added; backfilling missing Pino observability logging was treated as out of scope for this phase (a distinct, if related, gap).
- Sections refreshed: Scope Handled, Boundary And Dependency Assessment, Handoff Notes
