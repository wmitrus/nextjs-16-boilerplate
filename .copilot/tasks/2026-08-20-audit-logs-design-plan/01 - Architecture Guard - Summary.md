# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-08-20-audit-logs-design-plan`
- Task Objective: Implement Phase 1 of the audit-logging plan — settings schema, admin CRUD service, admin API route, admin toggle UI. No writer/instrumentation yet.
- Current Run Scope: Phase 1 only (`audit_log_settings`, not `audit_events`).
- Status: COMPLETED
- Last Updated: 2026-08-20
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

- what the next agent should rely on: the `/admin/security` routing decision and the non-DI-registered admin-CRUD-service pattern are both settled — do not re-litigate without new evidence.
- what should not be re-decided without new evidence: resource/action reuse (`RESOURCES.SECURITY` + `SECURITY_MANAGE_AUDIT_SETTINGS`), module placement, migration mechanism (`pnpm db:generate` against the existing glob config).
- recommended next specialist or step: Security/Auth review (SEC-26 tenant-scoping on the new route), then Implementation.

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Phase 1 implementation kickoff
- Summary of change: Initial architecture review completed; `/admin/security` routing correction identified and approved.
- Sections refreshed: all
