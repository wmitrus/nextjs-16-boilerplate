# Phase 7 Completion Handoff — AuthJS Adapter Implementation

**Date**: 2026-04-20  
**Branch**: `fix/db-setup`  
**Phase Status**: ✅ COMPLETE

---

## Phase 7 Summary

Phase 7 implemented the complete AuthJS (next-auth v4) adapter for the auth foundation, enabling `AUTH_PROVIDER=authjs` as a drop-in alternative to `AUTH_PROVIDER=clerk`.

All 11 steps (7.1–7.11) are complete. Validation: 1040 unit tests passing, 0 typecheck errors, 0 lint errors.

---

## What Was Built

### New Auth Provider: AuthJS (next-auth v4)

**Package installed**: `next-auth@4.24.14`, `bcryptjs@3.0.3`, `@types/bcryptjs`

**Identity Sources**:

- `AuthJsEdgeIdentitySource` — Edge-runtime safe, uses `getToken()` from `next-auth/jwt` — injected in `proxy.ts`
- `AuthJsRequestIdentitySource` — Node-only, uses `getServerSession(authOptions)` — injected by DI container in server components

**Auth Configuration**:

- `auth.config.ts` — Edge-safe options (session strategy: jwt, custom pages)
- `auth.ts` — Node-only Credentials provider with bcrypt password verification + JWT/session callbacks

**Database Schema Addition**: `user_credentials` table (migration 0009):

- `user_id` → FK to `users.id`
- `email` (unique) → used as `external_user_id` in `auth_user_identities`
- `hashed_password` → bcrypt hash
- `email_verified` (boolean, default false)

**API Routes**:

- `/api/auth/[...nextauth]` — NextAuth catch-all handler (with `await connection()`)
- `/api/auth/signup` — POST: creates user + credentials + identity in single transaction
- `/api/auth/active-org` — POST: sets `active_org_id` cookie for workspace switcher

**UI**:

- `/auth/signin` — RSC page + client form (session check → redirect if already signed in)
- `/auth/signup` — RSC page + client form (registration mode guard)
- `SessionProvider` — Client component wrapping `next-auth/react`
- `AuthJsWorkspaceSwitcher` — DB-based org switcher with `active_org_id` cookie

---

## Key Architecture Points for Future Phases

### Email = external_user_id

For the authjs provider: `auth_user_identities.external_user_id = user email`.  
`InternalIdentityLookup.findInternalUserId('authjs', email)` resolves to internal UUID.

### Edge vs Node Split

`src/modules/auth/edge.ts` exports a **passthrough** for authjs (not the Node-only identity source).  
`proxy.ts` creates `AuthJsEdgeIdentitySource(request)` and passes it to `createRequestContainer()` directly — bypassing `createEdgeRequestContainer()` to avoid the Node-only import.

### No `export const dynamic/runtime`

All route handlers use `await connection()` (not route segment configs — banned by `cacheComponents: true`).

### DI Wiring

`auth.ts` also exports `authOptions` which is registered in the DI container via the existing auth module factory pattern.

---

## State Before Phase 8

- Tests: **1040 unit tests passing** (147 test files)
- TypeScript: **0 errors**
- ESLint: **0 errors**
- Branch: `fix/db-setup`
- Known flaky: `client-error-boundary.test.tsx > supports custom fallback render and reset` — pre-existing, unrelated

---

## Manual Smoke Test Required

Before closing Phase 7 in Leantime, the user should perform manual smoke test:

1. Set `AUTH_PROVIDER=authjs`, `NEXTAUTH_SECRET=<generated>`, `NEXTAUTH_URL=http://localhost:3000` in `.env.local`
2. Run `pnpm db:migrate`
3. `pnpm dev` → test signup at `/auth/signup`, signin at `/auth/signin`
4. Verify DB records in `users`, `user_credentials`, `auth_user_identities`

---

## Phase 8 Prerequisites

Phase 8 (Variant C Sample App — EduGroup → Schools) can begin immediately after smoke test confirmation. No additional Phase 7 work is needed.
