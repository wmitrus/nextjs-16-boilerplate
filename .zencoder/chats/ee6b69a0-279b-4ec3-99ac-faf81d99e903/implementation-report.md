# Implementation Report — Phase 7: AuthJS Adapter

**Agent**: 04 - Implementation
**Plan step**: Implementation
**Date**: 2026-04-20 / 2026-04-21

---

## Summary

Phase 7 (AuthJS Adapter) implementation is complete. All files listed in the feature intake were created or modified. Multiple post-implementation bug fixes were applied during manual testing.

---

## Files Created

| File                                                                    | Purpose                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/modules/auth/infrastructure/authjs/auth.config.ts`                 | Edge-safe Auth.js base config (pages, session strategy)             |
| `src/modules/auth/infrastructure/authjs/auth.ts`                        | Node-only Auth.js full config with Credentials provider + callbacks |
| `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.ts`    | Edge-safe identity source for `proxy.ts`                            |
| `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts` | Node RSC identity source (replaced stub)                            |
| `src/app/api/auth/[...nextauth]/route.ts`                               | NextAuth v4 catch-all route handler (uses `NextRequest`)            |
| `src/app/api/auth/signup/route.ts`                                      | Credentials sign-up API with transaction + duplicate guard          |
| `src/app/auth/signin/page.tsx`                                          | Custom sign-in page (Suspense-wrapped, `await connection()`)        |
| `src/app/auth/signup/page.tsx`                                          | Custom sign-up page (Suspense-wrapped, `await connection()`)        |
| `src/modules/auth/ui/authjs/SessionProvider.tsx`                        | next-auth `SessionProvider` client wrapper                          |
| `src/modules/auth/ui/authjs/HeaderAuthControlsAuthjs.tsx`               | Header auth controls for authjs (useSession, signOut)               |
| `src/modules/auth/ui/authjs/AuthJsWorkspaceSwitcher.tsx`                | DB-based org switcher                                               |

## Files Modified

| File                                                           | Change                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/security/middleware/route-policy.ts`                      | Added `/auth/signin`, `/auth/signup` to `AUTH_ROUTE_PREFIXES`; `/api/auth` to `PUBLIC_ROUTE_PREFIXES` |
| `src/security/middleware/with-auth.ts`                         | Added `getSignInPath()` helper; replaced hardcoded `/sign-in` redirects                               |
| `src/modules/auth/ui/HeaderWithAuth.tsx`                       | Added `authjs` branch rendering `HeaderAuthControlsAuthjs`                                            |
| `src/app/layout.tsx`                                           | Added conditional `SessionProvider` for authjs                                                        |
| `src/core/db/migrations/generated/0009_authjs_credentials.sql` | Migration for `user_credentials` table                                                                |

## Post-Implementation Bug Fixes

1. **`auth.ts` missing `INFRASTRUCTURE` import** — added `INFRASTRUCTURE` from `@/core/contracts`
2. **`CLIENT_FETCH_ERROR` on main page** — `/api/auth` was missing from `PUBLIC_ROUTE_PREFIXES`
3. **"Sign-in UI not configured"** — route policy missing authjs prefixes; `with-auth.ts` redirected to `/sign-in` not `/auth/signin`
4. **Route handler `Request` vs `NextRequest`** — NextAuth v4 requires `NextRequest` for `nextUrl.searchParams`
5. **Suspense missing on auth pages** — `cacheComponents: true` requires async content inside `<Suspense>`
6. **`getAppContainer().resolve('db')` string key** — fixed to `INFRASTRUCTURE.DB` Symbol in `auth.ts` and `signup/route.ts`
7. **Signup duplicate check** — changed check from `userCredentialsTable` to `usersTable` (catches orphaned records); wrapped all 3 inserts in a transaction

---

## Test Files Created

| File                                                                         | Tests                                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/modules/auth/infrastructure/authjs/auth.test.ts`                        | 10 tests — authorize function (6 paths) + callbacks (3) + module load |
| `src/modules/auth/ui/authjs/SessionProvider.test.tsx`                        | 1 test — renders children                                             |
| `src/modules/auth/ui/authjs/AuthJsWorkspaceSwitcher.test.tsx`                | 5 tests — empty, render, select, dropdown, API call                   |
| `src/modules/auth/ui/authjs/HeaderAuthControlsAuthjs.test.tsx`               | 3 tests — loading/unauth/auth states                                  |
| `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.test.ts`    | 5 tests                                                               |
| `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.test.ts` | 6 tests                                                               |

---

## Final State

- Typecheck: ✅ 0 errors
- Lint: ✅ 0 errors
- Unit tests: ✅ 1059/1059 passing (151 files)
- Coverage: ✅ all metrics ≥ 75% (functions: 76.03%, branches: 75.88%)
