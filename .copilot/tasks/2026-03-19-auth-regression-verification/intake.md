# Task Intake

## Objective

Run the controlled auth regression task described in `docs/feature-desings/02 - Auth Regression Tests.md`.

## Readiness Checklist

- [ ] Objective is confirmed
- [ ] Requirements sources are confirmed
- [ ] Repository context is confirmed
- [ ] Scope is confirmed
- [ ] Non-goals are confirmed
- [ ] Scenario sources are confirmed
- [ ] Minimum scenario set for this run is confirmed
- [ ] Acceptance criteria are confirmed
- [ ] Environment assumptions are confirmed
- [ ] Evidence expectations are confirmed
- [ ] Open questions and blockers are recorded

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

## Environment Assumptions

- local execution is the primary target for the first run
- the eventual workflow must also be runnable in CI/CD
- target backend DB/container should be started automatically by the runner when the selected mode requires it
- when `E2E_BACKEND_MODE=container`, E2E must use the isolated test database profile: `5433/app_test`
- correct Clerk redirect env is configured
- prepared accounts are available for fresh, onboarded, and incomplete states
- app runtime, DB, and auth dependencies are available for the run
- browser tools and server logs are available during execution

## Evidence Expectations

- final URL per verified scenario or scenario group
- relevant runtime logs
- cookie and network evidence where relevant
- Playwright command used
- report, trace, screenshot, or log references when available
- scenario status mapping with PASS / FAIL / DEFERRED / BLOCKED

## Open Questions / Blockers

- which exact prepared accounts should be used for the run
- which environment will be treated as the authoritative execution target
- whether current branch behavior requires pre-execution Security & Auth or Next.js Runtime review
- backend mode selection is fixed as E2E_BACKEND_MODE=pglite|container
