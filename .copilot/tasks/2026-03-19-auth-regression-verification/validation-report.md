# Validation Report

## Objective

Record the final validation state for the current expanded auth regression run on this branch.

## Scope

- backend mode: `container`
- browser/project: `chromium`
- package entrypoint: `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`
- minimum scenarios covered: `AF-01` / `AF-02` / `AF-03` / `AF-04` / `AF-05` / `AF-06` / `AF-07` / `AF-08` / `AF-09` / `AF-12` / `AF-13` / `AF-14` / `AF-15` / `AF-17` / `AF-18` / `AF-21` / `AF-22` / `AF-23` / `AF-24` / `AF-25` / `AF-26` / `AF-27` / `AF-28`

## Commands Run

- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase4 -- --list`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase4`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase5 -- --list`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase5`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase6 -- --list`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase6`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase7 -- --list`
- `E2E_BACKEND_MODE=container pnpm e2e:auth-matrix:phase7`
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
- `AF-25`: PASS
- `AF-26`: PASS
- `AF-27`: PASS
- `AF-28`: PASS

## Phase Summary

- Phase 1: `2 passed (9.2s)`
- Phase 2 returning-state: `3 passed (23.4s)`
- Phase 2 direct-entry: `2 passed (13.5s)`
- Phase 3: `5 passed (25.5s)`
- Phase 4: `3 passed (22.4s)`
- Phase 5: `3 passed (24.8s)`
- Phase 6: `3 passed (18.3s)`
- Phase 7: `1 passed (10.3s)`

## Observability Evidence

- `AF-28`: logged-mode Phase 7 captured `bootstrap_start:entry` with `redirectUrl=/users?af28=1`, `bootstrap_start:decision` with `outcome=onboarding_required`, `onboarding_guard:decision` with `decision=render:onboarding`, `provisioning:ensure` with `status=success`, and `users_guard:decision` with `decision=stay:/users` in `logs/auth-matrix-phase7/server.log`
- `AF-28`: browser evidence recorded onboarding subtree mount, committed transition from onboarding to `/users`, `__onboarding_pending=1` before submit, and cookie absence after completion
- `AF-28`: no unexpected page errors, console-error matches, or non-aborted same-origin network failures were observed in the targeted observability run

## Runtime-Stability Evidence

- `AF-17`: public home route settled on `/` with the expected title and no matched `blocking-route`, `Rendering...`, or Suspense-shape runtime signals
- `AF-18`: completed-user authenticated route settled on `/users` with `User Management` visible and no matched root-layout or Clerk-branch runtime failures
- `AF-21`: returning completed-user bootstrap path settled on `/users` without any observed `/onboarding` transition in the main-frame route history

## Re-Auth And Refresh Evidence

- `AF-22`: completed user signed out, signed in again, and settled on `/users` without any observed return to `/onboarding`
- `AF-23`: completed user reloaded `/users` and remained on `/users` with `User Management` visible
- `AF-24`: incomplete user reloaded `/onboarding` and remained on `/onboarding` with the onboarding UI visible and `__onboarding_pending=1` still present

## Redirect And Route-Access Evidence

- `AF-25`: hostile `redirect_url=https://evil.example/steal` was sanitized by `/auth/bootstrap/start` and redirected to `/users` instead of leaving the app origin
- `AF-26`: signed-out `/users` access settled on `/sign-in?redirect_url=/users` and did not render `User Management`
- `AF-27`: signed-in access to `/sign-in` and `/sign-up` triggered bootstrap requests and settled back on `/users`

## Notes

- the first Phase 4 attempt exposed a test-harness issue, not a product regression: `networkidle` was too strict for the signed-in app because background traffic can remain active
- the Phase 4 helper was corrected to use document readiness plus a short stabilization delay, after which the targeted run passed cleanly
- app-server stdout/stderr remains suppressed by the current Playwright web-server configuration, but AF-28 used the existing file logger with `LOG_TO_FILE_DEV=true` and `LOG_DIR=logs/auth-matrix-phase7` to capture the required server-side route and provisioning events
- the Phase 5 slice reused the same runtime-signal recorder and completed without further harness changes
- the first AF-27 attempt exposed a test-evidence issue, not a product failure; request-level bootstrap evidence was more reliable than framenavigation capture for that route pair
- AF-28 still relies on browser-observed cookie state for set and clear classification because the app does not yet emit a dedicated cookie-specific server log event
