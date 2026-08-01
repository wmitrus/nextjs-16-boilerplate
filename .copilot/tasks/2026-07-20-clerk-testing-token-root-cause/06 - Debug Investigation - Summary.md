# 06 - Debug Investigation - Summary

## Task Context

- Task ID: 2026-07-20-clerk-testing-token-root-cause
- Task Objective: Diagnose the `pnpm e2e:full` auth/provisioning failures after adding the missing Clerk Backend SDK dependency.
- Current Run Scope: Playwright trace/log investigation for hosted sign-up, org/provider, org/db, and Clerk provider API setup/cleanup failures.
- Status: COMPLETED
- Last Updated: 2026-07-20
- Related Control Artifacts:
  - `.copilot/tasks/2026-07-20-clerk-testing-token-root-cause/plan.md`
  - `.copilot/tasks/2026-07-20-clerk-testing-token-root-cause/05 - Validation Strategy - Summary.md`

## Scope Handled

- symptom or flow investigated: `sign-up via header modal force redirects through /auth/bootstrap/start`
- runtime surfaces investigated: Clerk hosted sign-up, Playwright request wait, Clerk Backend API fixture state
- env or timing questions investigated: whether `/auth/bootstrap/start` was missing due to app routing or Clerk pre-session failure

## Inputs Reviewed

- code paths reviewed:
  - `e2e/auth.spec.ts`
  - `e2e/clerk-auth.ts`
  - `scripts/check-e2e-auth-env.mjs`
  - `docs/usage/05 - Playwright E2E Architecture.md`
- logs / diagnostics reviewed:
  - `test-results/auth-Authentication-E2E-si-41423-hrough-auth-bootstrap-start-chromium/error-context.md`
  - `test-results/auth-Authentication-E2E-si-41423-hrough-auth-bootstrap-start-chromium/trace.zip`
- tests / task artifacts reviewed:
  - focused `node scripts/e2e/run-scenario.mjs single -- e2e/auth.spec.ts --project=chromium --reporter=line --trace=on --grep "sign-up via header modal force redirects through /auth/bootstrap/start"`

## Actions Performed

- reproduction attempts performed:
  - reproduced the timeout under the authoritative E2E scenario runner
- execution-path tracing performed:
  - inspected Playwright trace network events for Clerk hosted sign-up
- source-of-truth tracing performed:
  - confirmed failure occurs before the app receives a valid signed-in session
- evidence collection performed:
  - queried Clerk Backend organizations read-only to confirm quota state

## Symptom Summary

- observed symptom: Playwright timed out waiting for a `/auth/bootstrap/start` request.
- where it surfaces: `waitForBootstrapNavigation()` in `e2e/auth.spec.ts`.
- reproducibility: reproduced in the focused sign-up modal test.
- trigger conditions: hosted Clerk sign-up reaches email verification, then Clerk rejects verification before session creation.

## Confirmed Evidence

- code facts:
  - the failing test waits for `/auth/bootstrap/start` only after Clerk sign-up succeeds
  - generated sign-up emails use the `e2e+clerk_test-*@example.com` pattern
- runtime evidence:
  - Clerk returned HTTP 403 from `attempt_verification`
  - Clerk response code was `organization_quota_exceeded`
  - the failed sign-up had no `created_session_id` and no `created_user_id`
  - Clerk Backend organization listing reported 50 organizations in the test instance
  - sampled organizations were named `My Organization`, had `my-organization-*` slugs, and had zero members
- diagnostics or logs:
  - Playwright trace shows the app-side bootstrap request never occurs because Clerk never creates the session

## Execution Path

- entry point: home page sign-up button opens Clerk sign-up modal
- critical path: Clerk sign-up email/password -> Clerk verification code -> Clerk session creation -> app bootstrap redirect
- state transitions:
  - generated email enters sign-up attempt
  - verification attempt is submitted
  - Clerk rejects verification due to organization quota
- failure boundary:
  - external Clerk test instance quota, before application bootstrap routing

## Hypotheses And Failure Points

- likely failure points:
  - Clerk organization quota exhausted by previous hosted sign-up runs
- hypotheses:
  - app route/proxy regression: disproven by trace; the app never receives the expected post-session bootstrap navigation
  - Playwright wait selector/request predicate issue: downstream symptom only
  - missing SDK dependency: fixed by installing `@clerk/backend`; no longer the current failure
- disproven possibilities:
  - database seed/reset issue; seed completed before the browser suite and the failing request is external to the DB path

## Missing Evidence / Uncertainty

- what remains unclear:
  - whether all 50 zero-member `My Organization` records are safe to delete without user confirmation
- what evidence would reduce uncertainty fastest:
  - user approval to clean only organizations matching strict guards: name `My Organization`, slug prefix `my-organization-`, zero members
- external dependencies or blockers:
  - Clerk test instance must be cleaned up or upgraded before hosted sign-up E2E can pass

## Artifact Synchronization

- `plan.md` updates: existing task artifact remains the control plan
- `intake.md` updates: not changed in this pass
- `implementation-plan.md` updates: not applicable
- specialist artifact updates:
  - this debug summary records the trace-backed root cause and external blocker

## Handoff Notes

- what the next agent should rely on:
  - the timeout is caused by Clerk `organization_quota_exceeded`, not by app bootstrap routing
  - user cleanup of generated sign-up users has been added to reduce future accumulation
- what remains unproven:
  - focused auth test passing after external Clerk organization cleanup
- recommended next specialist or step:
  - after approval, delete only strictly identified zero-member generated Clerk organizations, then rerun the focused auth spec and widen back to `pnpm e2e:full`

## Update Log

### Update Entry

- Date: 2026-07-20
- Trigger: `pnpm e2e:full` failed in `e2e/auth.spec.ts` after installing `@clerk/backend`
- Summary of change: Captured the Clerk quota root cause and the current external cleanup blocker.
- Sections refreshed: all

### Update Entry

- Date: 2026-07-20
- Trigger: Subsequent `pnpm e2e:full` runs surfaced additional failures after the Clerk organization quota was manually cleared.
- Confirmed root causes:
  - org/provider failed because the configured owner fixture existed but did not have membership in the configured stable Clerk organization slug.
  - non-single scenario runs failed because worker-scoped single-mode storage fixtures executed before `test.skip` in the test body.
  - org/db failed because the test wrote a seeded tenant id into the active context cookie while provisioning expected a seeded organization id for org membership validation.
  - Clerk Backend and Clerk testing-token calls intermittently returned blank `ClerkAPIResponseError` failures during setup/cleanup.
  - `/auth/bootstrap/start` needed explicit `await connection()` to match the repository's Next.js 16 Cache Components route-handler rule.
- Evidence:
  - server logs showed `TenantContextRequiredError` followed by `TenantNotProvisionedError` for active context `10000000-0000-4000-8000-000000000001`, while seeded organizations use `15000000-*` ids.
  - Playwright failure for org/provider disappeared after stable membership reconciliation.
  - auth cleanup failure stack pointed at `deleteGeneratedClerkE2EUserByEmail()` Clerk user lookup, before app code.
- Resolution:
  - implementation addendum in `04 - Implementation Agent - Summary.md` records the exact code changes.
  - final `pnpm e2e:full` passed.
- Sections refreshed: status, scope, update log
