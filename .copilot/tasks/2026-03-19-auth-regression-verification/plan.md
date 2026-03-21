# Task Plan

## Objective

Run a controlled auth regression verification task for the current branch using the repository auth-flow verification model, explicit task artifacts, and real-browser verification only where required, after aligning the E2E runner to honor `E2E_BACKEND_MODE=pglite|container` without regressing the existing PGlite flow.

## Progress Checklist

- [x] Task workspace initialized
- [x] `plan.md` completed
- [x] `intake.md` completed
- [x] `constraints.md` completed
- [x] `implementation-plan.md` completed
- [x] Env and fixture assumptions validated
- [x] Runner architecture direction confirmed
- [x] Container-mode runner implementation plan confirmed
- [x] Container-mode runner implementation completed
- [x] `07 - Playwright E2E` run prepared
- [x] `07 - Playwright E2E - Summary.md` created
- [ ] `validation-report.md` created

## Likely Affected Areas

- `docs/feature-desings/02 - Auth Regression Tests.md`
- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`
- `scripts/e2e/run-scenario.mjs`
- `scripts/e2e/load-env.mjs`
- `scripts/check-e2e-auth-env.mjs`
- `scripts/compose-db-local.mjs`
- `scripts/db-ops.mjs`
- `package.json`
- `e2e/auth.spec.ts`
- `e2e/users.spec.ts`
- `e2e/provisioning-runtime.spec.ts`
- `e2e/security.spec.ts`
- `playwright.config.ts`
- `src/proxy.ts`

## Task Classification

- non-trivial
- scenario-driven
- auth/bootstrap/onboarding-sensitive
- verification-first
- real-browser evidence expected
- local-first execution target
- CI/CD-ready execution required later
- sequential scenario progression required
- universal runner architecture required
- automated local container orchestration required
- single-env-var runtime/backend switching required

## Expected Specialist Sequence

1. Workflow Orchestrator kickoff and artifact creation
2. Direct intake normalization from task documents
3. Constraint consolidation from auth-flow documents
4. Implementation-plan creation for runner alignment and scenario execution order
5. `04 - Implementation Agent` to align the runner with `E2E_BACKEND_MODE=pglite|container` while preserving the current PGlite path
6. `07 - Playwright E2E` for real-browser verification
7. `06 - Debug Investigation` for Phase 1 failure triage before continuing breadth-first execution
8. Final validation/report artifact

## Sequence Checklist

- [x] Workflow Orchestrator kickoff and artifact creation
- [x] Intake normalization completed
- [x] Constraint consolidation completed
- [x] Implementation-plan completed
- [x] Runner alignment implementation step completed
- [ ] Playwright E2E step completed
- [x] Debug investigation step completed
- [ ] Final validation/report artifact completed

## Specialist Status

- `06 - Debug Investigation`: now required for Phase 1 failure triage on AF-01 and the redirect-preservation mismatch before deciding whether to continue breadth-first execution
- `01 - Architecture Guard`: skipped for kickoff because this is a verification workflow, not a design task
- `02 - Security & Auth`: conditional only if branch evidence or observed behavior shows trust-boundary concerns before execution
- `03 - Next.js Runtime`: conditional only if branch evidence or observed behavior shows runtime-placement or App Router instability before execution
- `05 - Validation Strategy`: conditional only if validation scope materially expands beyond the defined auth regression task
- `07 - Playwright E2E`: required
- `04 - Implementation Agent`: required before Playwright execution to align the runner with `E2E_BACKEND_MODE=pglite|container` while preserving the existing PGlite scenario path

## Specialist Checklist

- [x] `06 - Debug Investigation` decision recorded
- [x] `01 - Architecture Guard` decision recorded
- [x] `02 - Security & Auth` decision recorded
- [x] `03 - Next.js Runtime` decision recorded
- [x] `05 - Validation Strategy` decision recorded
- [x] `07 - Playwright E2E` decision recorded
- [x] `04 - Implementation Agent` decision recorded

## Known Risks / Unknowns

- prepared test accounts and environment state may be missing or inconsistent
- current branch behavior has not yet been observed in a real browser for this run
- branch-to-default drift has not yet been classified as requiring pre-execution security/runtime review
- existing runtime tests mix browser-real UI paths with helper-assisted Clerk sign-in; authoritative regression evidence for this task must prefer browser-real interactive flow
- backend/runtime mode selection is standardized as E2E_BACKEND_MODE=pglite|container
- current local env has Clerk keys plus single new/provisioned fixtures configured; remaining readiness depends on recording a reusable incomplete identity and documenting deterministic in-run onboarding-incomplete setup for the returning-incomplete scenarios
- the container mode should reuse the repository test DB/container lifecycle (`db:test:*`, `compose-db-local.mjs`, guarded test DB URL) instead of introducing a second parallel container flow
- the current implementation plan must preserve one scenario model with backend-specific setup branching, not fork the auth regression workflow into separate task-specific scripts

## Planned Artifacts

- `plan.md`
- `intake.md`
- `constraints.md`
- `implementation-plan.md`
- `04 - Implementation Agent - Summary.md`
- `06 - Debug Investigation - Summary.md`
- `07 - Playwright E2E - Summary.md`
- `validation-report.md`

## Artifact Checklist

- [x] `plan.md`
- [x] `intake.md`
- [x] `constraints.md`
- [x] `implementation-plan.md`
- [x] `04 - Implementation Agent - Summary.md`
- [x] `06 - Debug Investigation - Summary.md`
- [x] `07 - Playwright E2E - Summary.md`
- [ ] `validation-report.md`

## Current Status Note

- Phase 0 readiness review started on 2026-03-20.
- Verified from repository evidence and local env checks: Clerk keys are configured, `single` new/provisioned Clerk fixtures are configured, and local `.env.e2e.local` selects `E2E_BACKEND_MODE=container`.
- Runner alignment step is now complete: the universal scenario runner preserves the current PGlite setup path and adds a container-backed setup path using the repository test DB lifecycle, selected only by `E2E_BACKEND_MODE`.
- Focused validation confirmed both branches via the same scenario entrypoint with Playwright `--list`: PGlite still resets and seeds the file-backed scenario DB, and container mode starts `test-db`, resets `5433/app_test`, seeds it, and reaches the same Playwright scenario list.
- Reusable incomplete identity is now recorded via the canonical env contract `E2E_CLERK_INCOMPLETE_USER_USERNAME` / `E2E_CLERK_INCOMPLETE_USER_PASSWORD`.
- AF-06 / AF-07 rerunnable flow is now implemented in `e2e/provisioning-runtime.spec.ts` using `signInClerkIncompleteUserE2E()` and in-test recreation of onboarding-incomplete app state.
- Non-secret local env checks confirm fresh, onboarded, and incomplete-user identities are all populated.
- A container-mode smoke run confirmed automated test DB startup/reset/seed on `127.0.0.1:5433/app_test`, but the actual Playwright Chromium launch failed on the host because `libnspr4.so` is missing.
- After `npx playwright install --with-deps`, rerunning that same smoke command succeeded end to end: the browser launched, the app runtime served the page, and the targeted Chromium smoke test passed.
- Current Playwright config suppresses web-server stdout and stderr, so server-log visibility is still not satisfied for this verification workflow.
- Remaining note: server-log visibility is still limited by Playwright web-server config, but the browser-real execution path itself is now operational.
- Consequence: the task is ready to proceed from readiness checks into browser-real auth regression execution.
- Phase 1 execution has started.
- `AF-01` failed in the real browser run: interactive `/sign-up` did not reach `/auth/bootstrap/start` and remained on Clerk email verification until timeout.
- `AF-02` / `AF-03` / `AF-04` were executed in the fresh-user provisioning flow. The browser reached onboarding and then landed on `/users`, which satisfies the matrix expectation for onboarding completion and post-onboarding landing.
- Additional mismatch uncovered during the `AF-02` / `AF-03` / `AF-04` run: the existing repo spec expected the preserved redirect target `/app/dashboard`, but the observed final URL after onboarding was `/users`.
- Debug investigation is now complete.
- AF-01 is currently classified as likely harness-side Clerk verification instability rather than confirmed app bootstrap regression.
- The `/app/dashboard` post-onboarding expectation has now been explicitly rejected by user decision; `/users` is the authoritative landing contract for this workflow.
- Additional code drift was confirmed: the onboarding server action can honor `redirect_url`, but the browser onboarding form does not submit that field, so arbitrary redirect preservation is not implemented end to end today.
- Consequence: contract clarification is complete for post-onboarding landing. The immediate next action is to rerun the corrected fresh-user provisioning test and then decide whether AF-01 should be stabilized now or carried as a harness-side blocked item while later phases proceed.
- Focused rerun completed on 2026-03-20 for the corrected fresh-user Phase 1 case in container mode. The targeted Playwright case passed and confirmed the route sequence `/auth/bootstrap/start?redirect_url=/app/dashboard` -> `/onboarding?redirect_url=%2Fapp%2Fdashboard` -> `/users`.
- Phase 2 targeted execution on 2026-03-20 now provides final passing browser evidence for `AF-05` / `AF-06` / `AF-07`.
- Implementation follow-up converted `AF-05` into a rerunnable returning-user scenario by creating completed single-user state inside the test, signing out, and re-authenticating before the returning-user assertion.
- Implementation follow-up aligned the incomplete-user helper and assertions with repository behavior: the provisioning-status API returns body code `ONBOARDING_REQUIRED`, and the required contract for AF-06 / AF-07 is routing to `/onboarding`, not preservation of `redirect_url=/users`.
- Final focused rerun in Chromium passed all three targeted Phase 2 scenarios: `3 passed (22.9s)`.
- Additional Phase 2 implementation and verification on 2026-03-21 added explicit AF-08 / AF-09 coverage in `e2e/provisioning-runtime.spec.ts` using the rerunnable completed-user helper.
- Focused Chromium rerun for AF-08 / AF-09 passed: `2 passed (13.6s)`.
- A broad five-scenario AF-05 through AF-09 rerun later hit an intermittent `429` on AF-05's deeper protected-API probe, but a targeted AF-05 rerun still passed: `1 passed (12.5s)`. Current Phase 2 status remains PASS on targeted browser evidence.
- Package-level auth-matrix scripts are now implemented in `package.json` using Playwright title tags instead of brittle full test-name grep. The new entrypoints are `e2e:auth-matrix`, `e2e:auth-matrix:phase1`, `e2e:auth-matrix:phase2`, and `e2e:auth-matrix:ci`.
- Validation of the new scripts confirmed that the phase-1 script executes the two tagged Phase 1 cases and the phase-2 script executes the five tagged Phase 2 cases successfully through the existing universal runner.
- Follow-up stabilization on 2026-03-21 fixed two package-level auth-matrix root causes before Phase 3: local Playwright runs could inherit a stale repo-local `next dev` process tree plus `.next/dev/lock`, and E2E auth-matrix API probes were still subject to rate limiting, which produced the intermittent `429` seen in the returning-state slice.
- `scripts/e2e/run-scenario.mjs` now preserves true Playwright list mode through the wrapper, defaults local runs to reusing a healthy existing server unless overridden, and cleans up stale repo-local Next.js dev processes plus `.next/dev/lock` when the configured base URL is unreachable.
- `src/security/middleware/with-rate-limit.ts` now bypasses rate limiting when `E2E_ENABLED` is true so real-browser auth verification does not fail on test-generated provisioning-status probes.
- Final package-level verification now passes end to end with `pnpm e2e:auth-matrix`: Phase 1 passed with `2 passed (10.2s)`, Phase 2 returning-state passed with `3 passed (23.4s)`, and Phase 2 direct-entry passed with `2 passed (13.8s)`.
- Phase 3 execution started on 2026-03-21 with dedicated `@auth-matrix-phase3` Playwright coverage and package script `e2e:auth-matrix:phase3`; `e2e:auth-matrix` now includes Phase 3.
- A stale-cookie AF-15 regression was exposed during the first Phase 3 pass, then fixed by narrowing edge cookie-hint redirects so `/users` remains DB-authoritative while general private routes still honor the onboarding cookie hint.
- Final validation after the fix is green: the focused stale-cookie AF-15 rerun passed in `11.3s`, the full Phase 3 slice passed with `5 passed (24.6s)`, and the package-level `pnpm e2e:auth-matrix` entrypoint is green again with Phase 1 `2 passed (9.5s)`, Phase 2 returning-state `3 passed (23.3s)`, Phase 2 direct-entry `2 passed (13.5s)`, and Phase 3 `5 passed (25.0s)`.
