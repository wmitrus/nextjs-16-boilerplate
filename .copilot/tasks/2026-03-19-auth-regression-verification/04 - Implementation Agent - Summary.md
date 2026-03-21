# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `2026-03-19-auth-regression-verification`
- Task Objective: run the controlled auth regression verification for the current branch after aligning the universal runner with `E2E_BACKEND_MODE=pglite|container`
- Current Run Scope: Phase 0a runner alignment, AF-06 / AF-07 rerunnable incomplete-user flow implementation, AF-01 hosted Clerk verification harness fix, Phase 2 contract alignment plus explicit AF-08 / AF-09 coverage, and package-level auth-matrix phase scripts backed by Playwright title tags
- Status: COMPLETED
- Last Updated: 2026-03-20
- Related Control Artifacts: `plan.md`, `intake.md`, `constraints.md`, `implementation-plan.md`, `07 - Playwright E2E - Summary.md`

## Scope Handled

- modules / files changed: `scripts/e2e/load-env.mjs`, `scripts/e2e/run-scenario.mjs`, `e2e/clerk-auth.ts`, `e2e/provisioning-runtime.spec.ts`, `e2e/auth.spec.ts`, supporting docs, task control artifacts, and this summary artifact
- implementation goals in scope: preserve the existing PGlite scenario flow, add container-backed setup using the repository test DB lifecycle, keep the same scenario entrypoint and Playwright args, switch only by `E2E_BACKEND_MODE`, implement rerunnable AF-06 / AF-07 flows using the incomplete-user helper, make AF-01 hosted Clerk sign-up verification deterministic, align Phase 2 returning-user tests with repository routing and API contracts, add explicit post-onboarding direct-entry coverage for AF-08 / AF-09, and provide maintainable package-level auth-matrix entrypoints without brittle full test-name grep
- constraints applied: keep one universal runner, reuse existing DB lifecycle commands, do not fork scenario naming or Playwright command shape, and keep container mode on the isolated test DB profile only

## Inputs Reviewed

- code paths reviewed: `scripts/e2e/run-scenario.mjs`, `scripts/e2e/load-env.mjs`, `scripts/compose-db-local.mjs`, `scripts/db-ops.mjs`, `scripts/lib/db-guard.mjs`, `package.json`, `scripts/e2e/env/base.env`, `e2e/clerk-auth.ts`, `e2e/provisioning-runtime.spec.ts`, `e2e/auth.spec.ts`, the provisioning-status route integration tests, and Clerk testing helper typings/runtime under `node_modules/@clerk/testing`
- upstream specialist artifacts reviewed: `07 - Playwright E2E - Summary.md`
- earlier implementation notes reviewed: `implementation-plan.md`, `constraints.md`

## Actions Performed

- code changes made: added backend-mode validation in `load-env.mjs`; updated `run-scenario.mjs` to branch setup by `E2E_BACKEND_MODE`, preserve the existing PGlite file-backed flow, and use `db:test:up` plus `node scripts/db-ops.mjs test reset --force` for container mode while keeping Playwright invocation unchanged; added optional incomplete-user helper support in `e2e/clerk-auth.ts`; implemented rerunnable AF-06 / AF-07 single-mode flows in `e2e/provisioning-runtime.spec.ts`; updated `e2e/auth.spec.ts` so hosted sign-up waits deterministically for either Clerk verify-email or bootstrap and no longer assumes the bootstrap request must be flagged as a navigation request; then updated `e2e/provisioning-runtime.spec.ts` again so AF-05 creates completed single-user state inside the run, AF-06 / AF-07 assert the API-layer onboarding-required code and visible onboarding UI, the local bootstrap-request helper no longer depends on `request.isNavigationRequest()`, the incomplete-user route assertions target `/onboarding` rather than requiring preserved `redirect_url`, AF-08 / AF-09 are explicitly covered, and the completed-user setup helper is idempotent across serial tests without embedding extra readiness probes; then added Playwright title tags `@auth-matrix-phase1` and `@auth-matrix-phase2` plus `package.json` scripts `e2e:auth-matrix`, `e2e:auth-matrix:phase1`, `e2e:auth-matrix:phase2`, and `e2e:auth-matrix:ci`
- tests or supporting files updated: none
- focused validation executed: syntax checks, backend-mode helper validation, env validation, `--list` runner validation for both backend modes, Playwright spec listing after the AF-06 / AF-07 additions, targeted Chromium reruns for AF-01 and AF-05 / AF-06 / AF-07, package-level validation for `e2e:auth-matrix:phase1` and `e2e:auth-matrix:phase2`, and cleanup of the temporary test DB container when explicitly requested

## Files Changed

- production files: `scripts/e2e/load-env.mjs`, `scripts/e2e/run-scenario.mjs`, `e2e/clerk-auth.ts`, `e2e/provisioning-runtime.spec.ts`, `e2e/auth.spec.ts`
- test files: none
- docs / artifact files: `.env.example`, `scripts/e2e-clerk-fixtures.md`, `plan.md`, `intake.md`, `implementation-plan.md`, `04 - Implementation Agent - Summary.md`

## Behavior Change Summary

- previous behavior: the universal scenario runner always executed the PGlite reset/migrate/seed path regardless of `E2E_BACKEND_MODE`
- new behavior: the universal scenario runner now preserves the PGlite branch for `pglite` and uses the repository test DB lifecycle for `container`, while keeping scenario selection and Playwright args shared; the provisioning runtime spec now includes rerunnable single-mode incomplete-user flows that create onboarding-incomplete app state inside the test run, plus a rerunnable completed-user flow for AF-05; the incomplete-user assertions now match the API contract actually returned by `/api/me/provisioning-status`; the auth E2E harness now handles hosted Clerk verification deterministically for `+clerk_test` sign-up emails and detects bootstrap requests reliably
- intentional non-changes: no separate container-specific scenario scripts were added and no persistent incomplete DB fixture was introduced

## Implementation Decisions / Constraints

- implementation choices made: validate backend mode centrally, force container mode to the repository test DB profile, and reuse `db:test:up` plus `db-ops.mjs test reset --force` rather than reimplementing container DB orchestration
- constraints preserved: same scenario entrypoint, same forwarded Playwright args, existing PGlite scenario DB layout, existing auth env validator, and isolated container test DB only
- tradeoffs accepted: container cleanup is still an explicit follow-up action by the caller or validation step rather than automatic runner teardown during every run; validation here performed explicit `db:test:down` cleanup after the focused container check

## Validation Performed

- commands run: `node --check scripts/e2e/load-env.mjs`; `node --check scripts/e2e/run-scenario.mjs`; `node --check scripts/check-e2e-auth-env.mjs`; `node scripts/check-e2e-auth-env.mjs --scenario single`; `E2E_BACKEND_MODE=pglite node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --list`; `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --list`; `E2E_BACKEND_MODE=pglite node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --list`; `pnpm db:test:down`; `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/auth.spec.ts --project=chromium --reporter=line --grep 'sign-up via /sign-up page force redirects through /auth/bootstrap/start'`
- results: backend-mode validation still passes, the updated provisioning runtime spec now supports rerunnable AF-05 / AF-06 / AF-07 coverage without depending on stale fixture assumptions, the targeted AF-01 hosted sign-up path passes in Chromium after the harness fix, the final targeted Phase 2 rerun passes AF-05 / AF-06 / AF-07 in Chromium with `3 passed (22.9s)`, AF-08 / AF-09 pass in a focused Chromium rerun with `2 passed (13.6s)`, targeted AF-05 rerun still passes after the broad-batch `429` noise with `1 passed (12.5s)`, and the new tag-based package scripts execute the expected phase slices successfully: the phase-1 script ran 2 tagged tests and passed, and the phase-2 script ran 5 tagged tests and passed
- follow-up readiness evidence: non-secret env checks confirmed fresh, provisioned, and incomplete-user identities are populated; a targeted container-mode browser smoke run validated `db:test:up` plus reset/migrate/seed against `127.0.0.1:5433/app_test`, then failed at Playwright Chromium launch because the Linux host is missing `libnspr4.so`
- follow-up readiness resolution: after the user ran `npx playwright install --with-deps`, rerunning the same targeted container-mode smoke check succeeded end to end, confirming the browser-host dependency issue is cleared for Playwright Chromium on this machine
- validation not run: AF-08 / AF-09 and later matrix scenarios remain outside this implementation step
- residual risk from validation gaps: runtime correctness for the rest of the auth regression matrix still depends on executing the remaining planned browser scenarios, even though the currently exercised Phase 2 slice is now green

## Artifact Synchronization

- `plan.md` updates: marked runner direction and implementation complete and updated the current status note to show the remaining blocker is fixture readiness
- `intake.md` updates: replaced the runner readiness blocker with a completion note and left the incomplete-user fixture blocker open
- `implementation-plan.md` updates: marked Phase 0a complete and recorded implementation results plus focused validation evidence
- specialist artifact updates: created this summary artifact for the implementation step

## Open Questions / Blockers

- unresolved questions: none at the helper/test-flow level for AF-06 / AF-07
- blockers: Phase 0 is no longer blocked on runner support, incomplete-user test-flow design, or Chromium host dependencies; only optional server-log visibility remains as a workflow/observability concern
- follow-up needed: hand back to Playwright E2E for scenario execution

## Handoff Notes

- what the next agent should rely on: `scripts/e2e/run-scenario.mjs` now supports both `pglite` and `container` through `E2E_BACKEND_MODE` while preserving the existing scenario command shape
- residual risks for review: if later runs require automatic container teardown semantics, that should be handled as a separate workflow decision rather than folded into this Phase 0a patch without evidence
- recommended next specialist or step: return to Phase 0 readiness and resolve the incomplete-user fixture blocker, then continue with `07 - Playwright E2E`

## Update Log

### Update Entry

- Date: 2026-03-20
- Trigger: Phase 0a follow-up plus AF-06 / AF-07 implementation
- Summary of change: aligned the universal E2E runner with `E2E_BACKEND_MODE=pglite|container`, wired the incomplete-user identity into the helper layer, implemented rerunnable AF-06 / AF-07 test flows, then recorded Phase 0 follow-up evidence showing container DB readiness is validated and the prior Chromium host dependency blocker is now cleared after `npx playwright install --with-deps`
- Sections refreshed: all

### Update Entry

- Date: 2026-03-20
- Trigger: AF-01 hosted Clerk verification implementation
- Summary of change: updated the auth E2E harness so hosted Clerk sign-up waits for either verify-email or bootstrap, uses the documented test OTP path deterministically, accepts bootstrap requests not marked as navigation, and validated the fix with a focused Chromium rerun that passed
- Sections refreshed: task context, scope handled, inputs reviewed, actions performed, files changed, behavior change summary, validation performed

### Update Entry

- Date: 2026-03-21
- Trigger: Phase 2 contract alignment and rerunnable-state implementation follow-up
- Summary of change: updated the provisioning runtime spec so AF-05 creates completed single-user state inside the run, AF-06 / AF-07 assert the repository API contract and final onboarding route directly, AF-08 / AF-09 are explicitly covered, the completed-user helper is idempotent across serial tests, and validation now includes focused container-mode Chromium reruns where AF-05 through AF-09 pass on targeted evidence despite one noisy broad-batch `429` on AF-05's deeper protected-API probe
- Sections refreshed: task context, scope handled, inputs reviewed, actions performed, behavior change summary, validation performed, update log

### Update Entry

- Date: 2026-03-21
- Trigger: Package-level auth-matrix script implementation
- Summary of change: added Playwright title tags for Phase 1 and Phase 2 auth-matrix coverage, wired `package.json` scripts to grep those tags through the universal runner, and validated the scripts with package-level invocations that executed the tagged slices successfully
- Sections refreshed: task context, scope handled, actions performed, validation performed, update log
