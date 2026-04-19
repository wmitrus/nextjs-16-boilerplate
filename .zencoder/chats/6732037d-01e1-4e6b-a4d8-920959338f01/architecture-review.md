# Architecture Review — AuthJS Adapter Implementation

## Task

Implement a complete Auth.js (next-auth v5) adapter for the existing modular auth infrastructure, reaching feature parity with Clerk across identity source, edge proxy, UI controls, sign-in/sign-up flows, and session-backed provisioning.

## Architecture Fit

**Safe with constraints.**

The repository's contract-first modular architecture is explicitly designed for provider swappability. `RequestIdentitySource`, `IdentityProvider`, `TenantResolver`, and `InternalIdentityLookup` are stable contracts that do not need to change. The `AuthModuleConfig.authProvider` enum already includes `'authjs'`. The design is correct — the gap is implementation completeness, not design deficiency.

Constraints that must be respected during implementation are detailed below.

## Affected Layers

| Layer                                  | Change                                          | Reason                                                |
| -------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| `src/modules/auth/`                    | New infrastructure adapter files, UI components | AuthJS is an auth provider — it belongs entirely here |
| `src/app/api/auth/[...nextauth]/`      | New route handler                               | Auth.js requires a catch-all API route                |
| `src/app/layout.tsx`                   | Conditional `SessionProvider` wrapping          | Client-side session context for AuthJS                |
| `src/app/sign-in/`, `src/app/sign-up/` | Replace "not configured" with real AuthJS UI    | User-facing sign-in flows                             |
| `src/proxy.ts`                         | AuthJS session read in `nonClerkProxy` path     | Edge session verification                             |
| `src/core/env.ts`                      | Add `AUTH_SECRET` and OAuth provider keys       | T3-Env schema extension                               |
| `src/security/`                        | **No changes**                                  | Security pipeline is provider-agnostic                |
| `src/core/contracts/`                  | **No changes**                                  | Contracts are stable and must not change              |

## Affected Modules

- `src/modules/auth/` — primary implementation target
- `src/app/` — delivery changes only (layout, pages, route handler)
- `src/core/env.ts` — env schema extension (additive only)

## Boundary Impact

### Module Boundaries — MAINTAINED

Auth.js SDK imports must be confined to:

- `src/modules/auth/infrastructure/authjs/` — all Auth.js server-side code
- `src/app/api/auth/[...nextauth]/route.ts` — the required route handler (delivery layer, acceptable)
- `src/app/layout.tsx` — `SessionProvider` import (acceptable: layout is delivery, not domain)
- `src/app/sign-in/` and `src/app/sign-up/` — form/button imports (delivery layer)

**Auth.js SDK must never appear in:**

- `src/core/` (contracts, DI, env, logger)
- `src/security/` (middleware, guards, audit)
- `src/features/` (domain features)
- `src/modules/authorization/`, `src/modules/provisioning/`, `src/modules/user/`
- `src/shared/`

### Dependency Direction — MAINTAINED

The `auth.ts` (full config) and `auth.config.ts` (edge config) files export a configured Auth.js instance. The `AuthJsRequestIdentitySource` imports from `auth.ts`. The route handler imports from `auth.ts`. These imports all flow downward (delivery → infrastructure), which is correct.

### Critical Architectural Split — Auth.js Edge vs Node Config

Auth.js v5 requires a config split pattern that aligns perfectly with this repository's Edge/Node boundaries:

```text
src/modules/auth/infrastructure/authjs/
  auth.config.ts    ← Edge-compatible (no Node-only imports, no DB adapter)
  auth.ts           ← Node-only (extends auth.config.ts + Drizzle adapter)
```

- `auth.config.ts` is imported in `src/proxy.ts` for edge session checking
- `auth.ts` is imported in RSC pages, route handlers, and server actions

This is the canonical Auth.js v5 pattern. **Deviation from this split will cause Edge runtime crashes.**

### DI and Composition Root — MAINTAINED

The existing `createEdgeAuthModule` and `createAuthModule` in `src/modules/auth/edge.ts` and `src/modules/auth/index.ts` already wire `AuthJsRequestIdentitySource` into the DI container. No changes needed to the composition root itself — only the implementation inside `AuthJsRequestIdentitySource.get()` needs to be filled in.

The `SessionProvider` wrapper in `src/app/layout.tsx` does NOT need DI registration — it is a React context provider, not a domain service.

### Auth Provider Isolation — REQUIRED

The Auth.js `auth()` function (session read) must be called only from within `AuthJsRequestIdentitySource.get()`. It must not be called directly from:

- RSC pages or layouts (call `getAppContainer().resolve(AUTH.IDENTITY_PROVIDER).getCurrentIdentity()` instead)
- Security middleware
- Domain services

The route handler at `/api/auth/[...nextauth]/route.ts` is the sole exception — it imports `{ handlers }` from `auth.ts` to expose the Auth.js API endpoints.

## New Contracts Required

**None.** The existing contracts fully cover the AuthJS adapter requirements:

- `RequestIdentitySource.get()` → maps Auth.js session to `RequestIdentitySourceData`
- `IdentityProvider.getCurrentIdentity()` → unchanged
- `TenantResolver` → unchanged
- `InternalIdentityLookup` → unchanged

The only new "contract" is the Auth.js configuration shape in `auth.config.ts` / `auth.ts`, which is an internal infrastructure concern, not a public contract.

## Provider Isolation Assessment

### What Auth.js Provides (Relevant to This Boilerplate)

Auth.js v5 does **not** have a native organization/tenant concept. This is the key difference from Clerk:

| Clerk Concept                  | Auth.js Equivalent                                                    |
| ------------------------------ | --------------------------------------------------------------------- |
| `userId`                       | `session.user.id` (requires `id` in JWT token callback)               |
| `sessionClaims.email`          | `session.user.email`                                                  |
| `sessionClaims.email_verified` | Provider-specific; Google/GitHub set this in the profile              |
| `orgId`                        | ❌ None — must use custom session field or app-level tenant selection |
| `orgRole`                      | ❌ None — must use custom session field or app-level role             |

**Impact on tenancy modes:**

| Tenancy Mode   | AuthJS Compatibility | Notes                                                                                                 |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| `single`       | ✅ Full              | No org claims needed                                                                                  |
| `personal`     | ✅ Full              | Personal tenant resolved from DB via `InternalIdentityLookup`                                         |
| `org+db`       | ✅ Full              | Active tenant from header/cookie — no provider claims needed                                          |
| `org+provider` | ❌ Unsupported       | Would require forcing org claims into Auth.js JWT — not worth the complexity; document as unsupported |

### Session Strategy Decision

**JWT strategy is required** for the `nonClerkProxy` edge path to work without DB access. Database strategy (Drizzle adapter sessions) would require DB reads in edge middleware — violating `AUTH_FLOW_ANTI_PATTERNS.md` Rule 3 (edge must not read from DB).

If session persistence is desired for other reasons (session revocation, longer-lived sessions), a Drizzle database adapter can be added to `auth.ts` (Node-only) without affecting the edge path, provided the edge path uses JWT strategy only.

**Recommended: JWT strategy.** If Drizzle adapter is added later, it must not be imported in `auth.config.ts`.

## Boundary Risks

### Risk 1: Auth.js `auth()` leaking into RSC layout or page (HIGH)

If a developer calls `auth()` from `src/app/layout.tsx` or any RSC page directly, they bypass the DI system and the `RequestIdentitySource` abstraction. This must be prevented by code review and documentation.

**Mitigation**: Document clearly in `AuthJsRequestIdentitySource` that `auth()` is the internal call and should not be used elsewhere.

### Risk 2: `SessionProvider` in Server Component (MEDIUM)

`SessionProvider` from `next-auth/react` is a client component. It must be in a `'use client'` wrapper when used in `src/app/layout.tsx`. The layout itself is a server component — the provider must be wrapped in a dedicated client wrapper file.

**Mitigation**: Create `src/modules/auth/ui/AuthJsSessionProvider.tsx` as a `'use client'` component that wraps `SessionProvider`.

### Risk 3: Auth.js imports in `auth.config.ts` pulling Node-only dependencies (HIGH)

The `auth.config.ts` must not import:

- Drizzle DB adapter (`@auth/drizzle-adapter`)
- Any Node.js built-ins (`fs`, `crypto`, etc.)
- `src/core/db` or any DB-related modules

If these appear in `auth.config.ts`, the Edge runtime will crash at startup.

**Mitigation**: The split between `auth.config.ts` and `auth.ts` enforces this. Use `export { auth, handlers, signIn, signOut } from './auth'` only from `auth.ts`.

### Risk 4: `cacheComponents: true` conflict with route handler (HIGH)

The `/api/auth/[...nextauth]/route.ts` handler is fully dynamic (Auth.js generates CSRF tokens per request, handles OAuth callbacks, etc.). Under `cacheComponents: true`, `export const dynamic = 'force-dynamic'` is **banned**.

**Mitigation**: Use `await connection()` from `next/server` at the top of the route handler to opt into dynamic rendering. Do not use `export const dynamic`.

### Risk 5: `emailVerified` claim mapping is provider-dependent (MEDIUM)

Different OAuth providers set email verification differently:

- GitHub: all emails are verified (GitHub enforces verification)
- Google: `profile.email_verified` is set
- Credentials: no intrinsic email verification

This matters for `CROSS_PROVIDER_EMAIL_LINKING=verified-only` in `ProvisioningService`.

**Mitigation**: The Auth.js `profile()` callback in each provider config must explicitly set `emailVerified` based on the provider's guarantee. Map it into the Auth.js `jwt()` callback so it persists in the JWT and is available in `AuthJsRequestIdentitySource.get()`.

### Risk 6: `nonClerkProxy` in `src/proxy.ts` doesn't read AuthJS session (MEDIUM)

Currently `nonClerkProxy` creates a container without any session data — the identity source `get()` will just throw "not implemented." After Phase 1, when `get()` is implemented, it will call `auth()` which requires `headers()` to be available (for reading the session cookie). In the edge proxy, this should work because Next.js provides `headers()` in the edge context.

However, Auth.js v5's `auth()` call from a middleware context uses `auth` exported from `auth.config.ts` (the Edge-compatible version), not from `auth.ts`. The proxy must import from `auth.config.ts`.

**Mitigation**: The `nonClerkProxy` path should call `auth()` from the `auth.config.ts` export and use it to build the request-scoped identity source, mirroring the Clerk `clerkMiddleware` pattern.

## Architectural Constraints for Implementation

### ALLOWED

- Creating new files in `src/modules/auth/infrastructure/authjs/`
- Creating `src/app/api/auth/[...nextauth]/route.ts`
- Adding `SessionProvider` wrapper in `src/app/layout.tsx` (via a client wrapper component)
- Extending `src/core/env.ts` with new optional auth vars (`AUTH_SECRET`, OAuth keys)
- Adding AuthJS-specific UI components in `src/modules/auth/ui/`
- Modifying `src/app/sign-in/` and `src/app/sign-up/` page content for AuthJS
- Modifying `src/proxy.ts` to read AuthJS session in `nonClerkProxy`
- Adding Credentials provider for dev/test (clearly documented as non-production)
- Adding GitHub OAuth provider as the primary boilerplate example

### FORBIDDEN

- Changing `src/core/contracts/identity.ts` (stable contract)
- Changing `RequestIdentitySourceData` shape
- Moving Auth.js imports into `src/core/`, `src/security/`, `src/features/`, `src/modules/authorization/`
- Calling `auth()` directly from RSC pages/layouts (must go through `IDENTITY_PROVIDER` from DI)
- Using `export const dynamic` or `export const runtime` in the route handler
- Importing `auth.ts` (Node-only) from `src/proxy.ts` (Edge context)
- Adding Drizzle adapter to `auth.config.ts`
- Treating `TENANCY_MODE=org+provider` as supported for AuthJS

### PROTECTED INVARIANTS

- `RequestIdentitySourceData` shape: `{ userId?, email?, emailVerified?, tenantExternalId?, tenantRole? }`
- `ExternalAuthProvider` enum: `'authjs'` is already registered
- All existing Clerk tests must remain green
- DI contracts (`AUTH.IDENTITY_SOURCE`, `AUTH.IDENTITY_PROVIDER`, etc.) must remain unchanged
- `src/proxy.ts` security pipeline (withSecurity, withInternalApiGuard, withRateLimit, withAuth) must remain unchanged
- `nonClerkProxy` path must not break for `supabase` and `neon` providers

## Architectural Recommendation

### Recommended File Structure

```text
src/modules/auth/infrastructure/authjs/
  auth.config.ts                     ← Edge-compatible base (providers, callbacks, JWT config)
  auth.ts                            ← Node-only (NextAuth(authConfig) export, optional DB adapter)
  AuthJsRequestIdentitySource.ts     ← Implement get() using auth() from auth.ts
  AuthJsEdgeIdentitySource.ts        ← Edge variant using auth() from auth.config.ts (for proxy)

src/modules/auth/ui/
  AuthJsSessionProvider.tsx          ← 'use client' — wraps SessionProvider
  AuthJsHeaderAuthControls.tsx       ← 'use client' — sign-in/out, user display
  HeaderWithAuth.tsx                 ← Modified: AUTH_PROVIDER=authjs → AuthJsHeaderAuthControls

src/app/api/auth/[...nextauth]/
  route.ts                           ← { handlers } from auth.ts

src/app/sign-in/[[...sign-in]]/
  page.tsx                           ← Modified: AUTH_PROVIDER=authjs → AuthJs sign-in UI

src/app/sign-up/[[...sign-up]]/
  page.tsx                           ← Modified: AUTH_PROVIDER=authjs → redirect to sign-in
```

### Phase-Gated Delivery (Recommended)

Per the intake document — each phase must leave the app in a working, testable state:

1. **Phase 1**: Package + config + route handler + `RequestIdentitySource` (no UI changes)
2. **Phase 2**: Env vars + OAuth provider + edge proxy session reading
3. **Phase 3**: UI — `SessionProvider`, header controls
4. **Phase 4**: Sign-in/sign-up pages with real forms
5. **Phase 5**: Tenancy integration (personal + org+db modes)
6. **Phase 6**: Tests

## Architecture Verdict

**Safe to proceed** with the phased implementation plan.

The existing architecture already accommodates AuthJS as a first-class provider. The implementation requires no contract changes, no security model changes, and no violation of the modular monolith boundaries. The critical constraints are:

1. `auth.config.ts` / `auth.ts` Edge/Node split
2. `await connection()` instead of `export const dynamic` in the route handler
3. `SessionProvider` in a `'use client'` wrapper
4. Auth.js SDK confined to `src/modules/auth/infrastructure/authjs/` and delivery entry points only
5. `TENANCY_MODE=org+provider` documented as unsupported
