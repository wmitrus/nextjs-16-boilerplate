# 04 - Implementation Agent - Summary

## Scope handled

Implemented the first session-reuse refactor slice for AuthJS admin E2E tests, the follow-up steady-state Clerk `/users` suite, and the final stabilization pass for the Clerk helper and `/e2e-error` spec.

## Files changed

- `e2e/authjs-auth.ts`
- `e2e/admin.spec.ts`
- `e2e/admin-users.spec.ts`
- `e2e/clerk-auth.ts`
- `e2e/users.spec.ts`
- `e2e/error-boundary.spec.ts`
- `.copilot/tasks/2026-06-28-admin-authjs-e2e-worker-root-cause/implementation-plan.md`
- `.copilot/tasks/2026-06-28-admin-authjs-e2e-worker-root-cause/validation-report.md`

## Actions performed

- Added `captureAuthjsSessionStorageState(...)` helper to build a logged-in AuthJS storage state from a browser context.
- Replaced per-test AuthJS provisioning and sign-in in the admin suites with worker-scoped authenticated setup.
- Preserved fresh browser context per test.
- Kept `/api/admin/users` response mocking per test in `e2e/admin-users.spec.ts`.
- Serialized `e2e/admin.spec.ts` and `e2e/admin-users.spec.ts` per file so Playwright does not fan out authenticated setup across many workers for the same steady-state suite.
- Added a route-readiness probe before AuthJS E2E provisioning so the first real provisioning call does not hit a transient Next.js dev HTML `404` while `/api/internal/e2e/authjs-user` is still compiling.
- Added `captureClerkSessionStorageState(...)` helper for Clerk-based steady-state E2E suites.
- Replaced per-test Clerk sign-in in `e2e/users.spec.ts` with worker-scoped authenticated setup and per-test fresh contexts.
- Serialized `e2e/users.spec.ts` per file for the same reason as the AuthJS admin suites.
- Recorded the intermediate failed variant and final successful validation in task artifacts.
- Aligned the final Clerk helper with the repository's already-validated provisioning flow and waited for the onboarding UI to disappear before saving reusable state.
- Removed unnecessary Clerk sign-in from `e2e/error-boundary.spec.ts` because `/e2e-error` is intentionally reachable for E2E validation without auth.

## Findings

- Worker-scoped authenticated setup alone was not sufficient under `fullyParallel`; fixture setup still fanned out across too many workers at `--workers=16`.
- Combining session reuse with per-file serialization solved the remaining churn while preserving per-test isolation.
- For Clerk, merely capturing a low-level signed-in session was not enough; the saved state had to be captured after the completed-user route state fully settled on `/users`.
- The reliable completion signal for Clerk onboarding was the disappearance of the onboarding UI after submit, not transient URL checks alone.
- The remaining transient AuthJS false positive was caused by Next.js dev route compilation: the first provisioning request could receive an app-level HTML `404` before `/api/internal/e2e/authjs-user` finished compiling.
- `e2e/error-boundary.spec.ts` looked like a Clerk steady-state candidate at first, but code inspection showed the route is intentionally allowed without auth, so keeping Clerk bootstrap in that spec was coupling it to the wrong contract.

## Decisions

- Chose low-blast-radius per-file refactor instead of introducing global setup projects or repository-wide Playwright fixture changes.
- Did not change flow-based AuthJS tests, because they semantically need fresh login or fresh onboarding state.
- Applied the same low-blast-radius approach to the Clerk steady-state `/users` suite without touching Clerk entry-flow coverage.
- Kept the `/e2e-error` assertion focused on the route's own error-boundary behavior instead of preserving unnecessary auth setup for its own sake.
- Propagated a durable E2E session-reuse rule into the repository agent instructions so future Playwright agents classify scenarios before changing auth setup.

## Validation

- `AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=16`
  - Passed: `23/23`
- `AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/authjs-onboarding-entry.spec.ts --project=chromium --reporter=line --workers=16`
  - Passed: `1/1`
- `pnpm lint --fix e2e/authjs-auth.ts e2e/admin.spec.ts e2e/admin-users.spec.ts`
  - Passed
- `node scripts/e2e/run-scenario.mjs single -- e2e/users.spec.ts --project=chromium --reporter=line --workers=1 --grep "should emit a browser logger entry on load"`
  - Passed: `1/1`
- `node scripts/e2e/run-scenario.mjs single -- e2e/users.spec.ts --project=chromium --reporter=line --workers=16`
  - Passed: `5/5`
- `node scripts/e2e/run-scenario.mjs single -- e2e/error-boundary.spec.ts --project=chromium --reporter=line --workers=16`
  - Passed: `1/1`
- `pnpm lint --fix e2e/clerk-auth.ts e2e/users.spec.ts`
  - Passed
- `pnpm lint --fix e2e/clerk-auth.ts e2e/error-boundary.spec.ts`
  - Passed

## Blockers

- None for this phase.

## Handoff notes

- `e2e/users.spec.ts` is complete and back to green with worker-scoped reusable Clerk state.
- `e2e/error-boundary.spec.ts` is also complete, but the correct resolution was to keep it unauthenticated rather than migrate it to shared authenticated state.
- The broader flow-oriented suites should stay interactive and should not be migrated to shared storage state unless the test is explicitly steady-state.
