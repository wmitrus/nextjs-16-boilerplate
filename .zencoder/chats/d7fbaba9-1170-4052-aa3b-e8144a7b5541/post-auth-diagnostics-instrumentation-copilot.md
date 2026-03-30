# Post-Auth Diagnostics Instrumentation

## Objective

Add diagnostic-only observability for the post-auth landing path without changing business logic, redirect policy, auth architecture, or DB backend selection.

The instrumentation target was:

- `/users` guard decisions
- `/auth/bootstrap` entry and redirect behavior
- `provisioning:ensure` major stages and failure stage attribution
- duplicate / concurrent provisioning attempts
- process-scoped DB runtime and PGlite lifecycle behavior
- migration invocation visibility

## Files Changed

Production code:

- `src/app/users/layout.tsx`
- `src/app/auth/bootstrap/page.tsx`
- `src/security/core/node-provisioning-access.ts`
- `src/security/core/node-provisioning-runtime.ts`
- `src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts`
- `src/core/runtime/infrastructure.ts`
- `src/core/db/drivers/create-pglite.ts`
- `src/core/db/migrations/run-migrations.ts`
- `src/shared/lib/observability/server-request-log-context.ts`
- `src/shared/lib/observability/runtime-diagnostic-state.ts`

Test/support updates required by the tightened access outcome shape:

- `src/app/users/layout.test.tsx`
- `src/security/api/with-node-provisioning.test.ts`
- `src/testing/factories/provisioning.ts`

Unrelated runtime churn observed during validation:

- `logs/server.log`

## Implementation Summary

### 1. Request correlation helper

Added `src/shared/lib/observability/server-request-log-context.ts` to resolve:

- `correlationId`
- `requestId`
- request pathname when available
- referer
- runtime (`node` / `edge`)
- environment

This keeps the new logs consistent across `/users`, `/auth/bootstrap`, and provisioning service paths.

### 2. Process-scoped diagnostic state

Added `src/shared/lib/observability/runtime-diagnostic-state.ts` with global per-process counters/maps for:

- infrastructure init / reuse counts
- PGlite init counts by path
- bootstrap attempt counts by external user or fallback correlation id
- provisioning runs by external subject key
- provisioning runs by resolved internal identity key
- migration invocation counts

This is diagnostic-only state and does not participate in routing or provisioning decisions.

### 3. `/users` guard decision logging

Extended `NodeProvisioningAccessOutcome` with mandatory `diagnostics` payloads in `src/security/core/node-provisioning-access.ts`.

Each outcome now carries:

- authenticated external user id when available
- internal identity id when resolved
- internal tenant id when resolved
- tenancy mode
- `userRecordExists`
- `tenantRecordExists`
- `membershipExists`
- `onboardingStateExists`
- `onboardingComplete`
- `provisioningRequired`
- stable reason enum such as:
  - `unauthenticated`
  - `provisioning_required`
  - `missing_user`
  - `missing_tenant`
  - `missing_membership`
  - `missing_onboarding_state`
  - `already_ready`
  - `forbidden`

`src/security/core/node-provisioning-runtime.ts` now also resolves the raw request identity source so the outcome can include the external Clerk user id alongside internal resolution state.

`src/app/users/layout.tsx` logs `users_guard:decision` before redirecting or returning children, including the final decision string:

- `stay:/users`
- `redirect:/sign-in`
- `redirect:/onboarding`
- `redirect:/auth/bootstrap`
- `redirect:/`

If guard resolution throws, the existing redirect-to-bootstrap recovery behavior remains unchanged, but the failure path is now logged with `reason: unsupported_state` and the request correlation fields.

### 4. Bootstrap entry / redirect logging

`src/app/auth/bootstrap/page.tsx` now logs:

- `bootstrap:entry`
- `bootstrap:redirect`

`bootstrap:entry` includes:

- `correlationId`
- `requestId`
- authenticated external user id when available
- raw `redirect_url`
- sanitized target
- bootstrap entry reason (`reason` search param or inferred reason)
- whether it appears to have come from the `/users` guard
- per-process attempt count / active attempt count
- retry-within-process signal
- referer

Success paths now log the redirect target chosen after bootstrap:

- redirect to `/sign-in` when unauthenticated
- redirect to `/onboarding` when onboarding is incomplete
- redirect to the sanitized stable target when the user is ready

No redirect conditions were changed.

### 5. Provisioning stage instrumentation

`src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.ts` now emits structured stage logs for a single `ensureProvisioned()` call:

- `provisioning:ensure:start`
- `provisioning:ensure:db_init_start`
- `provisioning:ensure:db_init_success`
- `provisioning:ensure:migrations_start`
- `provisioning:ensure:migrations_success`
- `provisioning:ensure:transaction_start`
- `provisioning:ensure:identity_lookup_start`
- `provisioning:ensure:user_upsert_start`
- `provisioning:ensure:identity_lookup_result`
- `provisioning:ensure:user_upsert_success`
- `provisioning:ensure:tenant_upsert_start`
- `provisioning:ensure:tenant_upsert_success`
- `provisioning:ensure:membership_upsert_start`
- `provisioning:ensure:membership_upsert_success`
- `provisioning:ensure:onboarding_state_check`
- `provisioning:ensure:complete`
- `provisioning:ensure:failure`

These logs include:

- correlation ids
- request path when available
- run id
- provider and tenancy mode
- external user id
- external tenant id when available
- active tenant id / tenant context source when present
- redacted email preview
- internal user id once resolved
- internal tenant id once resolved
- duplicate-subject counts for external and internal identities
- failure stage attribution
- retryability hint for common transient / runtime DB failures
- error name / message / stack on failure

Important implementation detail:

- `provisioning:ensure:migrations_*` is intentionally logged as `skipped: true` in the request path because this route does not invoke migrations directly. That is deliberate observability, not fake execution.

### 6. Duplicate / concurrent execution visibility

The existing singleflight behavior was preserved.

Additional diagnostics were added so logs now show:

- when a matching in-flight provisioning call is reused via `provisioning:ensure:singleflight_reused`
- how many active runs currently exist for the same external user subject
- how many active runs currently exist for the same resolved internal identity id
- whether a given run looks like a duplicate within the current process

No concurrency semantics were changed.

### 7. DB runtime and PGlite lifecycle logging

`src/core/runtime/infrastructure.ts` now logs process-scope DB lifecycle events:

- `db:runtime:infrastructure_init_start`
- `db:runtime:infrastructure_init_complete`
- `db:runtime:infrastructure_init_failure`
- `db:runtime:infrastructure_reuse`

It also emits `db:pglite:init_reuse` when the cached process infrastructure is reused for a PGlite-backed runtime.

`src/core/db/drivers/create-pglite.ts` now logs:

- `db:pglite:init_start`
- `db:pglite:init_complete`
- `db:pglite:init_failure`
- `db:pglite:close_start`
- `db:pglite:close_complete`

These events include the resolved storage path, total init count for the process, per-path init count, and a simple `moduleReloadSuspected` heuristic when the same path is initialized repeatedly in-process.

### 8. Migration invocation logging

`src/core/db/migrations/run-migrations.ts` now logs:

- `db:migrations:start`
- `db:migrations:success`
- `db:migrations:failure`

This is independent of whether migrations are triggered by the auth flow. The goal is to make any future migration overlap or repeated invocation explicit.

## Validation

Executed:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm vitest run -c vitest.unit.config.ts src/app/users/layout.test.tsx src/security/api/with-node-provisioning.test.ts src/core/db/drivers/create-pglite.test.ts src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.test.ts src/modules/provisioning/infrastructure/drizzle/DrizzleProvisioningService.db.test.ts`
4. `pnpm test`

Results:

- `pnpm typecheck`: passed
- `pnpm lint`: passed
- focused unit slice: all targeted tests passed (`67/67`)
- `pnpm test`: passed

One nuance during validation:

- the first focused Vitest run failed only because the repo enforces global coverage thresholds and a narrow slice cannot satisfy them; the tests themselves passed once run under the unit config, and the normal `pnpm test` gate completed successfully afterward.

## Manual Verification Steps

1. Start the app in development with the current auth and PGlite configuration.
2. Open server logs and filter for:
   - `users_guard:`
   - `bootstrap:`
   - `provisioning:ensure:`
   - `db:runtime:`
   - `db:pglite:`
   - `db:migrations:`
3. Perform a fresh sign-up or sign-in that lands on `/users`.
4. Confirm the first server-side guard decision on `/users` is logged with a concrete reason and final decision.
5. If the user is redirected into bootstrap, confirm `bootstrap:entry` records:
   - external user id
   - redirect target
   - reason
   - attempt count
   - whether it appears to have originated from the `/users` guard
6. Follow the provisioning sequence and identify the last successful `provisioning:ensure:*` stage.
7. If a failure occurs, capture the `provisioning:ensure:failure` event and verify:
   - exact `stage`
   - `retryable`
   - `errorName`
   - `errorMessage`
   - `errorStack`
8. Check whether a matching `db:pglite:init_start` or `db:runtime:infrastructure_init_*` sequence occurred just before the failure.
9. Repeat the same auth action once more without restarting the server and compare:
   - bootstrap attempt counts
   - provisioning singleflight reuse signals
   - DB runtime reuse vs re-init events

## Expected Log Timeline

### Healthy first landing to ready `/users`

Expected order:

1. `db:runtime:infrastructure_init_start` or `db:runtime:infrastructure_reuse`
2. `db:pglite:init_start` and `db:pglite:init_complete` on first process init only
3. `users_guard:decision` with one of:
   - `decision: redirect:/auth/bootstrap`
   - `decision: redirect:/onboarding`
   - `decision: stay:/users`
4. If bootstrap is needed:
   - `bootstrap:entry`
   - `provisioning:ensure:start`
   - stage logs through `...complete`
   - `bootstrap:redirect`
5. Final `/users` request logs `users_guard:decision` with:
   - `decision: stay:/users`
   - `reason: already_ready`

### Healthy landing that still needs onboarding

Expected order:

1. `users_guard:decision` with `decision: redirect:/auth/bootstrap` or `redirect:/onboarding`, depending on current user state
2. If bootstrap runs:
   - `bootstrap:entry`
   - successful provisioning stage logs
   - `bootstrap:redirect` with `decision: redirect:/onboarding`
3. Follow-up request leaves a clear onboarding-required reason trail rather than an ambiguous render stall

### Failure caused during provisioning / DB readiness

Expected order:

1. `bootstrap:entry`
2. `provisioning:ensure:start`
3. last successful stage among:
   - `db_init_success`
   - `transaction_start`
   - `identity_lookup_result`
   - `tenant_upsert_success`
   - `membership_upsert_success`
   - `onboarding_state_check`
4. `provisioning:ensure:failure` with a specific `stage`
5. surrounding DB lifecycle evidence such as:
   - `db:runtime:infrastructure_init_failure`
   - `db:pglite:init_failure`
   - repeated `db:pglite:init_start` for the same path
   - reuse of cached infrastructure instead of re-init

### Duplicate bootstrap / duplicate provisioning symptom

Expected signs:

1. multiple `bootstrap:entry` events with the same external user id and incrementing `attemptInProcess`
2. `provisioning:ensure:singleflight_reused` for identical in-flight work
3. `provisioning:ensure:start` showing `isDuplicateSubject: true`
4. `identity_lookup_result` showing `isDuplicateInternalIdentity: true`

## Outcome

The app now emits enough structured server-side telemetry to answer, from a single run, all of the questions that were previously ambiguous:

- why `/users` redirected or stayed
- why bootstrap was entered
- what bootstrap intended to redirect to
- whether provisioning duplicated or reused in-flight work
- what provisioning stage failed
- whether the DB runtime and PGlite were initialized, reused, or failed during startup
- whether migrations were invoked at all

No business logic, auth enforcement, redirect semantics, or DB backend behavior was intentionally changed.

## Confirmed Runtime Finding From Live Sign-In Attempt

The new telemetry confirmed the failure mode.

### What the logs prove

1. PGlite process initialization succeeded once.

Evidence:

- `db:runtime:infrastructure_init_start`
- `db:pglite:init_start`
- `db:pglite:init_complete`
- `db:runtime:infrastructure_init_complete`

2. After that first successful initialization, the same process-scoped PGlite runtime was reused on every subsequent request.

Evidence:

- repeated `db:runtime:infrastructure_reuse`
- repeated `db:pglite:init_reuse`
- no repeated `db:pglite:init_start`
- no `db:pglite:init_failure`

3. Bootstrap enters normally, and provisioning starts normally.

Evidence:

- repeated `bootstrap:entry`
- repeated `provisioning:ensure:start`
- repeated `provisioning:ensure:db_init_success`

4. The failure happens immediately after provisioning enters the DB transaction boundary.

Evidence:

- last successful stage is always `provisioning:ensure:transaction_start`
- first failure is always `provisioning:ensure:failure` with:
  - `stage: transaction_start`
  - `errorName: RuntimeError`
  - `errorMessage: Aborted(). Build with -sASSERTIONS for more info.`

5. Once that abort happens, even the `/users` guard cannot execute its identity lookup query anymore.

Evidence:

- `users_guard:decision` logs `DrizzleQueryError`
- the failing query is the simple lookup against `auth_user_identities`
- the underlying cause is the same PGlite `RuntimeError: Aborted()`

6. This is not a bootstrap-duplication race and not a migration overlap.

Evidence:

- `activeRunCount` stays `1`
- no `provisioning:ensure:singleflight_reused`
- migration diagnostics explicitly report `invokedInRequestPath: false, skipped: true`

### What the logs do not prove

The logs do not prove, with certainty, that the on-disk files are corrupted.

They prove a narrower and more reliable statement:

- the current process-scoped PGlite runtime for `./data/pglite` becomes unusable during transactional/query execution
- after that abort, every later query in the same dev-server process continues to fail against that reused runtime

That failure mode is consistent with one of these root causes:

1. damaged or incompatible local PGlite data files
2. a PGlite runtime bug triggered by the current local DB state
3. a broken persisted state left behind from an earlier abnormal shutdown or incompatible run

### Real root cause assessment

The real root cause is not Clerk, not the `/users` landing redirect, not middleware, not bootstrap routing, and not missing provisioning logic.

The confirmed root cause is:

- the dev-only PGlite backend at `./data/pglite` is entering a fatal WASM abort when the app first uses it inside the provisioning transaction, and the same poisoned runtime then causes subsequent `/users` identity lookup queries to fail as well.

In operational terms:

- the auth flow is failing because the local PGlite runtime is unhealthy
- bootstrap is only where the first transactional usage makes that failure visible

### Why the current user-facing error is justified

The current error message says the local database may be corrupted and recommends:

- `pnpm db:reset:pglite`
- restart the dev server

That guidance is justified as the first recovery action because:

- the failure is isolated to the local PGlite runtime
- the runtime is reused after the first abort and stays bad for later requests
- resetting the dev database is the lowest-risk recovery path for a local-only PGlite failure

The only wording nuance is that corruption is probable, not strictly proven. The stronger claim the logs support is runtime/storage invalidity in the local PGlite environment.

## Fix Instructions

### Immediate fix

1. Stop the dev server completely.
2. Run `pnpm db:reset:pglite`.
3. Start the app again with `pnpm dev`.
4. Retry sign-in.

### How to verify the fix worked

After reset and restart, the expected healthy sequence is:

1. one fresh `db:pglite:init_start`
2. one fresh `db:pglite:init_complete`
3. bootstrap, if needed, reaches stages beyond `transaction_start`
4. either:
   - `provisioning:ensure:complete` then `bootstrap:redirect`, or
   - `users_guard:decision` with `reason: already_ready`
5. no `RuntimeError: Aborted()` in bootstrap or `/users` guard logs

### If reset does not fix it

If the same abort still happens immediately after a clean reset, the next likely issue is not stale local data but a reproducible PGlite runtime incompatibility or engine bug in the current local environment.

The next escalation path would then be:

1. capture the first post-reset failure with the same telemetry
2. confirm whether it still fails at `stage: transaction_start`
3. compare Node version, filesystem location, and PGlite package version
4. consider switching local development to Postgres temporarily or investigating the exact first transaction inside `runInTransaction()` with even narrower instrumentation

## Live Run Conclusion

From the observed logs, everything is working as intended in the instrumentation itself.

The diagnostics successfully confirmed:

- DB init path is healthy
- runtime reuse behavior is working as designed
- bootstrap entry reasoning is correct
- provisioning failure stage is isolated
- the auth flow is being blocked by local PGlite runtime aborts, not by redirect logic

## Post-Reset Verification

After `pnpm db:reset:pglite`, the server-side auth flow works correctly.

### What changed after reset

The failure pattern disappeared.

The logs now show a healthy end-to-end flow:

1. `/users` initially redirects to bootstrap with `reason: provisioning_required`
2. bootstrap enters with `redirectUrl: /users`
3. provisioning completes successfully
4. bootstrap redirects to onboarding when onboarding is still incomplete
5. onboarding submission succeeds
6. later `/users` requests resolve as `ALLOWED`
7. the users API loads successfully

### Server-side evidence that the reset fixed the original problem

Healthy provisioning after reset:

- `provisioning:ensure:complete`
- `provisioning:ensure succeeded`
- `bootstrap:redirect` with `decision: redirect:/onboarding`

Healthy post-onboarding landing:

- repeated `users_guard:decision` with:
  - `decision: stay:/users`
  - `reason: already_ready`
  - `status: ALLOWED`

Healthy users page/API behavior:

- repeated `users-route` responses
- repeated browser-ingested `Users loaded`

### Updated conclusion on the original root cause

This confirms that the original blocking issue was the unhealthy local PGlite runtime/state.

Resetting the local PGlite database removed that failure condition.

So for the original problem, the practical root cause and fix are now confirmed:

- root cause: invalid local PGlite runtime/storage state in development
- fix: reset PGlite and restart the dev server

## Remaining Client-Side Clerk Exceptions

After the reset, a different issue still appears in the browser:

1. `TypeError: Invalid URL`
2. `SyntaxError: Failed to parse the rule ... ::-moz-placeholder ... color-mix(...)`

### Are these present in the server logs?

Not in the current server log evidence.

The current `logs/server.log` shows:

- healthy auth/provider resolution
- healthy provisioning completion
- healthy `/users` guard decisions
- healthy users API responses
- browser-ingested app logs such as `Fetching users list` and `Users loaded`

It does not show:

- `Invalid URL`
- `Failed to parse the rule`
- `clerk.browser.js` exceptions
- browser-ingested unhandled Clerk exceptions for this post-reset run

### What that means

These remaining exceptions are likely a separate client-side issue, not the same PGlite/database problem.

The strongest evidence for that is:

- the server-side flow is now healthy
- `/users` is allowed repeatedly
- provisioning is complete
- the users page/API is loading
- the exceptions are only visible in browser-local stack traces referencing Clerk client bundles

### Most likely classification of the remaining issue

Based on the stack traces and current logs, this looks like a Clerk/browser-side problem rather than a server/runtime/data problem.

The two errors appear to fall into separate client-only categories:

1. `Invalid URL`
   - likely inside Clerk client URL construction / redirect handling
   - stack trace includes local values `e: "/users"` and `t: "http://localhost:3000"`
   - not currently reflected in server request failures

2. CSS rule parse failure
   - likely a browser/CSS parser compatibility issue around Clerk-injected styles
   - the failing rule uses `::-moz-placeholder` and `color-mix(...)`
   - that points to a rendering/runtime stylesheet insertion issue in the client, not to auth provisioning or DB state

### Updated overall assessment

There are now two distinct issues, not one:

1. Resolved issue:
   - local PGlite runtime abort during provisioning transaction
   - fixed by resetting PGlite

2. Remaining issue:
   - client-side Clerk exception(s) visible in the browser
   - not currently captured in server logs
   - appears separate from the database/provisioning failure

### Why they may not appear in logs

The current browser log ingestion is capturing application-originated browser logs, but these Clerk `Local Exception` events may be happening inside the browser/runtime in a way that is not forwarded through the app's log-ingest route.

So absence from `logs/server.log` does not mean the exception is fake. It means the current ingestion path is not capturing this class of browser-local Clerk exception.

### Next investigation direction for the remaining problem

If we continue, the next target should be the client-side Clerk issue specifically, not the server bootstrap flow.

The right next checks would be:

1. reproduce the exception while collecting browser console output directly
2. determine whether it only happens in a specific browser engine
3. inspect the exact redirect/base-URL values Clerk receives on sign-in/sign-up pages
4. verify whether the CSS parse error is browser-specific noise or a real functional problem
