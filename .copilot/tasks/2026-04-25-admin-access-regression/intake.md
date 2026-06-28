# Intake: Admin Access Regression

**Leantime Task**: #71  
**Date**: 2026-04-25

## Objective

The `/admin` route was broken by the admin user management feature (task #70). Users listed in `ADMIN_USER_EMAILS` were silently redirected to `/` instead of getting access. The user identified the regression and requested (a) root-cause investigation, (b) professional E2E + integration test design, and (c) a fix that prevents this class of regression from recurring.

## Problem Statement

After the user management implementation added `deactivatedAt` to `DrizzleUserRepository.findById()`, the local PGlite DB did not have the `deactivated_at` column (migration not applied). The `resolveNodeProvisioningAccess()` call inside `AdminLayoutGuard` throws a SQL error. That error is caught silently and redirects to `/`. No test asserted that admin access still worked after schema changes.

## Root Cause (Confirmed)

| Layer              | Finding                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Schema**         | `DrizzleUserRepository.findById()` selects `usersTable.deactivatedAt` — added in task #70                                             |
| **Migration**      | `0012_users_deactivated_at.sql` was not applied to the local PGlite DB                                                                |
| **Error handling** | `AdminLayoutGuard` try/catch catches ALL exceptions (including DB errors) and redirects to `/` — indistinguishable from access-denied |
| **Test gap**       | No E2E test asserted admin access works for ADMIN_USER_EMAILS users                                                                   |
| **Test gap**       | No integration test checked that findById still works after schema extensions                                                         |

## Immediate Fix

`pnpm db:pglite:migrate` — APPLIED ✓

## Structural Fixes Required

1. **AdminLayoutGuard error handling**: distinguish DB/infrastructure errors from access-denied. DB errors should produce a clear server error response or a `/error` page, not silently act as access-denied.
2. **E2E tests**: add admin access E2E coverage (authenticated admin, non-admin redirect).
3. **Integration tests**: extend `DrizzleUserRepository.db.test.ts` to confirm `findById` returns all fields correctly including `deactivatedAt`.

## Acceptance Criteria

- [x] Running `pnpm db:pglite:migrate` is documented as required after schema migrations
- [x] `AdminLayoutGuard` no longer silently collapses DB/infrastructure failures into access-denied redirects; DB failures now surface distinctly enough for debugging
- [x] `DrizzleUserRepository.db.test.ts` covers `findById` / related repository behavior for `deactivatedAt`
- [x] E2E specs for `/admin` and `/admin/users` verify unauthenticated redirect behavior and authenticated admin page loads without the error boundary
- [x] `pnpm typecheck` passes
- [x] `pnpm lint --fix` passes
- [x] All 1134+ tests pass

## Current Assessment

- The original regression statement mixed two issues from the same area: the local PGlite migration miss and the later AuthJS `CLIENT_FETCH_ERROR` recurrence.
- The final durable root cause for the recurring admin-access breakage was the module-level `NextAuth(authOptions)` pattern in shared `auth.ts`, and that fix is now present in the repository.
- The remaining historical notes about env examples and migration-tracking confusion do not block the task objective and should be treated as separate follow-up concerns.

## Referenced Files

- `src/app/admin/layout.tsx` — AdminLayoutGuard
- `src/security/core/node-provisioning-runtime.ts`
- `src/security/core/node-provisioning-access.ts`
- `src/security/core/platform-admin.ts`
- `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts`
- `src/modules/user/infrastructure/drizzle/schema.ts`
- `src/core/db/migrations/generated/0012_users_deactivated_at.sql`
- `e2e/admin-users.spec.ts` (existing, expand)

## Readiness Checklist

- [x] Root cause confirmed
- [x] Immediate migration fix applied
- [x] Code read for all affected files
- [x] E2E pattern understood (see `e2e/users.spec.ts`)
- [x] Integration test pattern understood (see Pattern B in AGENTS.md)
