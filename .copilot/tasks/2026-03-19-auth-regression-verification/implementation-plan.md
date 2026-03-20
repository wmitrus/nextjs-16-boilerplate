# Implementation Plan

## Objective

Translate the auth regression requirements into an execution-ready verification plan for the current branch.

## Progress Checklist

- [x] Phase 0a completed
- [ ] Phase 0 completed
- [ ] Phase 1 completed
- [ ] Phase 2 completed
- [ ] Phase 3 completed
- [ ] Phase 4 completed
- [ ] Validation mapping recorded in the matrix/run artifact
- [x] `07 - Playwright E2E - Summary.md` created
- [ ] Final validation report created

## Execution Model

- treat this as a controlled verification workflow, not exploratory testing
- execute scenarios in phases that minimize state confusion and make evidence collection readable
- reuse the same artifact set and matrix mapping throughout the run
- use real Playwright browser execution as the authoritative verification method
- progress sequentially from the first scenario phase to the next only after the current phase is completed or explicitly blocked/deferred
- prefer interactive browser flow that matches manual clicking for the main regression evidence
- build the runner so it remains universal and reusable beyond this task
- use E2E_BACKEND_MODE=pglite|container to choose the execution backend/runtime profile
- preserve the current separated scenario behavior for PGlite and add the same separated scenario behavior for container rather than inventing a different scenario model per backend

## Execution Phases

### Phase 0a — Runner Alignment Before Browser Verification

Checklist:

- [x] Runner branching for `E2E_BACKEND_MODE=pglite|container` is designed
- [x] Existing PGlite scenario flow is explicitly preserved
- [x] Container scenario flow uses the same scenario entrypoint and Playwright arguments as PGlite
- [x] Container mode startup reuses repository DB lifecycle commands instead of ad hoc shell logic
- [x] Container mode targets only the test DB profile (`5433/app_test`)
- [x] Mode-specific migrate / seed / reset behavior is defined
- [x] Mode-specific cleanup behavior is defined
- [x] Validation plan for runner alignment is recorded

Implementation intent:

- keep `scripts/e2e/run-scenario.mjs` as the universal scenario entrypoint
- branch setup behavior by `E2E_BACKEND_MODE`
- keep the current PGlite file-backed reset flow for `pglite`
- add a container-backed setup path that reuses repository test DB/container commands and guards
- keep scenario selection, env loading, and Playwright argument forwarding identical across backend modes

Expected affected areas:

- `scripts/e2e/run-scenario.mjs`
- `scripts/e2e/load-env.mjs`
- `scripts/check-e2e-auth-env.mjs`
- `scripts/compose-db-local.mjs`
- `scripts/db-ops.mjs`
- `package.json`

Validation intent:

- confirm `pglite` mode still resolves a file-backed DB and existing scenario setup
- confirm `container` mode starts the test DB lifecycle, targets only `5433/app_test`, and avoids the dev DB path
- confirm the same scenario command shape works for both modes with only `E2E_BACKEND_MODE` changed

Implementation result:

- `scripts/e2e/run-scenario.mjs` remains the single scenario entrypoint
- `scripts/e2e/load-env.mjs` now validates backend mode through `resolveE2EBackendMode`
- `pglite` mode still clears the scenario file DB, then runs `db:migrate:dev` and `db:seed`
- `container` mode now runs `db:test:up` and `node scripts/db-ops.mjs test reset --force`, targeting the isolated test DB profile
- Playwright invocation stays unchanged apart from env-driven backend setup

Focused validation completed:

- `node --check scripts/e2e/load-env.mjs`
- `node --check scripts/e2e/run-scenario.mjs`
- `node --input-type=module -e "import { resolveE2EBackendMode } from './scripts/e2e/load-env.mjs'; ..."`
- `node scripts/check-e2e-auth-env.mjs --scenario single`
- `E2E_BACKEND_MODE=pglite node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --list`
- `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --list`
- `pnpm db:test:down`

### Phase 0 — Environment And Account Readiness

Checklist:

- [x] Selected runner mode is confirmed
- [x] If `E2E_BACKEND_MODE=container`, container-backed test DB startup is automated and validated
- [x] Container mode targets only `5433/app_test`
- [ ] Clerk redirect env is confirmed
- [x] App runtime is available
- [ ] Server logs are visible
- [x] Browser tools are available
- [x] Prepared identities are confirmed for fresh user, onboarded returning user, and reusable incomplete-user flow
- [x] In-run setup for the onboarding-incomplete app state is defined for AF-06 / AF-07
- [x] Run metadata is captured
- [x] Environment notes are captured
- [x] Account-state notes are captured

Current readiness findings:

- Local env selects `E2E_BACKEND_MODE=container`.
- Clerk keys are configured.
- Existing `single` fixtures for provisioned and new users are configured and pass the repository env validator for the `single` scenario.
- Rerunnable auth-regression guidance now treats the incomplete case as a reusable Clerk identity plus in-run app-state setup, not as a permanently preserved DB state.
- The reusable incomplete identity now uses the canonical env contract `E2E_CLERK_INCOMPLETE_USER_USERNAME` / `E2E_CLERK_INCOMPLETE_USER_PASSWORD`.
- Non-secret local env checks confirm all six single-mode identity vars are set for fresh, onboarded, and incomplete-user flows.
- AF-06 / AF-07 test flow now uses `signInClerkIncompleteUserE2E()` and recreates onboarding-incomplete app state in `e2e/provisioning-runtime.spec.ts` by signing in, reaching `/onboarding`, and intentionally not submitting before the returning-user assertions.
- Runner alignment is complete: the current scenario runner now honors `E2E_BACKEND_MODE=pglite|container` while preserving the existing PGlite flow.
- User direction for remediation is now explicit: preserve the current PGlite scenario flow and add the same scenario flow for container behind the env switch.
- A container-mode real-browser smoke run reached repository DB lifecycle execution successfully: `db:test:up` reused or started `nextjs16_test_db`, `node scripts/db-ops.mjs test reset --force` targeted `127.0.0.1:5433/app_test`, migrations applied, and seed completed.
- After `npx playwright install --with-deps`, rerunning the same container-mode smoke check succeeded: the browser launched, the app runtime came up, and `e2e/auth.spec.ts` passed the signed-out home-page smoke assertion in 5.3s.
- The current Playwright config still sets `webServer.stdout='ignore'` and `webServer.stderr='ignore'`, so server-log visibility is not currently satisfied for this task workflow.

Current Phase 0 status:

- READY FOR BROWSER EXECUTION, with server-log visibility still limited by current Playwright config.

Preconditions:

- selected runner mode is known
- if selected mode requires a containerized backend, the runner starts and validates it automatically
- container mode must target the isolated test DB profile on `5433/app_test`, not the dev DB profile
- correct Clerk redirect env is configured
- app runtime is available
- server logs are visible
- browser tools are available
- prepared accounts exist for:
- prepared identities exist for:
  - fresh user
  - onboarded returning user
  - reusable incomplete identity
- the onboarding-incomplete app state for AF-06 / AF-07 is recreated during the run after DB reset by reaching `/onboarding` and intentionally not submitting onboarding before the returning-user assertions

Expected evidence:

- run metadata
- environment notes
- account-state notes
- selected runner mode
- container DB lifecycle evidence
- browser-launch blocker evidence when readiness cannot be completed

Scenarios supported:

- prerequisite for all later phases

### Phase 1 — Fresh User Core Flow

Checklist:

- [x] `AF-01` executed and classified
- [x] `AF-02` executed and classified
- [x] `AF-03` executed and classified
- [x] `AF-04` executed and classified
- [ ] Final URLs captured
- [ ] Key route-decision logs captured
- [ ] Submit evidence captured
- [ ] Route-commit behavior recorded

Scenarios:

- `AF-01`
- `AF-02`
- `AF-03`
- `AF-04`

Execution intent:

- verify sign-up and app-owned bootstrap/start behavior
- verify onboarding-required routing
- verify onboarding submit and DB-backed completion
- verify stable landing on `/users`
- this is the required starting phase for the workflow

Real-browser evidence required:

- yes

Authoritative interaction style:

- interactive browser flow matching manual clicking should be preferred for the main regression evidence

Expected evidence:

- final URLs
- key route-decision logs
- submit evidence
- route-commit behavior

Phase 1 execution notes:

- `AF-01` was first executed with `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/auth.spec.ts --project=chromium --grep 'sign-up via /sign-up page force redirects through /auth/bootstrap/start'` and initially failed while the sign-up harness still handled Clerk verify-email opportunistically and only accepted bootstrap requests tagged by Playwright as navigation requests.
- Implementation follow-up updated `e2e/auth.spec.ts` so hosted Clerk sign-up now waits deterministically for either Clerk verify-email or bootstrap, completes Clerk's fixed test OTP path through `enterTestOtpCode()`, and accepts `/auth/bootstrap/start` requests even when Playwright does not classify them as navigation requests.
- Focused rerun for `AF-01` then passed with `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/auth.spec.ts --project=chromium --reporter=line --grep 'sign-up via /sign-up page force redirects through /auth/bootstrap/start'`.
- Result for `AF-01`: PASS after the harness fix.
- `AF-02` / `AF-03` / `AF-04` were executed with `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --reporter=line --grep 'single mode: first login goes through bootstrap, reaches onboarding, completes onboarding, then lands on /users'`.
- Result for `AF-02`: PASS. The run reached `/onboarding?redirect_url=%2Fapp%2Fdashboard`, showing the fresh user was routed into onboarding after bootstrap.
- Result for `AF-03`: PASS against the matrix expectation. After onboarding submission, the browser left onboarding and ended at `/users`.
- Result for `AF-04`: PASS against the matrix expectation. The error snapshot after onboarding shows `/users` content rendered with the `User Management` heading and authenticated user menu visible.
- Contract clarification on 2026-03-20: `/users` is the confirmed authoritative post-onboarding landing for this workflow. The earlier `/app/dashboard` expectation was stale and has been removed from the Phase 1 interpretation.
- Phase 1 remains open only because the run artifact still needs richer route-decision/log evidence.
- Focused rerun on 2026-03-20 for the corrected fresh-user provisioning case passed with `E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --reporter=line --grep 'single mode: first login goes through bootstrap, reaches onboarding, completes onboarding, then lands on /users'`.
- Verified route sequence for that focused rerun: `/auth/bootstrap/start?redirect_url=/app/dashboard` -> `/onboarding?redirect_url=%2Fapp%2Fdashboard` -> `/users`.

Debug triage gate before Phase 2:

- determine whether `AF-01` failure is caused by unstable Clerk email-verification handling in the interactive sign-up harness or by a real app-side bootstrap redirect regression
- determine whether post-onboarding landing on `/users` is intended product behavior or a stale/over-strong test contract relative to the auth-flow matrix
- do not continue to Phase 2 until those two questions are explicitly classified or intentionally deferred

Debug triage result:

- `AF-01` harness issue was resolved in implementation: hosted Clerk sign-up now waits deterministically for Clerk verify-email or bootstrap and no longer requires the bootstrap request to be flagged as a navigation request
- the post-onboarding `/app/dashboard` expectation was confirmed stale by user decision because the auth-flow docs and matrix expect stable landing on `/users`
- separate code drift was identified: `src/app/onboarding/actions.ts` supports `redirect_url`, but `src/app/onboarding/onboarding-form.tsx` does not submit it in the browser flow
- verification-code design clarification: Clerk test emails containing `+clerk_test` should use fixed code `424242`; no separate CI-only Clerk setting is required for that code itself, but the Clerk test instance must have the relevant first-factor verification method enabled and must not add unsupported extra verification to the dedicated password fixtures
- workflow recommendation after implementation: contract clarification is complete for post-onboarding landing and AF-01 no longer needs to be carried as harness-side blocked

### Phase 2 — Returning User Routing

Checklist:

- [ ] `AF-05` executed and classified
- [ ] `AF-06` executed and classified
- [ ] `AF-07` executed and classified
- [ ] `AF-08` executed and classified
- [ ] `AF-09` executed and classified
- [ ] Final URLs captured
- [ ] Route-decision logs captured
- [ ] No-hang behavior on `/users` recorded

Scenarios:

- `AF-05`
- `AF-06`
- `AF-07`
- `AF-08`
- `AF-09`

Execution intent:

- verify completed user returns directly to `/users`
- verify the reusable incomplete identity can recreate onboarding-incomplete app state during the run and is then routed to `/onboarding`
- verify direct route entry behaves correctly before and after onboarding completion

Real-browser evidence required:

- yes

Expected evidence:

- final URLs
- route-decision logs
- no hang on `/users`
- notes showing how the onboarding-incomplete app state was created during the run

### Phase 3 — Cookie And Source-Of-Truth Checks

Checklist:

- [ ] `AF-12` executed and classified
- [ ] `AF-13` executed and classified
- [ ] `AF-14` executed and classified
- [ ] `AF-15` executed and classified
- [ ] Cookie presence/absence observations captured
- [ ] Network evidence captured where relevant
- [ ] Runtime log correlation recorded

Scenarios:

- `AF-12`
- `AF-13`
- `AF-14`
- `AF-15`

Execution intent:

- verify middleware reads the routing signal correctly
- verify cookie set and clear behavior is runtime-legal
- verify DB remains authoritative

Real-browser evidence required:

- yes, with browser/network/cookie inspection support

Expected evidence:

- cookie presence/absence observations
- network evidence where relevant
- runtime log correlation

### Phase 4 — Runtime Stability Checks

Checklist:

- [ ] `AF-17` executed and classified
- [ ] `AF-18` executed and classified
- [ ] `AF-21` executed and classified
- [ ] Browser-observed route settlement recorded
- [ ] Relevant logs captured
- [ ] Explicit race absence or reproduction note recorded

Scenarios:

- `AF-17`
- `AF-18`
- `AF-21`

Execution intent:

- verify the root layout and Clerk provider branch remain stable
- verify no `blocking-route`
- verify no `Rendering...`
- verify no `/users -> /onboarding` race remains

Real-browser evidence required:

- yes

Expected evidence:

- browser-observed route settlement
- relevant logs
- explicit note on race absence or reproduction

## Validation Mapping

Checklist:

- [ ] All executed phases are mapped back to `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- [ ] PASS / FAIL / DEFERRED / BLOCKED is recorded per scenario or scenario group
- [ ] Run artifact is structured using `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

- record all phase outcomes against `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- use PASS / FAIL / DEFERRED / BLOCKED per scenario or scenario group
- structure the execution artifact using `docs/ai/templates/AUTH_FLOW_VERIFICATION_RUN_TEMPLATE.md`

## Specialist Routing During Execution

- `07 - Playwright E2E` executes the browser verification plan
- escalate to `06 - Debug Investigation` if the observed behavior is ambiguous or unstable before trustworthy classification
- escalate to `02 - Security & Auth` only if the observed results suggest trust-boundary or auth-policy regression beyond straightforward verification
- escalate to `03 - Next.js Runtime` only if the observed results suggest runtime-placement, App Router, Suspense, or route-settlement regression
- escalate to `05 - Validation Strategy` only if the minimum task scope no longer looks sufficient

## Existing Setup Assessment

- existing auth E2E coverage already includes browser-real auth-route tests in `e2e/auth.spec.ts`
- existing provisioning/runtime coverage already includes a first implementation of the `single` scenario family in `e2e/provisioning-runtime.spec.ts`
- existing Clerk fixture env names are already canonical and reused across the current suite, helper layer, and env validation scripts
- comments/descriptions may be aligned with this workflow, but variable names should not be duplicated or renamed unless a broader refactor is explicitly approved
- current Playwright config starts the app automatically, but current scenario runner uses PGlite and does not automatically start the Podman-backed Postgres test DB
- repository already has container lifecycle scripts and DB guards; implementation should reuse them instead of inventing a parallel container runner
- repository already exposes test DB lifecycle and guardrails through `db:test:up`, `db:test:down`, `db:test:migrate`, `db:test:seed`, `db:test:reset`, `compose-db-local.mjs`, and `db-ops.mjs`; runner alignment should compose these instead of re-implementing them

## Runner Architecture Direction

- the runner should be universal, not auth-regression-specific
- the runner should support at least two backend/runtime profiles:
  - lightweight file/PGlite-style scenario mode when desired
  - automated local container-backed mode for browser-real regression runs
- the active mode should be selected by E2E_BACKEND_MODE during execution
- local container mode should be designed so the same flow can later be adapted to CI/CD without introducing extra manual setup steps
- container mode should use the repository test DB isolation model, not the dev DB profile
- preserve the current separated scenario flow and Playwright selection semantics for PGlite
- implement the same separated scenario flow for container rather than introducing backend-specific scenario names or duplicated task scripts
- only backend setup, reset, migrate, seed, and optional cleanup behavior should differ by mode; scenario env loading and test selection should remain shared

## Deferred / Blocked Handling

Checklist:

- [ ] Every blocked scenario has an explicit reason
- [ ] Every deferred scenario has an explicit reason
- [ ] Execution stops before the next phase if readiness is incomplete
- [ ] No required scenario is silently downgraded out of scope

- if a scenario cannot be executed, record the reason explicitly
- if environment readiness is incomplete, stop before Phase 1 and mark affected scenarios as BLOCKED or DEFERRED as appropriate
- do not silently downgrade a required scenario out of scope
