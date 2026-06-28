# 06 - Debug Investigation - Summary

## Task Context

- Task ID: `2026-04-26-onboarding-loop-authflow-review`
- Task Objective: reduce ambiguity around the reported `/onboarding` looping and excessive logging
- Current Run Scope: code-first execution-path trace plus historical stale-cookie regression comparison and AuthJS session-route recurrence analysis without browser reproduction
- Status: COMPLETED
- Last Updated: 2026-04-26
- Related Control Artifacts: `plan.md`, `intake.md`, `validation-report.md`

## Scope Handled

- symptom or flow investigated: apparent `/onboarding` loop with heavy logs in local AuthJS mode and recurring `CLIENT_FETCH_ERROR` on homepage load
- runtime surfaces investigated: bootstrap route, onboarding layout, protected-route middleware/layouts
- env or timing questions investigated: AuthJS local runtime, provider-aware sign-in entry, cookie-hint path

## Inputs Reviewed

- code paths reviewed: bootstrap start route, bootstrap outcome resolver, onboarding layout/actions, `with-auth.ts`, users/dashboard layouts, sign-in page, post-auth redirect helper, AuthJS route handler, `auth.ts`, and `AuthJsRequestIdentitySource.ts`
- logs / diagnostics reviewed: code-level logging call sites only; no live browser log capture in this run
- tests / task artifacts reviewed: onboarding/bootstrap tests, auth foundation artifacts, admin access regression artifacts

## Actions Performed

- reproduction attempts performed: none in browser during this run
- execution-path tracing performed: yes
- source-of-truth tracing performed: yes
- evidence collection performed: yes, from live code and tests

## Symptom Summary

- observed symptoms: user reports excessive logs and apparent looping at `/onboarding`, then recurring `[next-auth][error][CLIENT_FETCH_ERROR]` with HTML returned for session fetch on homepage load
- where it surfaces: local AuthJS runtime on `http://localhost:3000/onboarding`
- reproducibility: not directly reproduced in this run
- trigger conditions: likely post-auth bootstrap/onboarding entry or onboarding revisit under AuthJS

## Confirmed Evidence

- code facts:
  - bootstrap start sets `__onboarding_pending` and redirects to `/onboarding?redirect_url=...`
  - onboarding completion clears the cookie and redirects to sanitized target
  - `with-auth.ts` is provider-aware for private-route unauthenticated redirects
  - historical artifacts prove the stale-cookie regression previously existed and was fixed for `/users`
  - current live code exempted `/users` from edge cookie authority but left `/dashboard` and `/admin` under cookie-only middleware redirects even though they have DB-backed provisioning guards
  - `auth.ts` and `AuthJsRequestIdentitySource.ts` both resolved the server logger at module scope, which initializes Pino before request-time code reaches the handler body
  - the server logger path constructs a Pino logger eagerly, making those module-scope calls import-time side effects rather than pure declarations
- runtime evidence:
  - none captured directly in browser during this run
- diagnostics or logs:
  - reviewed log-emitting guard points in onboarding, dashboard, users, and bootstrap paths

## Execution Path

- entry point: post-auth redirect helper -> `/auth/bootstrap/start?redirect_url=...`
- critical path:
  - bootstrap start resolves provisioning outcome
  - onboarding_required sets cookie and redirects to `/onboarding`
  - onboarding layout re-resolves identity and user record
  - onboarding completion clears cookie and redirects to final target
- state transitions:
  - unauthenticated -> bootstrap/sign-in
  - bootstrap_required -> bootstrap start
  - onboarding_required -> onboarding render
  - onboarding complete -> default app entry `/dashboard` or sanitized redirect target
- failure boundary: stale `__onboarding_pending` cookie can override DB-ready state on `/dashboard`, causing middleware to redirect to `/onboarding` while the onboarding guard redirects DB-complete users back to `/dashboard`

## Hypotheses And Failure Points

- likely failure points:
  - stale `/sign-in` redirects in AuthJS-sensitive onboarding/bootstrap paths
  - stale-cookie edge authority on `/dashboard` after the app entry moved away from `/users`
  - import-time AuthJS logger initialization in the session-route dependency path
  - possible second session/bootstrap re-entry if loop evidence remains after the stale-cookie fix
- hypotheses:
  - H1: the user-visible loop is caused or amplified by provider-inconsistent unauthenticated redirects
  - H2: the more direct current loop cause is stale-cookie edge authority on `/dashboard`, recreating the older `/users` regression pattern on the new canonical entry route
  - H3: the `CLIENT_FETCH_ERROR` recurrence is caused by import-time side effects in the AuthJS route dependency path, preventing `/api/auth/session` from reaching stable request-time execution
  - H4: a further runtime/session issue may still exist, but current code evidence alone does not prove it
- disproven possibilities:
  - bootstrap-start abandoning DB truth in favor of cookie truth
  - illegal cookie mutation in page/layout render
  - proxy taking over `/users` onboarding truth again

## Missing Evidence / Uncertainty

- what remains unclear: whether any redirect loop remains after removing stale-cookie authority from `/dashboard`, and whether `/api/auth/session` is now fully healthy after the lazy-logger patch
- what evidence would reduce uncertainty fastest: browser trace or Playwright run covering `/auth/bootstrap/start -> /onboarding -> /dashboard` under AuthJS plus direct `/api/auth/session` health verification
- external dependencies or blockers: none, beyond time to capture browser evidence

## Artifact Synchronization

- `plan.md` updates: created and synchronized
- `intake.md` updates: created and synchronized
- `implementation-plan.md` updates: created and synchronized
- specialist artifact updates: this file created

## Handoff Notes

- what the next agent should rely on: the stale-cookie failure mode is grounded in both live code and prior regression artifacts, and the AuthJS session route had a second plausible import-time side-effect failure path
- what remains unproven: whether the reported loop has an additional runtime cause beyond the stale-cookie, sign-in redirect, and lazy-logger fixes
- recommended next specialist or step: run focused browser validation against `/auth/bootstrap/start?redirect_url=/dashboard` and direct `/api/auth/session` health verification before widening scope again

## Update Log

### Update Entry

- Date: 2026-04-26
- Trigger: onboarding loop investigation request
- Summary of change: compared the current loop path against the prior stale-cookie regression, identified `/dashboard` as the new vulnerable entry route, then traced a separate `CLIENT_FETCH_ERROR` recurrence to import-time AuthJS logger side effects and documented the reduced uncertainty
- Sections refreshed: all
