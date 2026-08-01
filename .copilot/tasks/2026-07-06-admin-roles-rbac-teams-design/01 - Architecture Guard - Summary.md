# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-07-06-admin-roles-rbac-teams-design`
- Task Objective: Decide whether AuthJS admin GUI work for `Roles`, `RBAC & Policies`, and `Teams` should be designed together or independently.
- Current Run Scope: Architecture re-review of the implemented replay-token client/server boundary remediation, modular-monolith boundary leaks, and release-readiness evidence.
- Status: COMPLETED
- Last Updated: 2026-07-21
- Related Control Artifacts:
  - `plan.md`
  - `intake.md`
  - `constraints.md`
  - `implementation-plan.md`

## Scope Handled

- modules / layers reviewed:
  - `src/app/admin/*`
  - `src/core/contracts/*`
  - `src/modules/authorization/*`
  - `docs/features/22 - RBAC Baseline.md`
  - `docs/features/23 - ABAC Foundation.md`
  - `docs/feature-desings/01 - Final Auth, Authorization and Provisioning Design.md`
- change surface reviewed:
  - administration GUI design for roles, policies, and teams
  - architecture-lint boundary violation in the AuthJS avatar menu sign-out path
- architecture questions in scope:
  - whether these should be one connected design slice or independent page-by-page GUI tracks
  - where the default post-auth landing path constant should live so module UI does not depend on app delivery code

## Inputs Reviewed

- code paths reviewed:
  - `src/app/admin/page.tsx`
  - `src/core/contracts/repositories.ts`
  - `src/modules/authorization/infrastructure/drizzle/schema.ts`
  - `src/modules/auth/ui/authjs/UserAvatarMenu.tsx`
  - `src/app/auth/post-auth-redirect.ts`
  - `src/shared/lib/routing/default-app-entry.ts`
  - `scripts/e2e/run-scenario.mjs`
  - `scripts/check-e2e-auth-env.mjs`
  - `e2e/clerk-auth.ts`
  - `src/features/security-showcase/components/SettingsFormExample.tsx`
  - `src/security/actions/action-replay.ts`
  - `src/security/actions/secure-action.ts`
  - `src/core/env.ts`
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
- docs / ADRs / prompts reviewed:
  - `AGENTS.md`
  - `docs/ai/general/00 - Agent Interaction Protocol.md`
  - `docs/ai/general/REPOSITORY_AI_CONTEXT.md`
  - `docs/features/22 - RBAC Baseline.md`
  - `docs/features/23 - ABAC Foundation.md`
  - `docs/feature-desings/01 - Final Auth, Authorization and Provisioning Design.md`
- earlier task artifacts reviewed:
  - `plan.md`
  - `intake.md`
  - `implementation-plan.md`
  - `02 - Security & Auth - Summary.md`

## Actions Performed

- repository inspection performed:
  - checked admin navigation surface versus current schema and contracts
  - traced the remaining architecture-lint failure to a module UI import from `src/app/auth/post-auth-redirect.ts`
  - traced the E2E failure to direct `@clerk/backend` imports in E2E tooling without a matching root dependency declaration
  - traced the replay-token blocker to a client component importing a server replay-store module that imports `@upstash/redis` and `@/core/env`
  - re-reviewed the implemented replay-token split after remediation and verified the client now imports a dependency-clean token factory while server validation remains in the server-only replay-store module
- boundary checks performed:
  - verified that roles, memberships, policies, and invitations are all organization-owned in live code
  - verified the only live `src/modules/** -> src/app/**` import was the AuthJS avatar menu importing `DEFAULT_APP_ENTRY_URL`
- dependency / DI review performed:
  - confirmed admin UI should stay thin over authorization/provisioning services
- docs-vs-code checks performed:
  - identified tenant-scoped wording drift in docs and admin card copy versus organization-scoped live schema
  - confirmed the post-auth landing path constant was owned too high in the app layer for its actual reuse surface
  - confirmed the admin RBAC task artifacts do not document or require the new Clerk Backend direct import; the new requirement is from the later Clerk E2E fixture hardening work
  - confirmed the Security & Auth summary now supersedes the previous production-ready signoff because the live import graph crosses the client/server boundary

## Current-State Findings

- Confirmed:
  - the previous replay-token boundary blocker is remediated: `src/features/security-showcase/components/SettingsFormExample.tsx` imports `createReplayToken()` from `src/security/actions/replay-token.ts`, not from the server replay-store module.
  - `src/security/actions/replay-token.ts` is a dependency-clean client-safe security leaf with no `@/core/env`, `@upstash/redis`, DI, repository, or `server-only` imports.
  - `src/security/actions/action-replay.ts` imports `server-only` and keeps `@upstash/redis`, `@/core/env`, replay validation, Redis-backed nonce persistence, and local non-production nonce storage on the server side.
  - production import-graph review shows `src/security/actions/action-replay.ts` is only imported by `src/security/actions/secure-action.ts`.
  - `Roles` and `RBAC & Policies` are two admin views over one authorization subsystem.
  - current authority is organization-scoped, not an independent `Teams` domain.
  - admin cards are navigation placeholders, not proof of separate bounded contexts.
  - the remaining architecture-lint release gate was a real boundary break: `src/modules/auth/ui/authjs/UserAvatarMenu.tsx` imported `@/app/auth/post-auth-redirect` only to read `DEFAULT_APP_ENTRY_URL`.
  - the minimum safe fix is to move `DEFAULT_APP_ENTRY_URL` to a lower shared routing abstraction and let the app helper depend on that lower abstraction, not the reverse.
  - `scripts/check-e2e-auth-env.mjs` now imports `createClerkClient` from `@clerk/backend` to validate configured Clerk fixture accounts before Playwright starts.
  - `e2e/clerk-auth.ts` now imports `createClerkClient` from `@clerk/backend` to create or repair mutable standalone Clerk E2E fixture users before sign-in.
  - `package.json` currently declares `@clerk/backend` as a direct dependency alongside `@clerk/nextjs` and `@clerk/testing`.
- Risks:
  - the original client-to-server replay import edge is no longer present in live code.
  - moving token creation into `src/shared/*` would make a security primitive look like a generic utility and weaken ownership; the better owner remains `src/security/actions/*`.
  - solving the issue by disabling replay validation, relaxing missing-token enforcement, or generating tokens inside the server action would undermine the security contract that Security & Auth just hardened.
  - page-by-page GUI design would force the app layer to invent missing semantics for role lifecycle, policy assignment, and organization scope.
  - a `Teams` page could hard-code the wrong structural concept before a real team model exists.
  - leaving the constant in `src/app` would keep an incentive for future module or feature code to reach upward into delivery code for routing defaults.
  - direct provider SDK use in E2E tooling is acceptable for test harness setup when declared explicitly as a root dependency; live `package.json` now satisfies that dependency-contract requirement.
- Drift:
  - older update entries in this artifact described the replay-token boundary as blocked; this 2026-07-21 re-review supersedes that stale state.
  - current card wording suggests custom roles per tenant and tenant-wide policy management, which does not match live organization-scoped code.
  - before this run, the default post-auth landing path was structurally treated as app-delivery state even though it is a reusable routing constant.
  - the validation report for this admin task records the default E2E base URL and AuthJS admin validations; the later Clerk fixture dependency drift has been resolved in live `package.json`.

## Boundary And Dependency Assessment

- module ownership assessment:
  - replay protection belongs in `src/security/actions`; token validation and replay-store persistence are server-owned, while token construction can be a client-safe security leaf because it contains no authority or persistence.
  - authorization domain owns roles, policies, and policy evaluation; provisioning and invitation flows own related write-side invariants.
  - the default post-auth landing path constant belongs below `src/app`, because both delivery code and module UI can legitimately consume it without inheriting app-route helper semantics.
- dependency direction assessment:
  - `features -> security` is allowed, but only if the imported security module is safe for the importing runtime. A client component must not import a security module that imports server env or server-only infrastructure.
  - admin GUI should depend on existing authorization/provisioning contracts, not redefine them.
  - `src/modules/**` must not import from `src/app/**`; the avatar menu import was an explicit reverse dependency and is now removed.
  - E2E tooling can depend on provider SDKs, but direct imports must be represented in package metadata; live `package.json` now declares `@clerk/backend` directly.
- DI / composition assessment:
  - the fix must not route token generation through DI or the app container. Replay-token creation is pure client-safe construction; replay validation remains server-side and owns the Redis/local-store dependency.
  - current composition keeps authority in server-side services; that should remain intact.
- cross-module coupling assessment:
  - roles, memberships, policies, and invitations are tightly coupled through organization ownership and should be designed together.
  - the fixed leak was not a DI problem; it was a constant-ownership problem best solved by extraction, not by duplicating route strings in the module.

## Architectural Decisions / Constraints

- approved architectural constraints:
  - split `createReplayToken()` into a client-safe module under `src/security/actions/`.
  - keep `validateReplayToken()` and nonce persistence in `src/security/actions/action-replay.ts`.
  - mark the server replay-store module with `import 'server-only';` after the split.
  - keep the existing token shape unless Security & Auth deliberately revises the replay protocol.
  - use one integrated design pass with staged implementation.
  - keep management surfaces organization-scoped.
  - treat `Teams` as unresolved terminology or future modeling work until explicitly designed.
  - keep reusable route defaults and low-level routing constants in shared lower-layer utilities when they are consumed outside the app delivery layer.
- rejected directions:
  - leaving `SettingsFormExample.tsx` importing `src/security/actions/action-replay.ts`.
  - moving replay-token creation into `src/shared/*` as a generic helper.
  - importing `@/core/env`, `@upstash/redis`, DI, repositories, or server request helpers from any client-safe token factory.
  - weakening replay validation to avoid the client/server boundary issue.
  - three loosely coordinated page-by-page designs.
  - a standalone `Teams` implementation before its domain exists.
  - keeping `DEFAULT_APP_ENTRY_URL` in `src/app/auth/post-auth-redirect.ts` while module UI imports it from above.
  - duplicating `'/dashboard'` inside module UI just to appease the lint rule.
- follow-up architectural guardrails:
  - client-importable security modules must be dependency-clean and explicit about their runtime.
  - server-owned security modules that touch env, Redis, DB, request context, or DI should use `server-only` where practical.
  - avoid barrel exports that mix client-safe token helpers with server replay-store validation.
  - resolve terminology first.
  - keep policy logic and invariants out of delivery code.
  - do not use current admin card copy as authoritative architecture.
  - if future code only needs the default landing route, import it from the shared routing helper rather than from an app-layer redirect builder.

## Artifact Synchronization

- `plan.md` updates:
  - specialist review marked complete
  - remaining architecture release gate updated to reflect the boundary fix and implementation-agent follow-up validation
- `intake.md` updates:
  - none in this run
- `implementation-plan.md` updates:
  - added a focused replay-token boundary remediation plan with implementation steps, validation commands, and release criteria
- specialist artifact updates:
  - this summary refreshed with the replay-token boundary decision and handoff notes

## Open Questions / Blockers

- unresolved questions:
  - whether the product intends `Teams` to mean organizations in current UI or a future nested/team abstraction
- blockers:
  - no architecture blocker remains for the reviewed replay-token boundary remediation.
  - no architecture blocker remains in the reviewed `modules -> app` leak itself.
  - no package-declaration architecture blocker remains for the reviewed Clerk E2E tooling dependency edge.
- evidence still needed:
  - none for the reviewed replay-token boundary remediation; focused unit/integration replay tests, typecheck, production build evidence, architecture lint, and import-graph checks are now available
  - if full Clerk-backed E2E release evidence is required, rerun the focused preflight and one Clerk-backed E2E entrypoint before retrying `pnpm e2e:full`; this is separate from the replay-boundary validation decision

## Handoff Notes

- what the next agent should rely on:
  - the safe method is integrated design first, staged implementation second
  - the concrete boundary fix is extraction, not duplication: `DEFAULT_APP_ENTRY_URL` now lives in `src/shared/lib/routing/default-app-entry.ts`
- what should not be re-decided without new evidence:
  - organization-scoped ownership of roles, memberships, policies, and invitations
  - `Teams` not being a first-class current domain model
  - `src/modules/**` must not depend on `src/app/**` for route defaults or other delivery helpers
- recommended next specialist or step:
  - proceed through normal release gates for the reviewed admin/RBAC/replay-boundary slice; keep the separate Clerk E2E tooling dependency issue tracked outside this replay-boundary release decision.

### Update Entry

- Date: 2026-07-21
- Trigger: User requested final validation of replay-token remediation, boundary leaks, modular-monolith architecture, production readiness, and release.
- Summary of change: Re-reviewed the implemented replay-token split and confirmed the prior architecture blocker is closed: token creation is in a client-safe security leaf, server replay validation and Redis/env dependencies remain server-only, `pnpm arch:lint` passes hard boundary checks, and import-graph scans show no production client import of `action-replay`.
- Sections refreshed:
  - Task Context
  - Actions Performed
  - Current-State Findings
  - Boundary And Dependency Assessment
  - Open Questions / Blockers
  - Handoff Notes
  - Update Log

### Update Entry

- Date: 2026-07-21
- Trigger: User requested an Architecture Guard production-ready plan for the Security & Auth replay-token boundary blocker.
- Summary of change: Planned the minimum safe boundary split: keep replay validation and Redis/local nonce persistence server-owned in `action-replay.ts`, move `createReplayToken()` to a client-safe security leaf module, mark the server module with `server-only`, and validate with focused replay tests, build/typecheck, architecture lint, and import-graph searches.
- Sections refreshed:
  - Task Context
  - Inputs Reviewed
  - Actions Performed
  - Current-State Findings
  - Boundary And Dependency Assessment
  - Architectural Decisions / Constraints
  - Artifact Synchronization
  - Open Questions / Blockers
  - Handoff Notes
  - Update Log

### Update Entry

- Date: 2026-07-20
- Trigger: User reported `pnpm e2e:full` failing with `ERR_MODULE_NOT_FOUND` for `@clerk/backend` after the last fix.
- Summary of change: Reviewed all files in the admin-roles task directory plus the current E2E auth tooling. The admin task's architecture fix did not introduce the dependency; the later Clerk E2E fixture validation/reconciliation change added direct `@clerk/backend` imports in `scripts/check-e2e-auth-env.mjs` and `e2e/clerk-auth.ts`. The package must now be declared directly because pnpm does not expose transitive packages for root imports.
- Sections refreshed:
  - Task Context
  - Inputs Reviewed
  - Actions Performed
  - Current-State Findings
  - Boundary And Dependency Assessment
  - Docs vs Code Drift
  - Open Questions / Blockers
  - Handoff Notes
  - Update Log

### Update Entry

- Date: 2026-07-12
- Trigger: User requested architecture fix for the remaining release-gate findings and a concrete implementation handoff
- Summary of change: Confirmed the remaining gate was a real `modules -> app` dependency leak, fixed it by extracting the shared post-auth landing constant to `src/shared/lib/routing/default-app-entry.ts`, and documented the implementation-agent closeout plan.
- Sections refreshed:
  - Task Context
  - Scope Handled
  - Inputs Reviewed
  - Actions Performed
  - Current-State Findings
  - Boundary And Dependency Assessment
  - Architectural Decisions / Constraints
  - Artifact Synchronization
  - Open Questions / Blockers
  - Handoff Notes
  - Update Log

### Update Entry

- Date: 2026-07-12
- Trigger: Executable architecture-gate rerun after the boundary fix
- Summary of change: Ran `pnpm arch:lint` and confirmed the former `src/modules/auth/ui/authjs/UserAvatarMenu.tsx -> src/app/auth/post-auth-redirect.ts` reverse dependency is gone; the architecture lint gate now passes.
- Sections refreshed:
  - Open Questions / Blockers
  - Handoff Notes
  - Update Log

### Update Entry

- Date: 2026-07-06
- Trigger: architecture review completed
- Summary of change: recorded architecture recommendation and drift findings
- Sections refreshed:
  - all
