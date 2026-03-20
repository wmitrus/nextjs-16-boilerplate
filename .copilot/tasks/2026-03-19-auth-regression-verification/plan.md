# Task Plan

## Objective

Run a controlled auth regression verification task for the current branch using the repository auth-flow verification model, explicit task artifacts, and real-browser verification only where required, after aligning the E2E runner to honor `E2E_BACKEND_MODE=pglite|container` without regressing the existing PGlite flow.

## Progress Checklist

- [x] Task workspace initialized
- [x] `plan.md` completed
- [x] `intake.md` completed
- [x] `constraints.md` completed
- [x] `implementation-plan.md` completed
- [ ] Env and fixture assumptions validated
- [x] Runner architecture direction confirmed
- [x] Container-mode runner implementation plan confirmed
- [x] Container-mode runner implementation completed
- [ ] `07 - Playwright E2E` run prepared
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
