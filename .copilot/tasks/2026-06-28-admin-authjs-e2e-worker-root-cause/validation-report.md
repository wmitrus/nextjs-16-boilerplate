# Validation Report — Admin AuthJS E2E Worker Root Cause

## Experiments Run

```shell
AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=1
AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=8
AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=16
PLAYWRIGHT_SERVER_LOG_DIR=logs/playwright/rootcause-16 AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=16
node - <<'NODE'
const { hash, compare } = require('bcryptjs');
const rounds = 12;
const password = 'E2E-Password-123!';
async function bench(concurrency) {
  const startHash = Date.now();
  const hashes = await Promise.all(Array.from({ length: concurrency }, (_, i) => hash(password + i, rounds)));
  const hashMs = Date.now() - startHash;
  const startCompare = Date.now();
  await Promise.all(hashes.map((h, i) => compare(password + i, h)));
  const compareMs = Date.now() - startCompare;
  console.log(JSON.stringify({ concurrency, hashMs, compareMs, totalMs: hashMs + compareMs }));
}
(async () => {
  for (const concurrency of [1, 8, 16]) await bench(concurrency);
})();
NODE
node - <<'NODE'
const fs = require('fs');
const lines = fs.readFileSync('logs/playwright/rootcause-16/server.log','utf8').trim().split('\n').map((line) => JSON.parse(line));
const paths = ['/api/internal/e2e/authjs-user','/api/auth/session','/api/auth/providers','/api/auth/csrf','/api/auth/callback/credentials'];
for (const path of paths) {
  const entries = lines.filter((l) => l.path === path || l.data?.path === path);
  console.log(path, entries.length);
}
const timeouts = lines.filter((l) => l.msg === 'Rate limit provider unavailable, using local fallback');
console.log('timeouts', timeouts.length);
const callbackStart = lines.find((l) => l.path === '/api/auth/callback/credentials');
const firstSuccess = lines.find((l) => l.event === 'auth:credentials_sign_in');
if (callbackStart && firstSuccess) {
  console.log('firstCallbackToSuccessMs', firstSuccess.time - callbackStart.time);
}
const firstProvision = lines.find((l) => l.path === '/api/internal/e2e/authjs-user');
const firstProvisionTimeout = lines.find((l) => l.msg === 'Rate limit provider unavailable, using local fallback' && l.path === '/api/internal/e2e/authjs-user');
if (firstProvision && firstProvisionTimeout) {
  console.log('firstProvisionToTimeoutMs', firstProvisionTimeout.time - firstProvision.time);
}
NODE
nproc
```

## Results

| Experiment                             | Result                                                                |
| -------------------------------------- | --------------------------------------------------------------------- |
| Admin suite, `--workers=1`             | Passed: `23/23`                                                       |
| Admin suite, `--workers=8`             | Passed: `23/23`                                                       |
| Admin suite, `--workers=16`            | Failed repeatedly in `beforeEach` under the global `30s` test timeout |
| `bcryptjs` benchmark, concurrency `1`  | `373 ms` total                                                        |
| `bcryptjs` benchmark, concurrency `8`  | `2938 ms` total                                                       |
| `bcryptjs` benchmark, concurrency `16` | `4958 ms` total                                                       |
| CPU count (`nproc`)                    | `32`                                                                  |

## 16-Worker Server-Log Evidence

Dedicated log file: `logs/playwright/rootcause-16/server.log`

Observed counts during the `--workers=16` run:

| Path                                                    | Count |
| ------------------------------------------------------- | ----: |
| `/api/internal/e2e/authjs-user`                         |    36 |
| `/api/auth/session`                                     |   112 |
| `/api/auth/providers`                                   |    36 |
| `/api/auth/csrf`                                        |    36 |
| `/api/auth/callback/credentials`                        |    72 |
| `Rate limit provider unavailable, using local fallback` |   174 |

Observed timing deltas from the same log:

| Measurement                                                                           |     Value |
| ------------------------------------------------------------------------------------- | --------: |
| First `/api/auth/callback/credentials` to first successful `auth:credentials_sign_in` | `2129 ms` |
| First `/api/internal/e2e/authjs-user` to first timeout-fallback log for that path     | `3324 ms` |

## What The Code Confirms

1. Every admin test does its own provisioning and sign-in in `beforeEach`:
   - `e2e/admin.spec.ts`
   - `e2e/admin-users.spec.ts`

2. Provisioning hits `/api/internal/e2e/authjs-user`, which performs a `bcryptjs.hash(..., 12)` before the DB transaction.

3. Sign-in hits `/api/auth/callback/credentials`, whose AuthJS `authorize()` path performs `bcryptjs.compare(...)`.

4. All API routes pass through `src/proxy.ts -> withRateLimit(...)` unless explicitly bypassed.

5. `checkRateLimit()` uses Upstash when credentials are configured and waits up to `1500 ms` before falling back locally.

6. The callback route adds another explicit rate-limit layer for credentials sign-in (`signin:ip:*` and `signin:identifier:*`).

## Root-Cause Conclusion

### Hard finding

The dominant cause of the `--workers=16` failures is **stacked rate-limit timeout overhead in the auth/E2E request path**, not raw bcrypt cost alone.

### Why this is hard evidence and not a guess

- The 16-worker run logs repeated `Rate limit provider unavailable, using local fallback` events for the exact endpoints used by the admin `beforeEach` flow.
- Those fallbacks come from a coded `1500 ms` timeout in `checkRateLimit()`.
- The affected endpoints are the ones exercised by provisioning and NextAuth sign-in: `/api/internal/e2e/authjs-user`, `/api/auth/session`, `/api/auth/providers`, `/api/auth/csrf`, and `/api/auth/callback/credentials`.
- The same run shows many of those requests, not an isolated single slow request.
- The standalone `bcryptjs` benchmark at concurrency `16` totals about `4958 ms`, which is far below the `30s` failure threshold by itself, so bcrypt is a contributor but not sufficient as the primary explanation.

### Secondary contributors

- `bcryptjs.hash(..., 12)` in the provisioning route
- `bcryptjs.compare(...)` in AuthJS `authorize()`
- extra page load in `e2e/admin-users.spec.ts` `beforeEach` (`await page.goto('/admin/users')` after sign-in)
- dev-server overhead from the Playwright local Next.js runtime

## Practical Interpretation

- `--workers=1`: passes reliably because the stacked timeout overhead stays within the test timeout budget.
- `--workers=8`: currently passes in this environment after the helper changes.
- `--workers=16`: still does **not** pass reliably in this environment after the helper changes, because the auth flow fans out into many API requests that each pay distributed-rate-limit timeout cost before local fallback.

## Production Risk Assessment

### What is test-only here

- The admin E2E suite signs in a fresh user in every `beforeEach`.
- The suite also provisions a fresh user repeatedly through `/api/internal/e2e/authjs-user`.
- That provisioning route does not exist for normal end users and is not part of the production user journey.
- A single real user does not normally trigger `23` separate provisioning-plus-sign-in cycles in one burst.

### What is not test-only here

- The auth stack in production still goes through the same rate-limit plumbing:
  - proxy-level `withRateLimit(...)`
  - route-level `checkRateLimit(...)` in the credentials callback
- If Upstash is configured but slow or timing out, production requests can still pay the same `1500 ms` timeout before falling back locally.
- The same timeout path was observed not only on the E2E provisioning route, but also on real auth endpoints used by end users:
  - `/api/auth/session`
  - `/api/auth/providers`
  - `/api/auth/csrf`
  - `/api/auth/callback/credentials`

### Real production implication

This is **not** evidence that normal low traffic will immediately block the whole site.

What it _does_ prove is:

1. If the distributed rate-limit backend is unhealthy, auth-related requests can accumulate extra latency before local fallback.
2. That latency is amplified when many auth requests arrive at once from the same IP or when one page flow triggers several auth endpoints close together.
3. In production, the likely user-visible symptom is **slower login/session-related interactions**, not an instant total outage from one ordinary user.

### Risk level by traffic shape

- **Single normal user**: low risk of outright blocking. One user logging in once should not reproduce the E2E failure pattern.
- **Small normal traffic**: generally acceptable, but auth latency can degrade if Upstash is timing out because each auth request may wait for fallback.
- **Bursty shared-IP traffic** (office NAT, QA lab, synthetic monitoring, login storm after deploy, many concurrent tabs/users behind one egress IP): moderate risk of degraded auth responsiveness and possible 429 behavior due to IP-scoped fallback limiting.
- **High auth concurrency**: real risk of poor sign-in UX if the system stays dependent on repeated `1500 ms` fallback waits.

### Narrow conclusion

The `workers=16` failure is primarily a **test amplification** of a real architectural sensitivity:

- the exact failure volume is E2E-specific
- the underlying latency source (distributed rate-limit timeout before fallback on auth endpoints) is real and production-relevant
- the likely production impact is degraded auth responsiveness under unhealthy Upstash or bursty auth traffic, not that one ordinary user will casually block the site

## What Would Make 16 More Likely To Pass

These options follow directly from the proven bottleneck:

1. Disable the distributed Upstash limiter for scenario-driven E2E runs so auth/E2E endpoints use local rate limiting immediately instead of waiting `1500 ms` per request.
2. Add an explicit E2E bypass for the specific auth bootstrap endpoints used only by the scenario runner:
   - `/api/internal/e2e/authjs-user`
   - `/api/auth/session`
   - `/api/auth/providers`
   - `/api/auth/csrf`
   - possibly credentials callback handling under `E2E_ENABLED`
3. Reuse an authenticated session per file/describe instead of provisioning + signing in in every `beforeEach`.
4. Keep `--workers=8` as the default cap for this focused admin suite if the environment must preserve the current rate-limit wiring.

## Confidence Statement

The evidence is strong enough to rule out “pure bcrypt saturation” as the main root cause and to identify **distributed rate-limit timeout stacking across the auth/E2E flow** as the primary reason `16` fails while `1` and `8` pass.

## Follow-Up Implementation Validation — Session Reuse Refactor

### Code changes applied

- `e2e/authjs-auth.ts`
  - added `captureAuthjsSessionStorageState(...)` to create a logged-in AuthJS storage state from a browser context
- `e2e/admin.spec.ts`
  - replaced per-test provisioning and interactive sign-in with worker-scoped authenticated setup and per-test fresh contexts
  - serialized the file to ensure a single setup session per file under Playwright `fullyParallel`
- `e2e/admin-users.spec.ts`
  - replaced per-test provisioning and interactive sign-in with worker-scoped authenticated setup and per-test fresh contexts
  - kept per-test `/api/admin/users` route mocking
  - serialized the file to ensure a single setup session per file under Playwright `fullyParallel`

### Validation commands

```shell
AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=16
pnpm lint --fix e2e/authjs-auth.ts e2e/admin.spec.ts e2e/admin-users.spec.ts
```

### Intermediate result

The first refactor variant used worker-scoped storage-state setup but left the files fully parallel. That reduced churn from per-test to per-worker, but still timed out during fixture setup at `--workers=16` because too many workers were still trying to build authenticated state in parallel.

### Final result

| Validation                                  | Result          |
| ------------------------------------------- | --------------- |
| AuthJS admin scenario slice, `--workers=16` | Passed: `23/23` |
| ESLint on changed E2E files                 | Passed          |

## Follow-Up Hardening — Transient AuthJS Provisioning `404`

### Failure shape

- A fresh rerun intermittently failed on `POST /api/internal/e2e/authjs-user` with an HTML `404` page instead of the route handler's JSON response.
- An immediate rerun without code changes passed, which ruled out a deterministic handler bug in the provisioning logic itself.

### What the runtime evidence showed

- `.next/dev/trace` recorded repeated failed `handle-request` events for `/api/internal/e2e/authjs-user` before the route finished `compile-path` / `ensure-page` work for `/api/internal/e2e/authjs-user/route`.
- That pattern matches a Next.js dev cold-start window where the first request can land before the App Router route handler is ready, producing an app-level HTML `404` rather than the route's own JSON contract.

### Fix applied

- `e2e/authjs-auth.ts`
  - added a readiness probe in `provisionAuthjsE2EUser(...)`
  - the probe posts an intentionally invalid body to `/api/internal/e2e/authjs-user`
  - success condition is the route handler's expected JSON `400 Invalid request body`
  - transient HTML `404` responses are treated as route-compilation-not-ready and polled until the handler is live
  - any non-HTML unexpected response still fails immediately as a real error

### Why this is a root fix, not a blind retry

- The logic retries only the specific cold-start signature that comes from App Router route compilation.
- It does not hide actual provisioning failures, authorization failures, or route-contract regressions.
- Once the route is ready, the real provisioning request is sent unchanged.

### Validation after hardening

| Validation                                                                         | Result          |
| ---------------------------------------------------------------------------------- | --------------- |
| AuthJS admin scenario slice, first fresh rerun after readiness fix, `--workers=16` | Passed: `23/23` |
| AuthJS onboarding entry flow, `--workers=16`                                       | Passed: `1/1`   |
| `pnpm lint --fix e2e/authjs-auth.ts`                                               | Passed          |

### Interpretation

This confirms two things:

1. The steady-state admin suites do not need fresh login semantics.

## Follow-Up Validation — Provisioning Runtime Option 1

### Scope

Focused verification of the safe session-reuse subset inside `e2e/provisioning-runtime.spec.ts` after implementing the repository-level decision rule that only steady-state scenarios may reuse authenticated session state.

### Contract drifts uncovered during validation

1. `expectProvisioningReady()` still asserted `internalTenantId`, but the live route contract from `src/app/api/me/provisioning-status/route.ts` returns `internalOrganizationId`.
2. Completed-user redirect expectations in two scenarios still assumed `/users`, but the repository source of truth routes completed users to the default app entry `/dashboard`.

### Code corrections validated by browser evidence

- `e2e/provisioning-runtime.spec.ts`
  - aligned provisioning-status assertions to `internalOrganizationId`
  - aligned completed-user `/onboarding` redirect and hostile `redirect_url` sanitization expectations to `/dashboard`
  - kept flow-sensitive cases interactive and limited storage-state reuse to the steady-state single-mode subset

### Validation commands

```shell
pnpm lint --fix e2e/provisioning-runtime.spec.ts
node scripts/e2e/run-scenario.mjs single -- e2e/provisioning-runtime.spec.ts --project=chromium --reporter=line --workers=16 --grep "direct visit to /users after recreating incomplete state|direct visit to /users after onboarding completion stays allowed|middleware reads onboarding cookie|DB incomplete state still routes to onboarding|DB complete state remains authoritative|completed-user /users load stays stable|refresh on /users keeps a completed user|hostile redirect_url is sanitized|direct visit to /onboarding after onboarding completion redirects to /dashboard"
```

### Result

| Validation                                                              | Result        |
| ----------------------------------------------------------------------- | ------------- |
| Focused provisioning-runtime single-mode option-1 slice, `--workers=16` | Passed: `8/8` |
| ESLint on changed spec                                                  | Passed        |

### What this proves

1. The chosen option-1 refactor is safe for the targeted steady-state single-mode subset.
2. The earlier failures were stale test-contract assumptions, not evidence that shared session reuse was invalid for those scenarios.
3. The repository's durable decision rule should remain: use shared authenticated state only for already-settled steady-state scenarios, keep interactive auth/bootstrap/onboarding semantics on native flow fixtures.

## Follow-Up Clerk Stabilization And Error-Boundary Scope Correction

### Clerk helper findings

- The initial Clerk helper changes were still too optimistic about redirect timing and could save state before onboarding completion fully settled.
- The reliable signal was not transient URL checks alone, but the existing repository flow used in `e2e/provisioning-runtime.spec.ts` plus waiting for the onboarding UI to disappear after submit.

### Final Clerk helper behavior

- `e2e/clerk-auth.ts`
  - `signInE2E(...)` now mirrors the repository's validated bootstrap flow for a completed single-user path.
  - onboarding completion waits for the onboarding heading to disappear before the session is treated as reusable.

### Error-boundary scope finding

- `e2e/error-boundary.spec.ts` was not a true authenticated steady-state route test.
- `/e2e-error` is intentionally available for E2E validation without Clerk auth.
- Removing the Clerk `beforeEach(signInE2E)` restored the test to its actual contract and removed unrelated bootstrap/provisioning failures.

### Validation commands

```shell
node scripts/e2e/run-scenario.mjs single -- e2e/users.spec.ts --project=chromium --reporter=line --workers=16
node scripts/e2e/run-scenario.mjs single -- e2e/error-boundary.spec.ts --project=chromium --reporter=line --workers=16
pnpm lint --fix e2e/clerk-auth.ts e2e/error-boundary.spec.ts
```

### Validation results

| Validation                                   | Result        |
| -------------------------------------------- | ------------- |
| Clerk `e2e/users.spec.ts`, `--workers=16`    | Passed: `5/5` |
| `e2e/error-boundary.spec.ts`, `--workers=16` | Passed: `1/1` |
| ESLint on final Clerk/helper changes         | Passed        |

2. Reusing authenticated state only becomes materially effective when the test runner is also prevented from recreating that state across many parallel workers for the same file.

## Follow-Up Implementation Validation — Clerk `/users` Session Reuse

### Code changes applied

- `e2e/clerk-auth.ts`
  - added `captureClerkSessionStorageState(...)`
  - hardened capture so storage state is written only after the completed-user route settles on `/users`
- `e2e/users.spec.ts`
  - replaced per-test `signInE2E(page)` with worker-scoped Clerk storage-state setup
  - preserved fresh browser context per test
  - serialized the file so the steady-state suite pays for authenticated setup only once per file

### Validation commands

```shell
node scripts/e2e/run-scenario.mjs single -- e2e/users.spec.ts --project=chromium --reporter=line --workers=1 --grep "should emit a browser logger entry on load"
node scripts/e2e/run-scenario.mjs single -- e2e/users.spec.ts --project=chromium --reporter=line --workers=16
pnpm lint --fix e2e/clerk-auth.ts e2e/users.spec.ts
```

### Intermediate result

The first Clerk capture variant failed because the saved authenticated browser state could still reopen on onboarding. The failure context showed a signed-in user landing on `Complete your profile` instead of a settled `/users` page.

### Final result

| Validation                               | Result        |
| ---------------------------------------- | ------------- |
| Focused logger test, `--workers=1`       | Passed: `1/1` |
| Full `e2e/users.spec.ts`, `--workers=16` | Passed: `5/5` |
| ESLint on changed Clerk E2E files        | Passed        |

### Interpretation

This confirms that Clerk steady-state suites can reuse authenticated state safely, but the captured state must represent a fully settled completed-user route state rather than merely an established low-level Clerk session.
