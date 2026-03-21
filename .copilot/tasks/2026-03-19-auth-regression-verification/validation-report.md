# Validation Report

## Objective

Record the final validation state for the current minimum auth regression run on this branch.

## Scope

- backend mode: `container`
- browser/project: `chromium`
- package entrypoint: `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`
- minimum scenarios covered: `AF-01` / `AF-02` / `AF-03` / `AF-04` / `AF-05` / `AF-06` / `AF-07` / `AF-08` / `AF-09` / `AF-12` / `AF-13` / `AF-14` / `AF-15` / `AF-17` / `AF-18` / `AF-21` / `AF-22` / `AF-23` / `AF-24`

## Commands Run

- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase4 -- --list`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase4`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase5 -- --list`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase5`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`

## Final Results

- `AF-01`: PASS
- `AF-02`: PASS
- `AF-03`: PASS
- `AF-04`: PASS
- `AF-05`: PASS
- `AF-06`: PASS
- `AF-07`: PASS
- `AF-08`: PASS
- `AF-09`: PASS
- `AF-12`: PASS
- `AF-13`: PASS
- `AF-14`: PASS
- `AF-15`: PASS
- `AF-17`: PASS
- `AF-18`: PASS
- `AF-21`: PASS
- `AF-22`: PASS
- `AF-23`: PASS
- `AF-24`: PASS

## Phase Summary

- Phase 1: `2 passed (9.7s)`
- Phase 2 returning-state: `3 passed (23.8s)`
- Phase 2 direct-entry: `2 passed (13.2s)`
- Phase 3: `5 passed (24.3s)`
- Phase 4: `3 passed (21.9s)`
- Phase 5: `3 passed (24.6s)`

## Runtime-Stability Evidence

- `AF-17`: public home route settled on `/` with the expected title and no matched `blocking-route`, `Rendering...`, or Suspense-shape runtime signals
- `AF-18`: completed-user authenticated route settled on `/users` with `User Management` visible and no matched root-layout or Clerk-branch runtime failures
- `AF-21`: returning completed-user bootstrap path settled on `/users` without any observed `/onboarding` transition in the main-frame route history

## Re-Auth And Refresh Evidence

- `AF-22`: completed user signed out, signed in again, and settled on `/users` without any observed return to `/onboarding`
- `AF-23`: completed user reloaded `/users` and remained on `/users` with `User Management` visible
- `AF-24`: incomplete user reloaded `/onboarding` and remained on `/onboarding` with the onboarding UI visible and `__onboarding_pending=1` still present

## Notes

- the first Phase 4 attempt exposed a test-harness issue, not a product regression: `networkidle` was too strict for the signed-in app because background traffic can remain active
- the Phase 4 helper was corrected to use document readiness plus a short stabilization delay, after which the targeted run passed cleanly
- app-server stdout/stderr remains suppressed by the current Playwright web-server configuration, so runtime evidence is based on browser route settlement and targeted runtime-signal capture
- the Phase 5 slice reused the same runtime-signal recorder and completed without further harness changes
