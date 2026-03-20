# 07 - Playwright E2E - Summary

## Task Context

- Task ID: `2026-03-19-auth-regression-verification`
- Task Objective: run the controlled auth regression verification for the current branch using the repository auth-flow verification model and real-browser evidence where required
- Current Run Scope: Phase 0 readiness plus Phase 1 fresh-user execution, including a focused rerun of the corrected AF-02/AF-03/AF-04 fresh-user provisioning case
- Status: IN PROGRESS
- Last Updated: 2026-03-20
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`

## Scope Handled

- scenarios in scope: Phase 0 prerequisites plus Phase 1 `AF-01` / `AF-02` / `AF-03` / `AF-04`
- browser / project in scope: targeted Playwright `chromium` execution
- environment or runtime mode in scope: local env with `E2E_BACKEND_MODE=container`

## Inputs Reviewed

- scenario or matrix sources reviewed: `docs/feature-desings/02 - Auth Regression Tests.md`, `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`, `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`, `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`, `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`
- task artifacts reviewed: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`
- runtime / env notes reviewed: `package.json`, `playwright.config.ts`, `e2e/global.setup.ts`, `e2e/auth.spec.ts`, `e2e/provisioning-runtime.spec.ts`, `e2e/clerk-auth.ts`, `scripts/check-e2e-auth-env.mjs`, `scripts/e2e/load-env.mjs`, `scripts/e2e/run-scenario.mjs`, `scripts/e2e-clerk-fixtures.md`, local `.env.e2e.local` key presence only

## Actions Performed

- browser checks executed: readiness smoke plus targeted Phase 1 fresh-user scenarios on Playwright `chromium`, followed by a focused rerun of the corrected fresh-user provisioning case
- commands run: `node scripts/check-e2e-auth-env.mjs --scenario single`; non-secret env presence checks for the three required single-mode identities; readiness smoke on `e2e/auth.spec.ts`; `npx playwright install --with-deps`; rerun of the readiness smoke; `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/auth.spec.ts --project=chromium --grep "sign-up via /sign-up page force redirects through /auth/bootstrap/start"`; `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --reporter=line --grep "single mode: first login goes through bootstrap, preserves redirect_url, completes onboarding, then reaches the app"`; `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --reporter=line --grep "single mode: first login goes through bootstrap, reaches onboarding, completes onboarding, then lands on /users"`
- evidence captured: local env reports Clerk keys set; fresh, provisioned, and incomplete-user single-mode identities are all configured; readiness smoke passed; the AF-01 run timed out on Clerk verify-email instead of reaching `/auth/bootstrap/start`; the original AF-02/03/04 run reached onboarding and then landed on `/users` after submission, which is now confirmed as the intended contract for this workflow; the corrected fresh-user rerun passed end to end in 14.4s and reconfirmed the onboarding-to-users landing behavior
- retries or setup steps performed: retried the readiness smoke after one terminal session closed unexpectedly; installed Playwright dependencies to clear the host browser blocker before Phase 1 execution

## Preconditions

- environment readiness: ready for browser-real execution; Clerk auth env is present, the documented container-mode backend path is wired into the runner, and container DB lifecycle startup/reset/seed is validated
- account readiness: ready for Phase 0 identity assumptions; provisioned, new, and reusable incomplete-user credentials are all set locally
- runtime readiness: ready for targeted browser execution
- deviations from expected setup: Playwright web-server logs remain suppressed by config (`stdout: 'ignore'`, `stderr: 'ignore'`)

## Scenario Status Mapping

- scenario IDs executed: `AF-01`, `AF-02`, `AF-03`, `AF-04`
- PASS results: `AF-01`, `AF-02`, `AF-03`, `AF-04`
- FAIL results: none in Phase 1 after the AF-01 harness fix
- DEFERRED / BLOCKED results: `AF-05`, `AF-06`, `AF-07`, `AF-08`, `AF-09`, `AF-12`, `AF-13`, `AF-14`, `AF-15`, `AF-17`, `AF-18`, `AF-21` not run yet

## Observed Results

- final URLs: readiness smoke completed successfully; AF-01 now reaches the app-owned bootstrap path after hosted Clerk verification; the corrected fresh-user Phase 1 case navigated from `/auth/bootstrap/start?redirect_url=/app/dashboard` to `/onboarding?redirect_url=%2Fapp%2Fdashboard`, then after onboarding submission ended on `/users`
- key route or UI observations: Chromium launched successfully; AF-01 now completes Clerk verify-email and reaches bootstrap; the corrected AF-02/03/04 flow displayed onboarding first, then rendered the `/users` page with the `User Management` heading and authenticated user menu visible
- network / cookie observations: none captured in Phase 1 so far
- runtime log correlation: DB lifecycle logs were captured from the runner (`db:test:up`, `db-ops` reset/migrate/seed), but app-server logs are still not visible through current Playwright config

## Evidence Collected

- trace references: none
- report references: Playwright HTML report server started locally after the failed smoke run
- report references: Playwright reported the successful rerun and last HTML report remains available via `pnpm exec playwright show-report`
- report references: Playwright error contexts captured for the AF-01 and earlier AF-02/03/04 targeted runs under `test-results/`; the latest focused rerun finished with `test-results/.last-run.json` status `passed`
- screenshot references: none
- log references: env validator confirmed the configured `single` fixture set; non-secret env checks confirmed the incomplete-user contract is populated; runner logs confirmed `db:test:up`, target `127.0.0.1:5433/app_test`, successful reset/migrations/seed for each Phase 1 run; AF-01 passed after the hosted sign-up helper was updated to wait deterministically for Clerk verify-email or bootstrap and to accept bootstrap requests not marked as navigation; the focused corrected rerun completed with `Running 1 test using 1 worker` and `1 passed (14.4s)`; AF-02/03/04 landing on `/users` is now treated as expected contract behavior

## Artifact Synchronization

- `plan.md` updates: recorded that the focused rerun of the corrected fresh-user provisioning case completed and confirmed the route sequence ending on `/users`
- `implementation-plan.md` updates: added the focused rerun command and the verified route sequence for the corrected fresh-user case
- specialist artifact updates: refreshed this summary artifact with the focused rerun result and the current route evidence

## Gaps / Blockers

- scenarios not run: `AF-05`, `AF-06`, `AF-07`, `AF-08`, `AF-09`, `AF-12`, `AF-13`, `AF-14`, `AF-15`, `AF-17`, `AF-18`, `AF-21`
- blockers: no infrastructure blocker currently prevents browser execution for Phase 1
- evidence limitations: app-server logs remain suppressed, and Phase 1 still lacks explicit route-decision/network capture beyond Playwright assertions and error contexts

## Handoff Notes

- what the next agent should rely on: the universal runner now honors `E2E_BACKEND_MODE=container`, container DB lifecycle is validated against `5433/app_test`, and the single-mode incomplete-user identity contract is populated locally
- what remains unverified: the remaining matrix scenarios after Phase 1
- recommended next specialist or step: continue with the next planned auth-regression phase when ready

## Update Log

### Update Entry

- Date: 2026-03-20
- Trigger: Phase 0 readiness reassessment after runner alignment and incomplete-user flow implementation
- Summary of change: refreshed the artifact with current readiness evidence, including validated container DB lifecycle on `5433/app_test`, confirmed local identity setup, successful Chromium smoke execution after `npx playwright install --with-deps`, and the remaining note that Playwright web-server logs are still suppressed by config
- Sections refreshed: all

### Update Entry

- Date: 2026-03-20
- Trigger: Phase 1 fresh-user scenario execution
- Summary of change: executed `AF-01` through `AF-04` in targeted Chromium runs; observed a likely harness-side failure on the interactive `/sign-up` path before bootstrap, while the fresh-user bootstrap/onboarding flow reached onboarding and then settled on `/users`, which is now confirmed as the intended contract for this workflow
- Sections refreshed: task context, scope handled, actions performed, scenario status mapping, observed results, evidence collected, gaps/blockers, handoff notes

### Update Entry

- Date: 2026-03-20
- Trigger: Focused rerun of the corrected fresh-user Phase 1 provisioning case
- Summary of change: reran only `single mode: first login goes through bootstrap, reaches onboarding, completes onboarding, then lands on /users` in container mode on Chromium; the run passed in 14.4s and reconfirmed the route sequence from bootstrap start to onboarding to final `/users` landing
- Sections refreshed: task context, actions performed, observed results, evidence collected, artifact synchronization
