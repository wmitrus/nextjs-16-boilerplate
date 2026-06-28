# Admin User Management — Task Plan

**Task ID**: `2026-04-24-admin-user-management`
**Created**: 2026-04-24
**Status**: COMPLETE

## Follow-Up Resolution (2026-04-25)

- Reopened briefly after implementation to investigate Drizzle migration generation failures.
- Root cause was not a per-database local cache conflict. The shared migration folder was fine; the broken state was the metadata lineage in `src/core/db/migrations/generated/meta/`.
- Journal entries `0008` through `0012` existed, but the snapshot chain stopped at `0007`, so `pnpm db:generate` diffed from stale schema history and tried to regenerate already-applied changes.
- Resolved by adding a reconciliation migration entry `0013_reconcile_snapshot` with empty SQL plus a real current-schema snapshot baseline.

## Follow-Up Resolution (2026-04-25) — AuthJS Post-Login Redirect Alignment

- Reopened again after the architecture review to align AuthJS post-login behavior with the repository bootstrap-first auth-flow contract.
- Implemented callback preservation so successful AuthJS sign-in routes to the previously requested internal URL through `/auth/bootstrap/start` instead of defaulting to `/`.
- Added a dedicated protected `/dashboard` route and made it the boilerplate default authenticated entry route when no prior internal URL exists.
- Preserved `/admin` intent through bootstrap when admin access is requested before provisioning or onboarding is complete.
- Added focused unit coverage for the redirect helper, AuthJS sign-in, AuthJS sign-up links, and admin bootstrap fallback behavior.
- Added focused Playwright coverage for the new dashboard entry route and AuthJS session-route health.

## Follow-Up Resolution (2026-04-25) — AuthJS Admin E2E Stability

- Reopened once more after admin AuthJS browser tests still flaked in local container mode with app-level `404` responses on `/api/internal/e2e/authjs-user`.
- Root cause was not admin authorization anymore. ABAC access was already confirmed green in focused and logged runs.
- The remaining instability came from local dev-server state reuse during longer scenario runs; manually forcing a fresh server-log directory per run kept the internal provisioning route stable.
- Resolved by changing `scripts/e2e/run-scenario.mjs` to auto-assign a unique `PLAYWRIGHT_SERVER_LOG_DIR` for local `E2E_BACKEND_MODE=container` runs when the caller did not provide one.
- Final validation: the full focused admin AuthJS slice now passes without any manual `PLAYWRIGHT_SERVER_LOG_DIR` override.

## Follow-Up Resolution (2026-04-25) — Dashboard Polish And E2E Execution Rules

- Reopened again to polish the new dashboard surface and encode the E2E execution rules that repeatedly caused confusion during validation.
- Fixed global header navigation so `Features`, `Use Cases`, and `Pricing` resolve correctly from non-home routes by pointing back to homepage anchors when needed.
- Added the missing homepage `pricing` anchor target on the CTA section.
- Refined the dashboard tool inventory presentation with separate footprint and status badge treatments plus a subtler table shell radius.
- Verified from code and env-source inspection that `E2E_BACKEND_MODE=container` still maps to the isolated test DB `127.0.0.1:5433/app_test` through `scripts/e2e/run-scenario.mjs`; the observed AuthJS E2E user in the dev DB is therefore attributed to a raw/non-scenario Playwright path rather than the container-backed runner.
- Codified the durable rule set in repo docs and agent instructions: prefer `run-scenario.mjs`, treat raw `playwright test` as non-authoritative for auth/bootstrap/admin investigation, and require `--reporter=line` for interactive E2E runs.

---

## Objective

Implement the admin user management section at `/admin/users`. The card currently shows `coming-soon`. This task delivers full admin user listing, viewing, and action capabilities (suspend/deactivate/update profile fields) behind proper authentication and ABAC authorization.

---

## Context

- Admin page: `src/app/admin/page.tsx` — Users card is `coming-soon` at `/admin/users`
- Existing module: `src/modules/user/` — `DrizzleUserRepository` (findById, updateOnboardingStatus, updateProfile)
- Existing feature stub: `src/features/user-management/` — old stubs, intentionally left unchanged (Phase 5 deferred)
- Existing API: `GET /api/users` — returns hardcoded sample data, NOT DB-backed (explicitly documented as a probe)
- Existing admin pattern: `src/app/api/admin/invitations/route.ts` — reference implementation
- Auth: `withNodeProvisioning` + `isEnvBasedPlatformAdmin` OR ABAC check
- DB schema: `usersTable` — id, email, onboardingComplete, displayName, locale, timezone, createdAt, updatedAt (+ `deactivated_at` added in this task)

## Doc Debt Items

- `docs/features/36 - Admin Direct Invitations.md` — backfill from previous session (deferred, separate task)

---

## Specialist Sequence

| #   | Agent                     | Purpose                                                          | Status  |
| --- | ------------------------- | ---------------------------------------------------------------- | ------- |
| 0   | Leantime Integration (10) | Open task in Leantime                                            | ✅ Done |
| 1   | Architecture Guard (01)   | Boundaries, module ownership, feature vs module split            | ✅ Done |
| 2   | Security & Auth (02)      | Auth check patterns, ABAC for admin actions, PII exposure        | ✅ Done |
| 3   | Next.js Runtime (03)      | RSC vs client placement, route handler patterns, caching         | ✅ Done |
| 4   | Validation Strategy (05)  | Test scope for admin user list, actions, API                     | ✅ Done |
| 5   | Debug Investigation (06)  | Trace Drizzle migration metadata failure after implementation    | ✅ Done |
| 6   | Implementation (04)       | Build all components, routes, API, and repair migration metadata | ✅ Done |
| 7   | Validation                | Run feature validation plus focused migration-generation check   | ✅ Done |
| 8   | Leantime Integration (10) | Close task                                                       | ✅ Done |

---

## Checklist

- [x] Leantime task opened (#70)
- [x] Architecture Guard summary produced
- [x] Security & Auth summary produced
- [x] Next.js Runtime summary produced
- [x] Validation Strategy summary produced
- [x] `constraints.md` consolidated
- [x] `implementation-plan.md` created
- [x] Implementation complete (Phases 1–8)
- [x] `pnpm typecheck` passes
- [x] `pnpm lint --fix` passes
- [x] Unit tests pass (159 files, 1134 tests)
- [x] `validation-report.md` produced
- [x] `04 - Implementation Agent - Summary.md` produced
- [x] `06 - Debug Investigation - Summary.md` produced
- [x] `docs/features/35 - Admin User Management.md` written
- [x] Drizzle reconciliation migration `0013_reconcile_snapshot` added
- [x] `pnpm db:generate` returns no schema changes after reconciliation
- [x] AuthJS default post-login redirect aligned to bootstrap-first flow
- [x] Protected `/dashboard` route added as the default authenticated app entry
- [x] Explicit internal targets preserved through bootstrap (`/admin`, other private routes)
- [x] Focused redirect unit tests pass
- [x] Focused AuthJS Playwright pass completed
- [x] Full admin AuthJS container-backed Playwright slice passes without manual log-dir override
- [x] Header homepage-anchor navigation works from nested routes
- [x] Dashboard tool inventory table/status styling refined and covered by focused unit tests
- [x] E2E DB isolation finding documented: container mode stays on `5433/app_test`; dev DB contamination traced to non-scenario execution path
- [x] Repository docs and AI instruction surfaces updated with Playwright runner and reporter rules
- [x] Leantime task #70 closed (status patched to Done; time.log RPC returned server error — skipped)

---

## Deliverables

### New Files ✅

- `src/app/admin/users/page.tsx`
- `src/app/admin/users/UsersClient.tsx`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/users/[id]/route.ts`
- `src/app/api/admin/users/route.test.ts`
- `src/app/api/admin/users/[id]/route.test.ts`
- `e2e/admin-users.spec.ts`
- `src/core/db/migrations/generated/0012_users_deactivated_at.sql`
- `src/core/db/migrations/generated/0013_reconcile_snapshot.sql`
- `src/core/db/migrations/generated/meta/0013_snapshot.json`

### Modified Files ✅

- `src/app/admin/page.tsx` — Users card: `coming-soon` → `active`
- `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`
- `src/modules/user/infrastructure/drizzle/schema.ts`
- `src/core/contracts/user.ts`
- `src/core/db/migrations/generated/_journal.json`
- `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.db.test.ts`
- `src/security/core/node-provisioning-access.test.ts`

### Docs ✅

- `docs/features/35 - Admin User Management.md`
