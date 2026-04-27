# Phase 7 Validation Report — AuthJS Adapter Implementation

**Date**: 2026-04-20  
**Branch**: `fix/db-setup`  
**Status**: ✅ COMPLETE

---

## Validation Results

### TypeScript

```text
pnpm typecheck → 0 errors
```

### ESLint

```text
pnpm lint --fix → 0 errors, 0 warnings
```

### Unit Tests

```text
Test Files  147 passed (147)
     Tests  1040 passed (1040)
```

**New tests added by Phase 7:**

| Test File                             | Tests |
| ------------------------------------- | ----- |
| `AuthJsRequestIdentitySource.test.ts` | 6     |
| `AuthJsEdgeIdentitySource.test.ts`    | 5     |

**Total new Phase 7 tests**: 11

**Known flaky test** (pre-existing, unrelated to Phase 7):  
`src/shared/components/error/client-error-boundary.test.tsx > supports custom fallback render and reset` — fails intermittently due to React state cross-contamination in the full suite; passes consistently in isolation and on majority of full runs. Pre-existing before Phase 7.

---

## Files Created (Phase 7)

| File                                                                         | Purpose                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/modules/auth/infrastructure/authjs/auth.config.ts`                      | Edge-safe NextAuth options (pages, session strategy)           |
| `src/modules/auth/infrastructure/authjs/auth.ts`                             | Node-only: Credentials provider, bcrypt, JWT/session callbacks |
| `src/modules/auth/infrastructure/authjs/next-auth.d.ts`                      | Module augmentation for `Session.user.id` and `JWT.id`         |
| `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`      | Node-only identity source using `getServerSession()`           |
| `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.test.ts` | 6 unit tests                                                   |
| `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.ts`         | Edge-safe identity source using `getToken()`                   |
| `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.test.ts`    | 5 unit tests                                                   |
| `src/app/api/auth/[...nextauth]/route.ts`                                    | NextAuth catch-all route with `await connection()`             |
| `src/app/api/auth/signup/route.ts`                                           | Sign-up API: bcrypt, user creation, auth_user_identities       |
| `src/app/api/auth/active-org/route.ts`                                       | Active org cookie setter for org switcher                      |
| `src/modules/auth/ui/authjs/SessionProvider.tsx`                             | Client component wrapping next-auth/react SessionProvider      |
| `src/modules/auth/ui/authjs/AuthJsWorkspaceSwitcher.tsx`                     | DB-based org switcher with cookie-based active org             |
| `src/app/auth/signin/page.tsx`                                               | RSC sign-in page with `await connection()` and session check   |
| `src/app/auth/signin/sign-in-client.tsx`                                     | Client sign-in form using `signIn('credentials')`              |
| `src/app/auth/signup/page.tsx`                                               | RSC sign-up page with registration mode guard                  |
| `src/app/auth/signup/sign-up-client.tsx`                                     | Client sign-up form calling `/api/auth/signup`                 |
| `src/core/db/migrations/generated/0009_authjs_credentials.sql`               | `user_credentials` table migration                             |

## Files Modified (Phase 7)

| File                                                  | Change                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `src/modules/auth/infrastructure/drizzle/schema.ts`   | Added `userCredentialsTable`                                    |
| `src/modules/auth/edge.ts`                            | Removed Node-only import; authjs case returns passthrough       |
| `src/modules/auth/ui/WorkspaceSwitcher.tsx`           | Added authjs branch for `AuthJsWorkspaceSwitcher`               |
| `src/proxy.ts`                                        | `nonClerkProxy()` injects `AuthJsEdgeIdentitySource` for authjs |
| `src/app/layout.tsx`                                  | Added `SessionProvider` for authjs branch                       |
| `src/core/env.ts`                                     | Added `NEXTAUTH_SECRET` env var                                 |
| `src/core/db/migrations/generated/meta/_journal.json` | Added migration 0009 entry                                      |

---

## Architecture Decisions

1. **next-auth v4 (not v5)**: v4.24.14 installed — v5 beta was not stable enough for production use
2. **Email as external_user_id**: `auth_user_identities.external_user_id = email` for authjs provider — enables `InternalIdentityLookup.findInternalUserId('authjs', email)`
3. **Edge/Node split**: `auth.config.ts` (Edge-safe) + `auth.ts` (Node-only); `edge.ts` exports passthrough for authjs; `proxy.ts` uses `AuthJsEdgeIdentitySource` directly
4. **Caching**: `AuthJsRequestIdentitySource` caches session per-instance (per-request DI scope)
5. **bcryptjs**: Used instead of `bcrypt` (pure JS, no native bindings, works in all environments)

---

## Manual Smoke Test Instructions

To test `AUTH_PROVIDER=authjs` manually:

1. Set in `.env.local`:
   ```text
   AUTH_PROVIDER=authjs
   NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
   NEXTAUTH_URL=http://localhost:3000
   ```
2. Run database migration: `pnpm db:migrate`
3. `pnpm dev`
4. Navigate to `http://localhost:3000/auth/signup` — create an account
5. Navigate to `http://localhost:3000/auth/signin` — sign in
6. Verify user appears in `users` and `user_credentials` tables
7. Verify `auth_user_identities` entry with `provider=authjs` created

---

## Residual Risks

| Risk                               | Severity | Mitigation                                                        |
| ---------------------------------- | -------- | ----------------------------------------------------------------- |
| `client-error-boundary` flaky test | Low      | Pre-existing; unrelated to Phase 7; passes in isolation           |
| No E2E tests for authjs flow       | Medium   | Manual smoke test covers basic flow; E2E deferred to post-Phase 7 |
| Email change not tracked           | Low      | User can't change email post-signup in current implementation     |
| No email verification flow         | Medium   | `emailVerified` defaults to false; verification flow deferred     |
