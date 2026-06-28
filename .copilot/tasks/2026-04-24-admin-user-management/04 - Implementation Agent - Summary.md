# 04 — Implementation Agent Summary

## Task: Admin User Management (2026-04-24-admin-user-management)

### Status: COMPLETE

## Follow-Up Update — AuthJS Redirect Alignment (2026-04-25)

- Implemented a shared AuthJS post-login redirect helper that routes successful sign-in through `/auth/bootstrap/start` while preserving the requested internal target.
- Added a dedicated protected `/dashboard` route as the boilerplate authenticated landing page.
- Changed AuthJS sign-in defaults so no-intent logins fall back to `/dashboard` through bootstrap rather than `/`.
- Changed AuthJS sign-up follow-up links to send users to the sign-in page with the bootstrap callback already wired.
- Updated bootstrap and onboarding defaults so missing or unsafe `redirect_url` values resolve to `/dashboard` instead of `/users`, while explicit internal targets such as `/users` and `/admin` remain preserved.
- Updated the admin fallback guard so bootstrap- or onboarding-required access preserves `/admin` intent instead of dropping to a generic bootstrap start.
- Focused validation: 8 unit files / 36 tests passed under `vitest.unit.config.ts`.

## Follow-Up Update — Migration Metadata Reconciliation (2026-04-25)

- Investigated post-implementation `pnpm db:generate` failures that attempted to regenerate migrations `0008` through `0012`.
- Implemented reconciliation migration `0013_reconcile_snapshot` with empty SQL.
- Added `meta/0013_snapshot.json` using a generator-produced current-schema snapshot, linked back to `0007_snapshot.json`.
- Updated `meta/_journal.json` so `0013` becomes the latest baseline for future generate runs.
- Focused validation: `pnpm db:generate` now returns `No schema changes, nothing to migrate`.

## Follow-Up Update — AuthJS Admin E2E Stability (2026-04-25)

- Investigated the remaining local-only flake where longer container-backed admin Playwright runs started receiving an app `404` page from `/api/internal/e2e/authjs-user`.
- Confirmed the functional admin path was already correct: single-tenant org mapping, admin ABAC, and selector fixes were all green in focused runs.
- Narrowed the last issue to local dev-server lifecycle reuse. Manually supplying a fresh `PLAYWRIGHT_SERVER_LOG_DIR` made the full admin slice stable.
- Updated `scripts/e2e/run-scenario.mjs` so local container runs automatically receive a unique per-run `PLAYWRIGHT_SERVER_LOG_DIR` when the caller does not provide one.
- This keeps the known-good behavior without requiring manual shell env overrides.
- Focused validation: `AUTH_PROVIDER=authjs E2E_BACKEND_MODE=container PLAYWRIGHT_REUSE_EXISTING_SERVER=false node scripts/e2e/run-scenario.mjs single -- e2e/admin.spec.ts e2e/admin-users.spec.ts --project=chromium --reporter=line --workers=1` now passes with `23 passed`.

---

## Objective

Implement a protected admin panel at `/admin/users` that allows platform administrators to list, search, update display names, and soft-deactivate registered users.

---

## Phases Executed

### Phase 1 — Schema & Contract ✅

- Added `deactivated_at TIMESTAMPTZ` column to `users` table schema (`schema.ts`)
- Wrote migration `0012_users_deactivated_at.sql` and updated `_journal.json`
- Extended `User` interface with `deactivatedAt?: Date` and `createdAt?: Date`
- Extended `UserRepository` contract with `listAll()` and `deactivate()`

### Phase 2 — Infrastructure ✅

- `DrizzleUserRepository`: implemented `listAll()` (ilike search, pagination, parallel count) and `deactivate()`
- Updated `findById()` to return `deactivatedAt` and `createdAt`

### Phase 3 — Admin API Routes ✅

- `src/app/api/admin/users/route.ts` — `GET /api/admin/users` with pagination clamping (limit silently capped at 100), search, and env+ABAC admin check
- `src/app/api/admin/users/[id]/route.ts` — `GET` + `PATCH` with dual dispatch (deactivate vs displayName update), IDOR protection (404 on not found), audit logging

### Phase 4 — Admin UI ✅

- `src/app/admin/users/page.tsx` — RSC page with `getServerRequestLogContext()` for dynamic opt-in
- `src/app/admin/users/UsersClient.tsx` — `'use client'` component: debounced search, pagination, user table, deactivate button, inline display name edit
- `src/app/admin/page.tsx` — Users card status changed from `coming-soon` → `active`

### Phase 5 — Stale Stub Alignment — DEFERRED ✅

- Decision: `src/features/user-management/` stubs left unchanged (admin feature is self-contained; changing the stub type would cascade breaks through the existing `UserList` component and its tests)

### Phase 6 — Tests ✅

- `DrizzleUserRepository.db.test.ts` — extended with `listAll()` and `deactivate()` integration cases
- `src/security/core/node-provisioning-access.test.ts` — updated mock to include `listAll` and `deactivate` (required after UserRepository contract extension)
- `src/app/api/admin/users/route.test.ts` — 401/403/200/pagination-clamp/search unit tests
- `src/app/api/admin/users/[id]/route.test.ts` — GET and PATCH (displayName + deactivate) unit tests

### Phase 7 — E2E ✅

- `e2e/admin-users.spec.ts` — unauthenticated redirect test + conditional authenticated test with API route mocking

### Phase 8 — Documentation ✅

- `docs/features/35 - Admin User Management.md` — full feature doc

---

## Key Bugs Found and Fixed During Implementation

1. **Wrong `access.subject.*` fields** — Routes initially used `access.subject.email` and `access.subject.id` (which don't exist on `NodeProvisioningAccessAllowed`). Correct fields are `access.identity.email` and `access.user.id`. Fixed with targeted sed replacement across both route files.
2. **Missing `listAll`/`deactivate` in test mocks** — `node-provisioning-access.test.ts` mock needed these methods after UserRepository contract extended. Fixed.
3. **`USER_REPOSITORY` token namespace** — Token lives in `AUTH` (not `INFRASTRUCTURE`) contract namespace. Discovered during route implementation.
4. **Clamping vs rejection for limit** — Route initially had `.max(100)` (rejects), changed to `.transform((v) => Math.min(v, 100))` (clamps silently) to match stated constraint.
5. **SEC-15 object injection** — `editValues` in `UsersClient.tsx` converted from `{ [id: string]: string }` to `Map<string, string>` to eliminate `security/detect-object-injection` lint warning.

---

## Validation Results

- `pnpm typecheck` — ✅ PASS
- `pnpm lint --fix` — ✅ PASS (0 errors, 0 warnings after Map fix)
- `pnpm test` — ✅ 159 files, 1134 tests PASS
- Coverage thresholds (functions 73.93%, branches 71.95%) — PRE-EXISTING deficit, confirmed below baseline before this task

---

## Deferred / Residual

- `docs/features/36 - Admin Direct Invitations.md` — doc backfill for the invitations feature (separate task, not in scope)
- Clerk session revocation on deactivation — intentionally not implemented; soft deactivation only
- E2E spec for admin with admin credentials requires `E2E_CLERK_USER_USERNAME` + admin email in `ADMIN_USER_EMAILS`; skipped when credentials are not set

---

## Update Log

### 2026-04-25 — Migration Metadata Reconciliation

- Root cause confirmed as missing Drizzle snapshots for manual SQL migrations `0008` through `0012`, not a multi-database cache conflict.
- Added reconciliation migration `0013_reconcile_snapshot` and current-schema snapshot baseline.
- Validation refreshed with a direct `pnpm db:generate` run.

### 2026-04-25 — AuthJS Redirect Alignment

- Added `src/app/auth/post-auth-redirect.ts` to centralize bootstrap-first redirect generation for AuthJS pages.
- Added `src/app/dashboard/*` to provide a stable signed-in landing route for the boilerplate.
- Updated `src/app/auth/signin/*` to preserve `callbackUrl` or `redirect_url` intent through bootstrap and fall back to `/dashboard` when none exists.
- Updated `src/app/auth/signup/*` links and post-sign-up sign-in handoff to use the same bootstrap-first default.
- Updated `src/app/onboarding/*` and `src/app/auth/bootstrap/start/route.ts` so default-ready redirects also resolve to `/dashboard`.
- Updated `src/app/admin/layout.tsx` to preserve `/admin` during bootstrap/onboarding fallback.
- Added focused unit coverage for the new helper, dashboard guard, and redirect consumers.

### 2026-04-25 — AuthJS E2E Self-Provisioning

- Added `src/app/api/internal/e2e/authjs-user/route.ts` as an E2E-only internal provisioning hook for AuthJS browser tests.
- Updated `e2e/authjs-auth.ts` so AuthJS browser tests can provision a complete credentials user through the internal API and then sign in with explicit credentials.
- Updated `e2e/authjs-dashboard-entry.spec.ts` to create its own AuthJS user instead of depending on `E2E_AUTHJS_USER_EMAIL` / `E2E_AUTHJS_USER_PASSWORD`.
- Kept the change scoped to the dashboard-entry flow; broader AuthJS admin Playwright specs still use the legacy env-credential pattern and remain follow-up work.
- Focused validation: `pnpm e2e:raw -- e2e/authjs-dashboard-entry.spec.ts e2e/authjs-session.spec.ts --project=chromium` passed with `5 passed`.

### 2026-04-25 — AuthJS Admin Browser Stability

- Confirmed admin authorization was no longer the blocker after the single-tenant organization fix; `admin_guard:access_allowed_abac` was observed in successful runs.
- Fixed the remaining brittle admin selectors in `e2e/admin.spec.ts` and `e2e/admin-users.spec.ts`.
- Hardened the local scenario runner by generating a unique server-log directory per run in `scripts/e2e/run-scenario.mjs`.
- Final focused validation: the default local container-backed admin slice now passes end-to-end without manually exporting `PLAYWRIGHT_SERVER_LOG_DIR`.

### 2026-04-25 — Dashboard Polish And E2E Rule Encoding

- Fixed the shared header so homepage section links use in-page anchors on `/` and absolute homepage anchors from nested routes.
- Added the missing `id="pricing"` target to the CTA section.
- Refined `DashboardToolsTable` by splitting footprint and status badge treatments and lowering the table shell/status badge corner radius.
- Added focused unit coverage for the header anchor contract and the dashboard tool inventory presentation contract.
- Hardened `package.json` so `pnpm e2e:raw` now uses `playwright test --reporter=line`.
- Updated repo docs and AI instruction surfaces so future runs treat `run-scenario.mjs` as authoritative for auth/bootstrap/admin E2E, treat `E2E_BACKEND_MODE=container` as `127.0.0.1:5433/app_test`, and avoid HTML-reporter Playwright runs during interactive debugging.
- Repository-evidence conclusion on the observed dev DB E2E user: the container-backed scenario runner is not the source; raw/non-scenario Playwright execution remains the credible cause because it bypasses scenario DB setup and uses the current app runtime env.
- Focused validation: `pnpm vitest run src/shared/components/Header.test.tsx src/app/dashboard/DashboardToolsTable.test.tsx --config vitest.unit.config.ts`; `pnpm vitest run src/testing/integration/page.integration.test.tsx --config vitest.integration.config.ts`; package script check via `rg '"e2e:raw"' package.json`; env-source check via `awk -F= '/^(E2E_BACKEND_MODE|DATABASE_URL)=/{print FILENAME":"$1"=[REDACTED]"}' .env.local .env.e2e.local scripts/e2e/env/base.env scripts/e2e/env/single.env 2>/dev/null`.
- Phase-close validation was later tightened further: the local React Compiler / TanStack Table lint warning on `DashboardToolsTable.tsx` was resolved by documenting a file-local non-memoization contract around `useReactTable()`; focused lint and the dashboard table unit test both passed afterward.
