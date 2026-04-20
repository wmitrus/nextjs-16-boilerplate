# Constraints Summary — AuthJS Adapter Implementation

## Task

Implement a complete Auth.js (next-auth v5) adapter for the existing modular auth infrastructure, reaching feature parity with Clerk across all integration points.

## Scope

**In scope:**

- `next-auth` v5 (beta) package installation
- `auth.config.ts` — Edge-compatible Auth.js configuration
- `auth.ts` — Node-only full Auth.js instance
- `/api/auth/[...nextauth]/route.ts` — Auth.js route handler
- `AuthJsRequestIdentitySource.get()` — Node path implementation
- `AuthJsEdgeIdentitySource` — NEW: Edge path (imports `auth.config.ts`)
- Fix `src/modules/auth/edge.ts` — use `AuthJsEdgeIdentitySource` for `authjs` case
- `AuthJsSessionProvider.tsx` — `'use client'` wrapper for `SessionProvider`
- `AuthJsHeaderAuthControls.tsx` — sign-in/out button + user display
- `HeaderWithAuth.tsx` — conditional AuthJS header rendering
- `src/app/layout.tsx` — conditional `SessionProvider` wrapper
- `src/app/sign-in/[[...sign-in]]/page.tsx` — AuthJS sign-in form/buttons
- `src/app/sign-up/[[...sign-up]]/page.tsx` — redirect to sign-in
- `src/core/env.ts` — add `AUTH_SECRET`, `AUTH_URL`, OAuth provider secrets
- `.env.example` — document new AuthJS env vars
- GitHub OAuth provider (primary example)
- Credentials provider (dev/test only, clearly documented)
- Unit tests for `AuthJsRequestIdentitySource` and `AuthJsEdgeIdentitySource`
- `TENANCY_MODE=single`, `personal`, `org+db` support
- Documentation of `TENANCY_MODE=org+provider` as unsupported for AuthJS

**Out of scope:**

- `TENANCY_MODE=org+provider` support for AuthJS
- Drizzle session adapter (JWT strategy only)
- Additional OAuth providers beyond GitHub (can be added later)
- Email/magic-link provider
- Session revocation
- Auth.js admin API
- Changes to `src/security/`, `src/modules/authorization/`, `src/modules/provisioning/`
- Changes to `src/core/contracts/` (stable contracts must not change)
- Changes to existing Clerk adapter files

## Architecture Constraints

### Boundary Rules

1. **Auth.js SDK confined to `src/modules/auth/infrastructure/authjs/`** and specific delivery entry points (`/api/auth/[...nextauth]/route.ts`, `src/app/layout.tsx`, `src/app/sign-in/`, `src/app/sign-up/`)
2. **No Auth.js imports in**: `src/core/`, `src/security/`, `src/features/`, `src/modules/authorization/`, `src/modules/provisioning/`, `src/modules/user/`, `src/shared/`
3. **`auth.config.ts` / `auth.ts` split is mandatory** — Edge-safe config vs Node-only instance
4. **`src/modules/auth/edge.ts` must use `AuthJsEdgeIdentitySource`** for the `authjs` case (NOT `AuthJsRequestIdentitySource`)
5. **`src/proxy.ts` must import from `auth.config.ts`** (Edge runtime) — never from `auth.ts`

### Dependency Direction

- `AuthJsRequestIdentitySource` → imports `auth` from `auth.ts` ✅ (infrastructure → infrastructure)
- `AuthJsEdgeIdentitySource` → imports `auth` from `auth.config.ts` ✅ (infrastructure → infrastructure)
- `auth.ts` → may import Drizzle adapter (future option only) ✅
- `auth.config.ts` → NO Node.js built-ins, NO Drizzle, NO `src/core/db` ✅

### DI / Composition Constraints

- No changes to DI contract symbols (`AUTH.IDENTITY_SOURCE`, etc.)
- No changes to `RequestIdentitySourceData` interface
- `AuthJsRequestIdentitySource` remains request-scoped (new instance per request via DI)
- The existing `createEdgeAuthModule` and `createAuthModule` registration logic requires only the implementation change in the `authjs` case of `buildIdentitySource()`

### Contract Constraints

- `RequestIdentitySourceData` shape MUST remain: `{ userId?, email?, emailVerified?, tenantExternalId?, tenantRole? }`
- `ExternalAuthProvider` type already includes `'authjs'` — no change needed
- `IdentityProvider`, `TenantResolver`, `InternalIdentityLookup` interfaces — unchanged

## Security / Auth Constraints

### Critical (Must-Fix Before Phase 1 Ships)

1. **`AUTH_SECRET` minimum 32 bytes** — add to `src/core/env.ts` as server-only required var (when AUTH_PROVIDER=authjs)
2. **`jwt()` callback must set `token.emailVerified` per-provider** — provider-specific rules:
   - GitHub → `true` (always verified)
   - Google → `profile.email_verified === true`
   - Credentials → `false` (no external guarantee)
3. **`session()` callback must set `session.user.id = token.sub`** — without this, `userId` is undefined and provisioning fails
4. **OAuth secrets are server-only env vars** — must appear in `server` section of T3-Env schema, never in `client` section

### High (Must-Fix Before E2E)

5. **No `emailVerified: true` for Credentials provider** without actual email verification
6. **CSRF token required in sign-in form** (Auth.js handles this automatically via `getCsrfToken()`)
7. **`AUTH_URL` must be set** to the application's base URL for OAuth callback validation
8. **`callbackUrl` from query params** must use `sanitizeRedirectUrl()` before forwarding (SEC-03)

### Medium (Must-Fix Before Production)

9. **Credentials provider** must use timing-safe password comparison if included in production builds
10. **Cookie security attributes** must not be weakened from Auth.js defaults
11. **Auth errors logged** must extract `errorMessage`/`errorName` as strings (SEC-10)
12. **`/api/auth/*` must not be blocked** by `withInternalApiGuard` — verify this in `src/security/`

### Informational

13. `session.user.id` from Auth.js is an external provider ID — it flows through `InternalIdentityLookup` like Clerk's `userId`. This is already handled correctly by the existing infrastructure.

## Runtime Constraints

### Hard Rules (Non-Negotiable)

1. **Route handler `/api/auth/[...nextauth]/route.ts` MUST use `await connection()`** — `export const dynamic` is banned under `cacheComponents: true`
2. **`auth.config.ts` MUST NOT import**: Drizzle adapter, `fs`, `crypto`, `src/core/db`, or any Node-only module
3. **`SessionProvider` MUST be in a `'use client'` file** — layout is a Server Component
4. **`src/proxy.ts` MUST import `auth` from `auth.config.ts`** — never from `auth.ts`
5. **Any RSC calling `auth()` that may be prerendered** must precede it with `await connection()`

### Caching Rules

6. **Auth.js session data is request-scoped** — `AuthJsRequestIdentitySource` caches within the instance (per-request DI scope) only
7. **The route handler is fully dynamic** — no static caching, enforced by `await connection()`
8. **`SessionProvider` client-side session fetches `/api/auth/session`** — this is correct behavior; don't block it

### Edge vs Node Placement

9. **Edge (proxy)**: `AuthJsEdgeIdentitySource` ← `auth.config.ts`
10. **Node (RSC/server actions)**: `AuthJsRequestIdentitySource` ← `auth.ts`
11. **Client**: `SessionProvider`, `useSession()`, `signIn()`, `signOut()` from `next-auth/react`

## Validation Constraints

See `validation-strategy.md` (forthcoming) for the full validation plan.

Minimum validation required:

- Unit tests for `AuthJsRequestIdentitySource` (session mapped → `RequestIdentitySourceData`)
- Unit tests for `AuthJsEdgeIdentitySource` (same mapping, edge path)
- Typecheck must pass with zero errors
- Lint must pass with zero errors
- Existing Clerk adapter tests must remain green

## Explicitly Allowed Changes

- ✅ New files in `src/modules/auth/infrastructure/authjs/`
- ✅ New files in `src/modules/auth/ui/` (AuthJS-specific UI components)
- ✅ New file `src/app/api/auth/[...nextauth]/route.ts`
- ✅ Modify `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts`
- ✅ Modify `src/modules/auth/edge.ts` — change `authjs` case to use `AuthJsEdgeIdentitySource`
- ✅ Modify `src/modules/auth/ui/HeaderWithAuth.tsx` — add AuthJS branch
- ✅ Modify `src/app/layout.tsx` — add conditional `AuthJsSessionProvider`
- ✅ Modify `src/app/sign-in/[[...sign-in]]/page.tsx` — add AuthJS UI
- ✅ Modify `src/app/sign-up/[[...sign-up]]/page.tsx` — add AuthJS UI
- ✅ Extend `src/core/env.ts` with new optional env vars (additive only)
- ✅ Add `next-auth` to `package.json`
- ✅ Add AuthJS env vars to `.env.example`

## Explicitly Forbidden Changes

- ❌ Change `src/core/contracts/identity.ts` (stable contract)
- ❌ Change `RequestIdentitySourceData` interface shape
- ❌ Add Auth.js imports to `src/core/`, `src/security/`, `src/features/`, `src/modules/authorization/`, `src/modules/provisioning/`
- ❌ Use `export const dynamic` or `export const runtime` in the route handler
- ❌ Import `auth.ts` in `src/proxy.ts` (Edge context)
- ❌ Add Drizzle adapter to `auth.config.ts`
- ❌ Set `emailVerified: true` for Credentials provider without actual verification
- ❌ Log `AUTH_SECRET`, `GITHUB_CLIENT_SECRET` or other OAuth secrets
- ❌ Place `AUTH_SECRET` or OAuth secrets in the `client` schema of `src/core/env.ts`
- ❌ Implement `TENANCY_MODE=org+provider` for AuthJS

## Protected Invariants

1. All existing Clerk adapter tests remain green
2. `AUTH_PROVIDER=clerk` behavior is unchanged
3. `AUTH_PROVIDER=supabase` and `AUTH_PROVIDER=neon` stubs continue to throw (no regression)
4. DI contract symbols are unchanged
5. Security pipeline (`withSecurity` → `withInternalApiGuard` → `withRateLimit` → `withAuth`) is unchanged
6. `nonClerkProxy` path continues to work for `supabase` and `neon` providers
7. `src/core/contracts/identity.ts` is unchanged
8. Provisioning domain is unchanged

## Phase-to-Constraint Mapping

| Phase                                       | Constraints Focus                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1: Package + Config + Identity Source | AUTH_SECRET env, jwt/session callbacks, auth.config.ts/auth.ts split, route handler `connection()`, AuthJsEdgeIdentitySource, edge.ts fix |
| Phase 2: OAuth + Edge Proxy                 | AUTH_URL env, proxy imports auth.config.ts, emailVerified mapping, /api/auth/\* not blocked                                               |
| Phase 3: UI Provider + Controls             | SessionProvider in 'use client' wrapper, no Auth.js in layout server code                                                                 |
| Phase 4: Sign-in/Sign-up Pages              | callbackUrl sanitization, CSRF token in form, redirect to /auth/bootstrap                                                                 |
| Phase 5: Tenancy Integration                | Personal tenant (personal mode), tenant header/cookie (org+db mode), org+provider documented as unsupported                               |
| Phase 6: Tests                              | Full unit coverage, typecheck, lint, existing tests green                                                                                 |
