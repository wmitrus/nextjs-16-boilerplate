# Task Plan: Admin Access Regression — CLIENT_FETCH_ERROR Root Cause Investigation

**Leantime Task**: #71  
**Created**: 2026-04-25  
**Status**: Complete

## Objective

1. Find the real root cause of `/admin` redirecting to home page after admin user management implementation.
2. Fix the actual cause (not a surface symptom).
3. Design and implement professional E2E and integration tests so this class of regression cannot recur.
4. Document the anti-pattern permanently in AGENTS.md and IMPLEMENTATION_ANTI_PATTERNS.md.

## Real Root Cause (Session 5 — Confirmed)

**Module-level `NextAuth(authOptions)` call in shared `auth.ts`** causes the compiled `[...nextauth]` route handler to fail during module initialization in Next.js 16 App Router. Turbopack's filesystem cache (`turbopackFileSystemCacheForDev: true`) does NOT automatically invalidate route handler cache when a transitive dependency (`auth.ts`) changes — only touching the direct route file triggers recompilation.

Observable symptom chain:

1. `/api/auth/session` returns `404 HTML` instead of `200 application/json`
2. `CLIENT_FETCH_ERROR` fires in browser console
3. Client-side session shows `null` / unauthenticated
4. Admin guard sees `UNAUTHENTICATED` and redirects to `/auth/signin` (or to `/`)

**Session 3 fix** (RC1 + RC2) had fixed it by clearing `.next` AND removing the module-level handler from `auth.ts`. But the documentation was NOT written, causing the AI to repeat the same diagnosis path in session 5.

## Specialist Sequence

| Step | Specialist                                                  | Status      |
| ---- | ----------------------------------------------------------- | ----------- |
| 1    | Debug Investigation (06)                                    | ✅ Complete |
| 2    | Implementation (04) — fix auth.ts stale cache + add tests   | ✅ Complete |
| 3    | Playwright E2E (07) — E2E test design + implementation      | ✅ Complete |
| 4    | Documentation — AGENTS.md + IMPLEMENTATION_ANTI_PATTERNS.md | ✅ Complete |
| 5    | Validation — typecheck + lint + tests                       | ✅ Complete |

## Checklist

- [x] Root cause confirmed: module-level NextAuth() + Turbopack cache stale
- [x] Fix applied: `touch src/app/api/auth/[...nextauth]/route.ts` → session returns 200 JSON
- [x] auth.ts fix is present in the repo without module-level handler export
- [x] AdminLayoutGuard: DB errors throw instead of silently redirecting to /
- [x] Unit regression test: `auth.test.ts` verifies no `handler`/`GET`/`POST` exports from auth.ts
- [x] E2E session health test: `e2e/authjs-session.spec.ts` — verifies session returns JSON
- [x] E2E admin spec: `e2e/admin.spec.ts` — fixed to use AuthJS auth (not Clerk)
- [x] E2E admin users: `e2e/admin-users.spec.ts` — fixed to use AuthJS auth (not Clerk)
- [x] E2E helper: `e2e/authjs-auth.ts` — new AuthJS sign-in helper for E2E
- [x] Anti-pattern documented: `docs/ai/general/IMPLEMENTATION_ANTI_PATTERNS.md` section 2.4
- [x] Pattern documented in AGENTS.md: "AuthJS — Module-Level NextAuth Call Banned In Shared Modules"
- [x] typecheck passes
- [x] lint passes (0 errors, 0 warnings)
- [x] All tests pass: 1136 unit (was 1135)

## Current Outcome

- The regression root cause was identified and fixed at the actual failure point: module-level `NextAuth(authOptions)` in shared `auth.ts`.
- The repo now contains the permanent guardrails for this class of failure: the route calls `NextAuth(req, ctx, authOptions)` at request time, the regression test exists, AuthJS admin/browser specs exist, and the anti-pattern is documented in both `AGENTS.md` and `IMPLEMENTATION_ANTI_PATTERNS.md`.
- Later repo state also confirms the supporting follow-up work landed: `DrizzleUserRepository.db.test.ts` covers `deactivatedAt`, admin E2E specs exist, and `pnpm db:pglite:migrate` is documented in multiple repo guides.

## Follow-Up Notes (Non-Blocking)

- [ ] Consider documenting optional `E2E_AUTHJS_USER_EMAIL` / `E2E_AUTHJS_USER_PASSWORD` usage in env examples if the team still wants shared static AuthJS credentials for some local E2E runs.
- [ ] Migration "local cache" confusion remains a separate investigation topic (drizzle journal vs DB tracking), not a blocker for this regression fix.
- [ ] Pre-existing coverage threshold deficit remains unrelated to this task.
