# Implementation Plan

## Objective

Translate the auth regression requirements into an execution-ready verification plan for the current branch.

## Progress Checklist

- [ ] Phase 0 completed
- [ ] Phase 1 completed
- [ ] Phase 2 completed
- [ ] Phase 3 completed
- [ ] Phase 4 completed
- [ ] Validation mapping recorded in the matrix/run artifact
- [ ] `07 - Playwright E2E - Summary.md` created
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

## Execution Phases

### Phase 0 — Environment And Account Readiness

Checklist:

- [ ] Selected runner mode is confirmed
- [ ] If `E2E_BACKEND_MODE=container`, container-backed test DB startup is automated and validated
- [ ] Container mode targets only `5433/app_test`
- [ ] Clerk redirect env is confirmed
- [ ] App runtime is available
- [ ] Server logs are visible
- [ ] Browser tools are available
- [ ] Prepared accounts are confirmed for fresh user, onboarded returning user, and incomplete user
- [ ] Run metadata is captured
- [ ] Environment notes are captured
- [ ] Account-state notes are captured

Preconditions:

- selected runner mode is known
- if selected mode requires a containerized backend, the runner starts and validates it automatically
- container mode must target the isolated test DB profile on `5433/app_test`, not the dev DB profile
- correct Clerk redirect env is configured
- app runtime is available
- server logs are visible
- browser tools are available
- prepared accounts exist for:
  - fresh user
  - onboarded returning user
  - incomplete user

Expected evidence:

- run metadata
- environment notes
- account-state notes
- selected runner mode

Scenarios supported:

- prerequisite for all later phases

### Phase 1 — Fresh User Core Flow

Checklist:

- [ ] `AF-01` executed and classified
- [ ] `AF-02` executed and classified
- [ ] `AF-03` executed and classified
- [ ] `AF-04` executed and classified
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
- verify incomplete user is routed to `/onboarding`
- verify direct route entry behaves correctly before and after onboarding completion

Real-browser evidence required:

- yes

Expected evidence:

- final URLs
- route-decision logs
- no hang on `/users`

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

## Runner Architecture Direction

- the runner should be universal, not auth-regression-specific
- the runner should support at least two backend/runtime profiles:
  - lightweight file/PGlite-style scenario mode when desired
  - automated local container-backed mode for browser-real regression runs
- the active mode should be selected by E2E_BACKEND_MODE during execution
- local container mode should be designed so the same flow can later be adapted to CI/CD without introducing extra manual setup steps
- container mode should use the repository test DB isolation model, not the dev DB profile

## Deferred / Blocked Handling

Checklist:

- [ ] Every blocked scenario has an explicit reason
- [ ] Every deferred scenario has an explicit reason
- [ ] Execution stops before the next phase if readiness is incomplete
- [ ] No required scenario is silently downgraded out of scope

- if a scenario cannot be executed, record the reason explicitly
- if environment readiness is incomplete, stop before Phase 1 and mark affected scenarios as BLOCKED or DEFERRED as appropriate
- do not silently downgrade a required scenario out of scope
