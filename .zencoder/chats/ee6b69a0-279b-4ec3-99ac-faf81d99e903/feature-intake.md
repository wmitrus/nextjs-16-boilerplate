# Feature Intake — Phase 7: AuthJS Adapter Implementation

**Plan file**: `.zencoder/chats/ee6b69a0-279b-4ec3-99ac-faf81d99e903/plan.md`
**Workflow step**: Feature Intake
**Task**: Auth Foundation Redesign — Phase 7
**Branch**: `fix/db-setup`
**Date**: 2026-04-20

---

## Feature Description

Implement a fully functional Auth.js (next-auth v5) adapter as the second concrete auth provider in the boilerplate. When `AUTH_PROVIDER=authjs` is set in the environment, the system must authenticate users via Auth.js sessions (stored in DB or JWT), provision them through the shared `ProvisioningService`, and enforce all the same security guards as the Clerk provider.

**Steps in scope**: 7.1 through 7.11 as listed in the master plan.

---

## Expected User-Visible Behavior

1. Developer sets `AUTH_PROVIDER=authjs` in `.env.local`.
2. The application signs users in via a custom `/auth/signin` page (not Clerk UI).
3. Users sign up via a custom `/auth/signup` page.
4. Auth.js sessions persist (JWT or DB adapter) across requests.
5. `src/proxy.ts` correctly gates protected routes using Auth.js session state instead of Clerk session state.
6. The organization switcher shows DB-sourced organizations (not Clerk orgs).
7. `pnpm typecheck` passes; `pnpm test` passes with 1031+ tests.
8. Switching back to `AUTH_PROVIDER=clerk` restores Clerk behavior with zero code changes.

---

## Affected Modules and Files

### Infrastructure (new files)

- `src/modules/auth/infrastructure/authjs/auth.config.ts` — Edge-safe Auth.js config
- `src/modules/auth/infrastructure/authjs/auth.ts` — Node-only Auth.js full config
- `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts` — Replace stub with real implementation
- `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.ts` — Edge-safe identity source for proxy.ts

### Route Handlers (new)

- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js catch-all route handler

### UI Components (new)

- `src/modules/auth/ui/authjs/SessionProvider.tsx` — next-auth SessionProvider wrapper
- `src/app/auth/signin/page.tsx` — Custom sign-in page for authjs
- `src/app/auth/signup/page.tsx` — Custom sign-up page for authjs
- `src/modules/auth/ui/authjs/AuthJsWorkspaceSwitcher.tsx` — DB-based org switcher

### Modified Files

- `src/proxy.ts` — Wire AuthJsEdgeIdentitySource for `AUTH_PROVIDER=authjs`
- `src/app/layout.tsx` — Add SessionProvider for authjs (conditional)
- `src/modules/auth/index.ts` — Wire AuthJsRequestIdentitySource (already imported, stub replaced)
- `src/modules/auth/ui/WorkspaceSwitcher.tsx` — Add authjs branch

### Test Updates

- `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.test.ts` — Replace stub test with real implementation tests

---

## Assumptions and Unknowns

| ID  | Item                                                                                               | Status                                                       |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A1  | next-auth v5 (`next-auth@5.x`) is the target, not v4                                               | **Assumed** — must verify correct package name after install |
| A2  | Credentials provider will be the primary sign-in method for Phase 7                                | **Assumed** — OAuth providers are out of scope               |
| A3  | JWT session strategy (not DB sessions) for initial implementation                                  | **Assumed** — simpler, no additional table needed            |
| A4  | `next-auth` session exposes `user.id`, `user.email`, `user.emailVerified`                          | **Assumed** — must confirm with installed package types      |
| A5  | `AUTH_PROVIDER=authjs` does not require `TENANT_CONTEXT_SOURCE=provider` — DB-based is the default | **Assumed**                                                  |
| A6  | Sign-up in authjs mode will use DB directly (no external provider)                                 | **Assumed**                                                  |
| U1  | Whether next-auth v5 is Edge-runtime compatible for proxy.ts                                       | **Unknown** — must check at Step 7.2                         |
| U2  | Exact session token shape returned by next-auth `auth()` in Edge context                           | **Unknown** — must verify at Step 7.5                        |

---

## Scope Boundaries

**In scope**:

- next-auth package installation
- Edge-safe auth config and Node-only auth config
- Credentials provider (email + password sign-in)
- Custom sign-in and sign-up pages
- SessionProvider wrapper
- AuthJsRequestIdentitySource (Node path — RSC and route handlers)
- AuthJsEdgeIdentitySource (Edge path — proxy.ts)
- DB-based organization switcher
- Wiring into auth module factory and proxy.ts

**Out of scope (Phase 7)**:

- OAuth providers (GitHub, Google, etc.) — future work
- DB session adapter (JWT is sufficient for Phase 7)
- Email verification flow — Phase 9
- Two-factor authentication
- Rate limiting for sign-in attempts (handled by existing withRateLimit middleware)

---

## Auth and Security Impact

- **Authentication surface**: New credential-based sign-in path; must not weaken existing security pipeline
- **Trust boundary**: Auth.js sessions are self-contained (JWT) — not external to the app
- **Session extraction in Edge**: Must use Edge-safe auth() from auth.config.ts only
- **No raw Error objects in logs** (SEC-10 applies)
- **Password hashing**: Must use bcrypt or argon2 — never plain text
- **Email verification**: Flag `emailVerified` should default to false for credentials provider unless explicitly confirmed
- **CSRF protection**: Auth.js handles CSRF tokens natively for the route handler

---

## Runtime Placement Requirements

| Component                               | Runtime         | Reason                                |
| --------------------------------------- | --------------- | ------------------------------------- |
| `auth.config.ts`                        | Edge-safe       | Used in proxy.ts                      |
| `auth.ts`                               | Node-only       | Uses bcrypt/argon2, DB adapter        |
| Route handler `/api/auth/[...nextauth]` | Node            | Auth.js requires Node for credentials |
| `AuthJsRequestIdentitySource`           | Node (RSC)      | Called from Server Components via DI  |
| `AuthJsEdgeIdentitySource`              | Edge            | Called from proxy.ts                  |
| `SessionProvider`                       | Client          | React context wrapper                 |
| Sign-in/Sign-up pages                   | Server + Client | RSC outer, client form inner          |

**Critical constraint**: `cacheComponents: true` bans `export const dynamic` and `export const runtime`. Use `await connection()` for dynamic rendering in route handlers and pages.

---

## Readiness Checklist (Entry Criteria — Phase 6 Completion)

- [x] Typecheck: 0 errors (confirmed in Phase 6 handoff)
- [x] Lint: 0 errors (confirmed in Phase 6 handoff)
- [x] Unit tests: 1031/1031 passing (confirmed in Phase 6 handoff)
- [x] `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts` exists (stub)
- [x] `src/modules/auth/index.ts` already imports `AuthJsRequestIdentitySource` (stub)
- [x] `src/proxy.ts` has `nonClerkProxy` path ready for non-Clerk providers
- [x] `src/app/layout.tsx` already conditionally renders `ClerkProvider` (gated by `isClerkProvider`)
- [x] Contract interfaces (`RequestIdentitySource`, `RequestIdentitySourceData`) finalized in Phase 2
- [ ] `next-auth` package installed (Step 7.1 — not yet done)

---

## Leantime Reference

- Epic Task ID: 55
- Phase 7 Leantime Task ID: 66 (from `.copilot/tasks/2026-04-17-auth-foundation-redesign/plan.md` Step 0.7)
