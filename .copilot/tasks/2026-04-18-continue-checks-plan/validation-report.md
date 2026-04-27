# Continue Checks Validation Report

## Scope

- task: `2026-04-18-continue-checks-plan`
- mode: local manual prompt-trial validation plus CI wiring validation
- target: phase 1 Continue rules, 4 blocking checks, and the first repo-local CI workflow

## Validation Method

- representative-diff validation used historical diffs plus direct live-code review of the affected surfaces
- CI rollout validation used workflow file inspection plus repository error checks after wiring `.github/workflows/continue-checks.yml`
- success criteria:
  - each phase 1 check must match at least one representative diff
  - non-applicable checks should early-exit quietly on the same diff
  - auth-scoped low-signal changes should not trigger full contract review after prompt refinement
  - CI workflow should run the local `.continue/checks/*.md` set through `cn review`
  - CI workflow should retain outputs as artifacts and cancel stale runs

## Representative Diff Trials

### Trial 1 — Low-Signal Auth-Adjacent Copy Change

- diff source: `git --no-pager show --stat --patch 4c651f1b -- src/app/auth/bootstrap/bootstrap-error.tsx`
- expected check behavior:
  - `auth-flow-change-review.md` → pass / early-exit after refined auth-scoped low-signal gating
  - `redirect-sanitization.md` → early-exit
  - `connection-before-di.md` → early-exit
  - `rate-limit-path-propagation.md` → early-exit
- result:
  - the refined auth-flow prompt shape is correct for this class of diff
  - the remaining three checks are outside scope and should stay silent

### Trial 2 — Redirect Sanitization Fix

- diff source: `git --no-pager show --stat --patch 0ef6a6ed -- src/security/middleware/with-auth.ts`
- changed behavior:
  - reads `redirect_url` from the request
  - sanitizes it via `sanitizeRedirectUrl(rawRedirectUrl, '/users')`
- expected check behavior:
  - `redirect-sanitization.md` → applicable and pass
  - `auth-flow-change-review.md` → applicable and pass as an auth redirect hardening change
  - `connection-before-di.md` → early-exit
  - `rate-limit-path-propagation.md` → early-exit
- result:
  - `redirect-sanitization.md` has the right trust-boundary focus
  - the pre-fix side of this diff is also the exact failure shape the check is meant to catch

### Trial 3 — /users Onboarding Routing Change

- diff source: `git --no-pager show --stat --patch eef83bb0 -- src/security/middleware/with-auth.ts`
- changed behavior:
  - bypasses onboarding redirect for `/users` so the DB-backed users layout stays authoritative
- expected check behavior:
  - `auth-flow-change-review.md` → applicable and pass
  - `redirect-sanitization.md` → early-exit
  - `connection-before-di.md` → early-exit
  - `rate-limit-path-propagation.md` → early-exit
- result:
  - auth-flow prompt correctly maps to behavior-level auth routing changes rather than file-path presence alone

### Trial 4 — Request-Time Opt-In Before DI

- diff source: `git --no-pager show --stat --patch 231808ad -- src/app/feature-flags-demo/page.tsx`
- changed behavior:
  - adds `await connection()` before `getAppContainer().createChild()` in an async App Router render path
- expected check behavior:
  - `connection-before-di.md` → applicable and pass
  - `auth-flow-change-review.md` → early-exit
  - `redirect-sanitization.md` → early-exit
  - `rate-limit-path-propagation.md` → early-exit
- result:
  - runtime prompt correctly identifies the intended render-path hazard and acceptable fix pattern

### Trial 5 — SEC-17 Path Propagation Fix

- diff source: `git --no-pager show --stat --patch 4581c394 -- src/security/middleware/with-rate-limit.ts`
- changed behavior:
  - introduces local `pathname`
  - passes `checkRateLimit(ip, { path: pathname })`
  - removes the bypass workaround for `/api/logs`
- expected check behavior:
  - `rate-limit-path-propagation.md` → applicable and pass
  - `auth-flow-change-review.md` → early-exit
  - `redirect-sanitization.md` → early-exit
  - `connection-before-di.md` → early-exit
- result:
  - SEC-17 prompt is scoped correctly to request-aware production call sites
  - the pre-fix side of this diff is the exact regression shape the check should fail

## Validation Verdict

- all 4 phase 1 blocking checks now have at least one representative applicable diff
- each applicable diff has a clear expected pass outcome on the fixed side
- two checks also have a clear failure shape on the pre-fix side of the same historical patch:
  - `redirect-sanitization.md`
  - `rate-limit-path-propagation.md`
- auth-flow prompt refinement materially reduced low-signal auth-file noise
- no evidence from the trial set suggests that the checks are currently duplicating deterministic lint/typecheck/test ownership

## CI Rollout Readiness

- ready for phase 3 CI integration: implemented
- recommended rollout order:
  1. run deterministic checks first
  2. run Continue checks on the cleaner post-lint/post-typecheck diff state
  3. retain full Continue outputs as workflow artifacts for prompt tuning
  4. use stale-run cancellation to avoid concurrent PR noise
- still not proven:
  - real-world false-positive rate across multiple live PRs
  - operator ergonomics of reviewing all 4 checks in one CI run

## CI Wiring Validation

- implemented workflow:
  - `.github/workflows/continue-checks.yml`
- workflow guarantees confirmed by inspection:
  - single-runner PR workflow with stale-run cancellation
  - explicit `CONTINUE_API_KEY` validation before execution
  - Continue CLI install with API-key-based headless auth via environment variable
  - `cn review --base <base-branch> --format json` against repo-local `.continue/checks/*.md`
  - JSON, stderr, base-ref, and markdown summary artifacts retained even on failure
  - job fails only after artifact upload, preserving debugging evidence
- documentation added:
  - `README.md` local iteration section for `cn check`
- validation limits:
  - no live end-to-end workflow execution was possible in this session because GitHub Actions secrets and hosted runner execution are unavailable locally

## Commands Used

```shell
git --no-pager show --stat --patch 4c651f1b -- src/app/auth/bootstrap/bootstrap-error.tsx
git --no-pager show --stat --patch 0ef6a6ed -- src/security/middleware/with-auth.ts
git --no-pager show --stat --patch eef83bb0 -- src/security/middleware/with-auth.ts
git --no-pager show --stat --patch 231808ad -- src/app/feature-flags-demo/page.tsx
git --no-pager show --stat --patch 4581c394 -- src/security/middleware/with-rate-limit.ts src/shared/lib/rate-limit/rate-limit-helper.ts src/shared/lib/rate-limit/rate-limit-helper.test.ts
git --no-pager log --oneline -S 'await connection()' -- src/app | head -n 20
git --no-pager log --oneline -S 'path: pathname' -- src/security/middleware/with-rate-limit.ts src/shared/lib/rate-limit/rate-limit-helper.ts | head -n 20
```
