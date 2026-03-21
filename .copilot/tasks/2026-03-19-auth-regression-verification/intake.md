# Task Intake

## Objective

Run the controlled auth regression task described in `docs/feature-desings/02 - Auth Regression Tests.md`.

## Readiness Checklist

- [x] Objective is confirmed
- [x] Requirements sources are confirmed
- [x] Repository context is confirmed
- [x] Scope is confirmed
- [x] Non-goals are confirmed
- [x] Scenario sources are confirmed
- [x] Minimum scenario set for this run is confirmed
- [x] Acceptance criteria are confirmed
- [x] Environment assumptions are confirmed
- [x] Evidence expectations are confirmed
- [x] Open questions and blockers are recorded

## Requirements Sources

- `docs/feature-desings/02 - Auth Regression Tests.md`
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

## Repository Context

- `e2e/auth.spec.ts`
- `e2e/users.spec.ts`
- `e2e/provisioning-runtime.spec.ts`
- `e2e/security.spec.ts`
- `playwright.config.ts`
- `src/proxy.ts`

## Problem Statement

The task must verify onboarding, post-auth routing, cookie signal behavior, and runtime stability scenarios for the current branch against the repository auth-flow verification model without turning the work into ad hoc exploratory testing.

## Scope

- controlled auth regression verification
- runner alignment so the same scenario flow works for both `pglite` and `container` backends
- scenario mapping for the affected auth-flow cases
- task artifact creation under `.copilot/tasks/{task_id}/`
- detailed execution planning for scenario coverage and execution order
- real-browser Playwright verification where browser evidence is required
- final validation/report artifact summarizing pass, fail, deferred, and blocked scenarios
- local execution first, with a path that can later run in CI/CD without manual steps
- phase-by-phase execution starting from the first scenario group before advancing to the next
- universal runner design reusable beyond this single auth regression task
- automated local container lifecycle for browser-real runs
- configuration that can switch execution mode with one env variable: E2E_BACKEND_MODE=pglite|container

## Non-Goals

- unrelated feature implementation
- broad refactors
- speculative architecture redesign
- unnecessary full-suite validation outside the affected auth-flow scenarios
- creating separate task-specific runner scripts for container mode when an env-driven branch in the universal runner is sufficient

## Scenario Sources

- minimum regression set defined in `docs/feature-desings/02 - Auth Regression Tests.md`
- auth-flow matrix scenarios in `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`

## Scenario Minimum For This Run

- `AF-01 / AF-02 / AF-03 / AF-04`
- `AF-05`
- `AF-06 / AF-07`
- `AF-08 / AF-09`
- `AF-12 / AF-13 / AF-14 / AF-15`
- `AF-17 / AF-18 / AF-21`

## Acceptance Criteria

- affected scenarios are explicitly mapped, verified, or clearly marked as deferred or blocked with reasons
- minimum auth regression scenarios are covered for this run
- task artifacts are created and preserved in the task directory
- Playwright/browser evidence is recorded where required
- final validation state summarizes PASS / FAIL / DEFERRED / BLOCKED outcomes
- runner design is compatible with local automation and later CI/CD automation
- runner design does not require duplicating scenario-specific env naming already in use
- the current PGlite scenario flow continues to work
- the same scenario runner can select container-backed execution via `E2E_BACKEND_MODE=container`
- container mode reuses the repository test DB lifecycle and isolation model instead of inventing a parallel ad hoc path

## Environment Assumptions

- local execution is the primary target for the first run
- the eventual workflow must also be runnable in CI/CD
- target backend DB/container should be started automatically by the runner when the selected mode requires it
- when `E2E_BACKEND_MODE=container`, E2E must use the isolated test database profile: `5433/app_test`
- correct Clerk redirect env is configured
- prepared identities are available for fresh, onboarded, and incomplete-user flows
- the incomplete-user flow uses a reusable Clerk identity, while the onboarding-incomplete app state is recreated during the run after DB reset
- app runtime, DB, and auth dependencies are available for the run
- browser tools and server logs are available during execution
- the selected backend mode must drive setup behavior, database URL selection, and any required container lifecycle without changing scenario intent

## Evidence Expectations

- final URL per verified scenario or scenario group
- relevant runtime logs
- cookie and network evidence where relevant
- Playwright command used
- report, trace, screenshot, or log references when available
- scenario status mapping with PASS / FAIL / DEFERRED / BLOCKED

## Open Questions / Blockers

- which exact prepared identities should be used for the run
- which environment will be treated as the authoritative execution target
- whether current branch behavior requires pre-execution Security & Auth or Next.js Runtime review
- backend mode selection is fixed as E2E_BACKEND_MODE=pglite|container
- local `.env.e2e.local` currently selects `E2E_BACKEND_MODE=container`
- runner alignment completed on 2026-03-20: `scripts/e2e/run-scenario.mjs` now preserves the PGlite scenario path and uses the repository test DB lifecycle for `E2E_BACKEND_MODE=container`
- current local auth fixtures include Clerk keys plus `single` provisioned/new users, and the reusable incomplete identity now uses the canonical env contract `E2E_CLERK_INCOMPLETE_USER_USERNAME` / `E2E_CLERK_INCOMPLETE_USER_PASSWORD`
- AF-06 / AF-07 now recreate onboarding-incomplete app state directly in `e2e/provisioning-runtime.spec.ts` using the incomplete-user helper and a sign-in -> bootstrap -> stop-at-onboarding flow
- non-secret local env checks confirm the required fresh, onboarded, and incomplete-user identity vars are set
- container-mode smoke execution now confirms automated DB startup/reset/seed against `127.0.0.1:5433/app_test`
- after `npx playwright install --with-deps`, the same container-mode Chromium smoke execution now passes, confirming browser-host readiness for the real run
- remaining readiness note: current Playwright web-server config still suppresses stdout/stderr needed for visible server logs
- current execution blocker is no longer environment readiness; it is interpretation of Phase 1 failures, specifically AF-01 sign-up verification versus bootstrap handoff and the post-onboarding redirect contract mismatch (`/users` observed, `/app/dashboard` expected by spec)
- debug triage classification on 2026-03-20: AF-01 is likely harness-side Clerk verification instability; user decision confirmed `/users` as the authoritative post-onboarding landing, so the earlier `/app/dashboard` expectation is stale; a separate code drift exists because the onboarding browser form does not submit `redirect_url` even though the server action can honor it
- implementation direction confirmed with the user: keep the current separated scenario flow for PGlite, add the same separated scenario flow for container, and let the user choose the backend through `E2E_BACKEND_MODE`
- Phase 2 implementation and rerun findings on 2026-03-20: AF-05 is now modeled as a rerunnable returning-user scenario by creating completed single-user state inside the run before re-authentication; AF-06 and AF-07 now assert the repository API contract and route outcome directly; the final container-mode Chromium rerun passed AF-05 / AF-06 / AF-07
- Additional Phase 2 findings on 2026-03-21: AF-08 and AF-09 now have explicit targeted Playwright coverage and pass in container-mode Chromium; a later broad AF-05 through AF-09 batch produced an intermittent `429` on AF-05's deeper protected-API probe, but targeted AF-05 rerun still passed, so current verification remains anchored to the targeted scenario runs
