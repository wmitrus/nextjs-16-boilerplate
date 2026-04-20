# Feature Intake — AuthJS Adapter Implementation

## Task ID

`2026-04-17-authjs-adapter`

## Objective

Design and implement a complete, production-grade **Auth.js (next-auth v5)** adapter for the existing modular auth infrastructure. The adapter must reach feature parity with the existing Clerk adapter across all integration points: identity source, edge proxy, UI controls, sign-in/sign-up flows, and session-backed provisioning bootstrap.

## Background

The repository supports multiple auth providers via a contract-first modular architecture (`src/modules/auth/`). Clerk is the only **runtime-complete** provider. AuthJS (`AUTH_PROVIDER=authjs`) is a registered enum value but currently throws `not yet implemented` at every call site.

## Current State (Verified in Code)

| Integration Point                      | Clerk Status                           | AuthJS Status                                       |
| -------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `RequestIdentitySource`                | ✅ Full (`ClerkRequestIdentitySource`) | ❌ Stub — throws `not yet implemented`              |
| Edge proxy (`src/proxy.ts`)            | ✅ `clerkMiddleware` wraps pipeline    | ⚠️ Falls through `nonClerkProxy` — session not read |
| Layout provider (`src/app/layout.tsx`) | ✅ `ClerkProvider`                     | ❌ No provider wrapping                             |
| Sign-in/Sign-up pages                  | ✅ Clerk components                    | ❌ Shows "not configured" message                   |
| Header auth controls                   | ✅ `SignedIn/SignedOut/UserButton`     | ❌ `HeaderAuthFallback` (empty)                     |
| `@auth/nextjs` package                 | N/A                                    | ❌ **Not installed**                                |

## Key AuthJS Capabilities (Library Analysis)

Auth.js (next-auth v5) provides:

- `auth()` — server-side session retrieval (RSC, route handlers, server actions)
- `handlers` — Next.js App Router route handlers (`GET`, `POST`) at `/api/auth/[...nextauth]`
- Middleware export (`auth` as middleware) for Edge session checks
- Session object shape: `{ user: { id, name, email, image }, expires }`
- Built-in providers: Google, GitHub, Credentials, and 40+ others
- `SessionProvider` — React context provider for client-side session access
- `useSession()` hook — client-side session state
- `signIn()` / `signOut()` — client and server-callable auth actions
- Database adapters (Drizzle adapter available for session/user persistence)
- JWT strategy (Edge-compatible) or database strategy for sessions

## What Clerk Provides (Currently Used)

| Feature               | Clerk API                                     | Equivalent AuthJS API                                          |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Session read (server) | `auth()` from `@clerk/nextjs/server`          | `auth()` from the configured Auth.js instance                  |
| User ID               | `userId` from `auth()`                        | `session.user.id` (requires ID in JWT/session)                 |
| Email claim           | `sessionClaims.email`                         | `session.user.email`                                           |
| Email verified        | `sessionClaims.email_verified`                | Provider-dependent (e.g., Google guarantees it)                |
| Org/tenant ID         | `orgId` from `auth()`                         | ❌ No native org concept — app-level via custom session fields |
| Org role              | `orgRole` from `auth()`                       | ❌ No native org concept — app-level via custom session fields |
| Edge middleware       | `clerkMiddleware()`                           | `auth` middleware export                                       |
| Client provider       | `ClerkProvider`                               | `SessionProvider` from `next-auth/react`                       |
| Sign-in UI            | `<SignInButton>`, `<SignedIn>`, `<SignedOut>` | Custom page at `/sign-in` using `signIn()`                     |
| Sign-up UI            | `<SignUpButton>`                              | Custom page at `/sign-up` (or same sign-in page)               |
| User button           | `<UserButton />`                              | Custom component using `useSession()` + `signOut()`            |

## Gap Analysis

### 1. Package Installation

`next-auth` (v5/beta) is not in `package.json`. Must be installed.

### 2. Auth.js Configuration

Needs `src/modules/auth/infrastructure/authjs/auth.ts` — the Auth.js config object with:

- At minimum one provider (Credentials + at least one OAuth provider for boilerplate)
- Session strategy (JWT preferred for Edge compatibility)
- Drizzle adapter for user/session persistence (optional, but needed for org-mode tenancy)
- Custom session/JWT callbacks to inject `userId` into the session

### 3. Route Handler

`src/app/api/auth/[...nextauth]/route.ts` — the Auth.js catch-all route handler.

### 4. RequestIdentitySource Implementation

`AuthJsRequestIdentitySource.get()` must call `auth()` from the configured Auth.js instance and map:

- `session.user.id` → `userId`
- `session.user.email` → `email`
- `emailVerified` → depends on provider
- `tenantExternalId` → custom session field (app-level, for org-mode users)
- `tenantRole` → custom session field

### 5. Edge Proxy (`src/proxy.ts`)

The `nonClerkProxy` path already runs without Clerk. AuthJS edge session must be read there and injected into the request container (mirroring the Clerk path).

### 6. UI Components

- `HeaderAuthControls` — Clerk-specific; needs AuthJS equivalent using `SessionProvider` + `useSession()` + `signIn()` + `signOut()`
- `HeaderAuthFallback` — must be replaced with real AuthJS controls when `AUTH_PROVIDER=authjs`
- Sign-in page (`/sign-in`) — must render a real form or OAuth buttons (not Clerk components)
- Sign-up page (`/sign-up`) — handled by Auth.js (redirects to sign-in or custom page)

### 7. Layout Provider

`src/app/layout.tsx` conditionally wraps with `ClerkProvider`. Must conditionally wrap with `SessionProvider` when `AUTH_PROVIDER=authjs`.

### 8. Tenancy Mode Mapping

- `TENANCY_MODE=single` — no org claims needed; AuthJS works fine
- `TENANCY_MODE=personal` — personal tenant from DB via internal lookup; AuthJS works fine
- `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db` — active tenant from header/cookie; AuthJS works fine
- `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider` — **requires custom session fields** since AuthJS has no native org concept; or must be documented as unsupported for AuthJS

## Expected User-Visible Behavior (Per Tenancy Mode)

| Scenario                                            | Behavior                                                |
| --------------------------------------------------- | ------------------------------------------------------- |
| Unauthenticated user visits protected route         | Redirected to `/sign-in`                                |
| User signs in via OAuth (e.g. GitHub)               | Redirected to `/auth/bootstrap`, then provisioned       |
| User signs in via Credentials                       | Same bootstrap flow                                     |
| Signed-in header                                    | Shows user avatar/email + sign-out button               |
| Signed-out header                                   | Shows sign-in button                                    |
| `AUTH_PROVIDER=authjs`, `TENANCY_MODE=single`       | Fully functional without org claims                     |
| `AUTH_PROVIDER=authjs`, `TENANCY_MODE=personal`     | Fully functional with DB-backed personal tenant         |
| `AUTH_PROVIDER=authjs`, `TENANCY_MODE=org+db`       | Functional with app-level tenant selection              |
| `AUTH_PROVIDER=authjs`, `TENANCY_MODE=org+provider` | **Unsupported** (no native org concept) — must document |

## Affected Modules / Files

### New files required:

- `src/modules/auth/infrastructure/authjs/auth.ts` — Auth.js config
- `src/modules/auth/infrastructure/authjs/auth.config.ts` — Edge-compatible base config
- `src/app/api/auth/[...nextauth]/route.ts` — Route handler
- `src/modules/auth/ui/AuthJsHeaderAuthControls.tsx` — Auth controls for AuthJS
- `src/modules/auth/ui/AuthJsSignInPage.tsx` — Sign-in page UI
- `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.ts` — Edge-compatible identity source

### Files to modify:

- `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts` — Implement `get()`
- `src/modules/auth/ui/HeaderWithAuth.tsx` — Conditionally render AuthJS header controls
- `src/app/layout.tsx` — Add conditional `SessionProvider` for AuthJS
- `src/app/sign-in/[[...sign-in]]/page.tsx` — Add AuthJS sign-in UI
- `src/app/sign-up/[[...sign-up]]/page.tsx` — Add AuthJS sign-up UI (or redirect)
- `src/proxy.ts` — Integrate AuthJS session reading in `nonClerkProxy` path
- `src/core/env.ts` — Add AuthJS env vars (`AUTH_SECRET`, provider keys)
- `.env.example` — Add AuthJS env vars

## Constraints Preview (Preliminary)

- `cacheComponents: true` bans `export const dynamic` and `export const runtime` — all routes must use `await connection()` for dynamic rendering
- DI contracts must remain untouched — `RequestIdentitySourceData` shape is the only AuthJS output
- Edge-safe vs Node-only code must be separated (Auth.js `auth.config.ts` pattern)
- Provider isolation: no Auth.js imports outside `src/modules/auth/infrastructure/authjs/` and dedicated route handler
- `AuthJsRequestIdentitySource` must be request-scoped and cached within the request (matching Clerk implementation)

## Phased Implementation Plan (Testable Sub-features)

Each phase must leave the app in a working state.

| Phase       | Scope                                                                                                          | Test Checkpoint                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Phase 1** | Install `next-auth`, create `auth.ts` + `auth.config.ts`, add route handler, implement `RequestIdentitySource` | `AUTH_PROVIDER=authjs` no longer throws; identity source returns empty session for unauthenticated users |
| **Phase 2** | Add env vars (`AUTH_SECRET`, etc.), add one OAuth provider (e.g. GitHub Credentials), connect edge proxy       | Edge proxy reads AuthJS session correctly; protected routes redirect to sign-in                          |
| **Phase 3** | UI: `SessionProvider` in layout, AuthJS header controls (sign-in/out button, user display)                     | Header shows correct auth state; sign-in/out works end-to-end                                            |
| **Phase 4** | Sign-in page: real form/OAuth buttons instead of "not configured" message                                      | Full auth flow: sign-in → bootstrap → app                                                                |
| **Phase 5** | Tenancy integration: custom session fields for `tenantExternalId` support in `org+db` mode                     | `TENANCY_MODE=personal` and `org+db` work with AuthJS                                                    |
| **Phase 6** | Tests: unit tests for `AuthJsRequestIdentitySource`, integration, E2E                                          | Full test coverage matching Clerk adapter test parity                                                    |

## Open Questions

1. **OAuth providers in boilerplate**: Which OAuth provider should be the primary example? GitHub is common for developer-focused boilerplates. Credentials provider also needed for testing.
2. **Database adapter**: Should Auth.js sessions be stored in the DB (Drizzle adapter) or use JWT strategy? JWT is Edge-compatible and simpler; Drizzle adds session management but complexity.
3. **`TENANCY_MODE=org+provider`**: Confirm this must be documented as unsupported for AuthJS, or design a custom session extension for it.
4. **Credentials provider**: Include for dev/test convenience, or OAuth-only?

## Assumptions

- Next-auth v5 (beta, `next-auth@beta`) is the target version, matching the v5/Auth.js naming
- JWT session strategy is preferred (Edge compatible, no additional DB schema)
- GitHub OAuth is the primary example provider; Credentials provider added for dev/testing
- `TENANCY_MODE=org+provider` is out of scope for AuthJS (documented as unsupported)
- All existing Clerk-specific tests remain unchanged; new AuthJS tests are additive

## Auth/Security Impact Assessment

- **Authentication**: Direct — this is a complete auth provider implementation
- **Authorization**: Indirect — authorization runs on internal UUIDs resolved from identity source; unchanged
- **Trust boundaries**: Auth.js JWT tokens replace Clerk session tokens; JWT secret (`AUTH_SECRET`) is critical
- **Session security**: Auth.js requires `AUTH_SECRET` for JWT signing (HMAC); must be in env
- **Provider isolation**: Must ensure Auth.js SDK never leaks into core contracts or domain logic
- **Cross-provider email linking**: `emailVerified` mapping is critical for `CROSS_PROVIDER_EMAIL_LINKING=verified-only`

## Runtime Placement Requirements

- Auth.js `auth.config.ts` (base config, no DB adapter) → Edge-compatible → used in proxy
- Auth.js `auth.ts` (full config with Drizzle adapter) → Node-only → used in route handler + RSC
- `SessionProvider` → Client component → layout wrapper
- `AuthJsRequestIdentitySource` → Node-only → request-scoped
- Route handler `/api/auth/[...nextauth]` → Node (dynamic, must use `await connection()`)

## Readiness Checklist

- [x] Repository code analyzed (auth module, contracts, proxy, UI, env)
- [x] Clerk feature set documented and compared to AuthJS
- [x] Gap analysis complete
- [x] Phased implementation plan defined
- [x] Open questions identified
- [ ] Leantime task created (pending)
- [ ] Architecture review complete
- [ ] Security review complete
- [ ] Runtime review complete
- [ ] Constraints document complete
- [ ] Validation strategy defined
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Final architecture check complete
