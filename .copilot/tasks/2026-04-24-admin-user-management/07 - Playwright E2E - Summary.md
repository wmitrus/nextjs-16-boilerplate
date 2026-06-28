# 07 - Playwright E2E - Summary

## Task Context

- Task ID: `2026-04-24-admin-user-management`
- Task Objective: Validate the new authenticated dashboard landing route and AuthJS session-route health after switching the default post-login fallback from `/users` to `/dashboard`.
- Current Run Scope: Focused AuthJS Playwright verification only.
- Status: COMPLETED
- Last Updated: 2026-04-25
- Related Control Artifacts: `plan.md`, `validation-report.md`, `04 - Implementation Agent - Summary.md`

## Objective

Verify in a real browser/runtime that the new default authenticated landing route is `/dashboard`, that unauthenticated dashboard access is still blocked, and that AuthJS session endpoints remain healthy.

## Scenarios Under Test

- unauthenticated visit to `/dashboard`
- AuthJS session route health (`/api/auth/session`, `/api/auth/providers`)
- authenticated AuthJS sign-in landing on `/dashboard` with test-created credentials

## Preconditions

- Playwright project: `chromium`
- Runtime: `AUTH_PROVIDER=authjs`
- Focused spec scope:
  - `e2e/authjs-dashboard-entry.spec.ts`
  - `e2e/authjs-session.spec.ts`

## Commands Run

```shell
pnpm exec playwright test e2e/authjs-dashboard-entry.spec.ts e2e/authjs-session.spec.ts --project=chromium
```

## Observed Results

- Playwright summary: `Running 5 tests using 5 workers` → `5 passed`
- Runtime was confirmed to be AuthJS, because the session-route spec passed instead of skipping.
- Unauthenticated `/dashboard` access remained protected and redirected to the AuthJS sign-in route.
- AuthJS session route health remained good: `/api/auth/session` and `/api/auth/providers` returned JSON, and `/api/auth/session` did not return HTML.
- The authenticated dashboard landing scenario provisioned a complete AuthJS user through an internal E2E-only route and then verified the final browser landing route.

## Scenario Status Mapping

- `AF-05` Returning onboarded user sign-in: `PASS`
  - authenticated browser confirmation of `/dashboard` as the final landing route now passes without external credentials
- `AF-26` Unauthenticated access to private route: `PASS`
  - `/dashboard` remained protected and redirected to sign-in
- `AF-27` Auth route access while already signed in: `DEFERRED`
  - not exercised in this focused Playwright pass
- Session-route health regression guard: `PASS`
  - `/api/auth/session` and `/api/auth/providers` remained JSON endpoints

## Evidence Collected

- Playwright terminal summary with pass/skip counts
- Browser-level protected-route redirect behavior for `/dashboard`
- Request-level AuthJS session endpoint responses via Playwright `request`

## Gaps / Deferred Checks

- This run did not cover onboarding-required or explicit-target preservation scenarios such as `/admin`.

## Recommended Next Action

- Reuse the same internal self-provisioning pattern for the remaining AuthJS admin/browser specs if those routes should also stop depending on external credentials.

---

## Follow-Up Update — Admin AuthJS Stability (2026-04-25)

### Additional Objective

Stabilize the full local container-backed AuthJS admin browser slice so it no longer requires a manual `PLAYWRIGHT_SERVER_LOG_DIR=...` override.

### Additional Focused Scope

- `e2e/admin.spec.ts`
- `e2e/admin-users.spec.ts`
- `scripts/e2e/run-scenario.mjs`

### Root Cause Summary

- The remaining failure mode was not admin authorization. Successful logged runs already proved the ABAC path was correct.
- The flaky behavior was local dev-server lifecycle instability: during longer runs, `/api/internal/e2e/authjs-user` intermittently vanished and Next returned the app not-found page.
- A manually supplied fresh server log directory changed the server behavior enough to keep the route stable.

### Fix Applied

- `scripts/e2e/run-scenario.mjs` now auto-generates a unique per-run `PLAYWRIGHT_SERVER_LOG_DIR` for local `E2E_BACKEND_MODE=container` runs when the caller does not provide one.

### Validation Command

```shell
AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container PLAYWRIGHT_REUSE_EXISTING_SERVER=false node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=1
```

### Validation Result

- Playwright summary: `23 passed (1.7m)`
- No manual `PLAYWRIGHT_SERVER_LOG_DIR` env override was needed.
- AuthJS internal provisioning remained available for the whole run.
- The local container-backed admin slice is now stable on the default command path.

---

## Follow-Up Update — E2E Isolation Finding And Runner Guidance (2026-04-25)

### Additional Objective

Determine whether the observed AuthJS E2E user in the dev DB came from the authoritative container-backed runner or from a non-scenario Playwright path, then encode the verified execution rules in repo guidance.

### Additional Evidence Reviewed

- `scripts/e2e/run-scenario.mjs`
- `scripts/e2e/load-env.mjs`
- `scripts/lib/db-guard.mjs`
- `playwright.config.ts`
- `package.json`
- env-source presence check for `.env.local` and `.env.e2e.local`

### Finding

- The authoritative container-backed runner is not the source of the dev DB contamination.
- `run-scenario.mjs` overwrites `DATABASE_URL` with `TEST_DEFAULT_URL`, and `TEST_DEFAULT_URL` is hard-coded to `postgres://postgres:postgres@127.0.0.1:5433/app_test`.
- Raw `playwright test` still starts the app against the current runtime env and does not perform scenario DB setup, so a raw/non-scenario run remains the credible source when E2E-created users appear in the dev DB.

### Guidance Applied

- `pnpm e2e:raw` now uses `--reporter=line`.
- Repo docs and AI instruction surfaces now state that auth/bootstrap/admin/container-backed E2E should use `run-scenario.mjs` or package scripts built on it.
- HTML-reporter Playwright runs are now explicitly treated as non-authoritative interactive debugging evidence.
