# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-07-06-admin-roles-rbac-teams-design`
- Task Objective: Decide whether AuthJS admin GUI work for `Roles`, `RBAC & Policies`, and `Teams` should be designed together or independently.
- Current Run Scope: Follow-up Architecture Guard review after `pnpm e2e:full` failed during E2E auth preflight with `ERR_MODULE_NOT_FOUND` for `@clerk/backend`.
- Status: COMPLETED
- Last Updated: 2026-07-20
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

## Actions Performed

- repository inspection performed:
  - checked admin navigation surface versus current schema and contracts
  - traced the remaining architecture-lint failure to a module UI import from `src/app/auth/post-auth-redirect.ts`
  - traced the E2E failure to direct `@clerk/backend` imports in E2E tooling without a matching root dependency declaration
- boundary checks performed:
  - verified that roles, memberships, policies, and invitations are all organization-owned in live code
  - verified the only live `src/modules/** -> src/app/**` import was the AuthJS avatar menu importing `DEFAULT_APP_ENTRY_URL`
- dependency / DI review performed:
  - confirmed admin UI should stay thin over authorization/provisioning services
- docs-vs-code checks performed:
  - identified tenant-scoped wording drift in docs and admin card copy versus organization-scoped live schema
  - confirmed the post-auth landing path constant was owned too high in the app layer for its actual reuse surface
  - confirmed the admin RBAC task artifacts do not document or require the new Clerk Backend direct import; the new requirement is from the later Clerk E2E fixture hardening work

## Current-State Findings

- Confirmed:
  - `Roles` and `RBAC & Policies` are two admin views over one authorization subsystem.
  - current authority is organization-scoped, not an independent `Teams` domain.
  - admin cards are navigation placeholders, not proof of separate bounded contexts.
  - the remaining architecture-lint release gate was a real boundary break: `src/modules/auth/ui/authjs/UserAvatarMenu.tsx` imported `@/app/auth/post-auth-redirect` only to read `DEFAULT_APP_ENTRY_URL`.
  - the minimum safe fix is to move `DEFAULT_APP_ENTRY_URL` to a lower shared routing abstraction and let the app helper depend on that lower abstraction, not the reverse.
  - `scripts/check-e2e-auth-env.mjs` now imports `createClerkClient` from `@clerk/backend` to validate configured Clerk fixture accounts before Playwright starts.
  - `e2e/clerk-auth.ts` now imports `createClerkClient` from `@clerk/backend` to create or repair mutable standalone Clerk E2E fixture users before sign-in.
  - `package.json` currently declares `@clerk/nextjs` and `@clerk/testing`, but does not declare `@clerk/backend` as a direct dependency.
  - `pnpm-lock.yaml` contains `@clerk/backend` as an overridden/transitive package, but pnpm has not linked `node_modules/@clerk/backend` at the root importer, so Node ESM resolution fails before the preflight can run.
- Risks:
  - page-by-page GUI design would force the app layer to invent missing semantics for role lifecycle, policy assignment, and organization scope.
  - a `Teams` page could hard-code the wrong structural concept before a real team model exists.
  - leaving the constant in `src/app` would keep an incentive for future module or feature code to reach upward into delivery code for routing defaults.
  - direct provider SDK use in E2E tooling is acceptable for test harness setup, but it must be declared explicitly as a root dependency because the root package imports it directly.
  - without that dependency declaration, every Clerk-backed scenario runner path fails before any browser or admin authorization behavior is exercised.
- Drift:
  - current card wording suggests custom roles per tenant and tenant-wide policy management, which does not match live organization-scoped code.
  - before this run, the default post-auth landing path was structurally treated as app-delivery state even though it is a reusable routing constant.
  - the validation report for this admin task records the default E2E base URL and AuthJS admin validations, but it does not mention the later Clerk fixture reconciliation dependency on `@clerk/backend`.

## Boundary And Dependency Assessment

- module ownership assessment:
  - authorization domain owns roles, policies, and policy evaluation; provisioning and invitation flows own related write-side invariants.
  - the default post-auth landing path constant belongs below `src/app`, because both delivery code and module UI can legitimately consume it without inheriting app-route helper semantics.
- dependency direction assessment:
  - admin GUI should depend on existing authorization/provisioning contracts, not redefine them.
  - `src/modules/**` must not import from `src/app/**`; the avatar menu import was an explicit reverse dependency and is now removed.
  - E2E tooling can depend on provider SDKs, but direct imports must be represented in package metadata; relying on transitive `@clerk/backend` from `@clerk/nextjs`/`@clerk/testing` is not a safe dependency contract under pnpm.
- DI / composition assessment:
  - current composition keeps authority in server-side services; that should remain intact.
- cross-module coupling assessment:
  - roles, memberships, policies, and invitations are tightly coupled through organization ownership and should be designed together.
  - the fixed leak was not a DI problem; it was a constant-ownership problem best solved by extraction, not by duplicating route strings in the module.

## Architectural Decisions / Constraints

- approved architectural constraints:
  - use one integrated design pass with staged implementation.
  - keep management surfaces organization-scoped.
  - treat `Teams` as unresolved terminology or future modeling work until explicitly designed.
  - keep reusable route defaults and low-level routing constants in shared lower-layer utilities when they are consumed outside the app delivery layer.
- rejected directions:
  - three loosely coordinated page-by-page designs.
  - a standalone `Teams` implementation before its domain exists.
  - keeping `DEFAULT_APP_ENTRY_URL` in `src/app/auth/post-auth-redirect.ts` while module UI imports it from above.
  - duplicating `'/dashboard'` inside module UI just to appease the lint rule.
- follow-up architectural guardrails:
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
  - added a focused implementation-agent closeout plan for the architecture-lint gate
- specialist artifact updates:
  - this summary refreshed with the boundary-fix decision and handoff notes

## Open Questions / Blockers

- unresolved questions:
  - whether the product intends `Teams` to mean organizations in current UI or a future nested/team abstraction
- blockers:
  - no architecture blocker remains in the reviewed `modules -> app` leak itself
  - E2E execution is currently blocked before Playwright by a package declaration/linking issue: `@clerk/backend` is imported directly but is not declared as a direct dependency.
- evidence still needed:
  - after declaring/installing `@clerk/backend`, rerun the focused preflight and one Clerk-backed E2E entrypoint before retrying `pnpm e2e:full`

## Handoff Notes

- what the next agent should rely on:
  - the safe method is integrated design first, staged implementation second
  - the concrete boundary fix is extraction, not duplication: `DEFAULT_APP_ENTRY_URL` now lives in `src/shared/lib/routing/default-app-entry.ts`
- what should not be re-decided without new evidence:
  - organization-scoped ownership of roles, memberships, policies, and invitations
  - `Teams` not being a first-class current domain model
  - `src/modules/**` must not depend on `src/app/**` for route defaults or other delivery helpers
- recommended next specialist or step:
  - implementation agent should add `@clerk/backend` as an explicit root dependency, refresh the lockfile/install links, and rerun the focused E2E auth preflight before broad suite execution

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

## Update Log

### Update Entry

- Date: 2026-07-06
- Trigger: architecture review completed
- Summary of change: recorded architecture recommendation and drift findings
- Sections refreshed:
  - all
