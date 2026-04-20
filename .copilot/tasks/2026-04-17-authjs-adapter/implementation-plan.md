# Implementation Plan — AuthJS Adapter

## Task ID

`2026-04-17-authjs-adapter`

## References

- Feature intake: `.zencoder/chats/6732037d-01e1-4e6b-a4d8-920959338f01/feature-intake.md`
- Architecture review: `.zencoder/chats/6732037d-01e1-4e6b-a4d8-920959338f01/architecture-review.md`
- Security review: `.zencoder/chats/6732037d-01e1-4e6b-a4d8-920959338f01/security-review.md`
- Runtime review: `.zencoder/chats/6732037d-01e1-4e6b-a4d8-920959338f01/runtime-review.md`
- Constraints: `.zencoder/chats/6732037d-01e1-4e6b-a4d8-920959338f01/constraints.md`
- Validation strategy: `.zencoder/chats/6732037d-01e1-4e6b-a4d8-920959338f01/validation-strategy.md`

## Goal

Implement the AuthJS adapter in 6 phased steps where each phase leaves the app in a testable state. After each phase the developer can switch `AUTH_PROVIDER=authjs` and verify the specific subfeature in the running app.

---

## Phase 1: Package + Config + Identity Source

**Test checkpoint**: `AUTH_PROVIDER=authjs` no longer throws. Identity source returns empty data for unauthenticated users. Route handler responds at `/api/auth/`.

### Files to create:

- [ ] `src/modules/auth/infrastructure/authjs/auth.config.ts` — Edge-compatible Auth.js config
  - JWT session strategy
  - GitHub OAuth provider (requires `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`)
  - Credentials provider (dev only — clearly commented)
  - `pages: { signIn: '/sign-in', signUp: '/sign-up', error: '/sign-in' }`
  - `jwt()` callback: propagate `token.sub`, set `token.emailVerified` per provider
  - `session()` callback: set `session.user.id = token.sub`, expose `session.user.emailVerified`
  - NO Node-only imports, NO Drizzle adapter

- [ ] `src/modules/auth/infrastructure/authjs/auth.ts` — Node-only full Auth.js instance
  - `import authConfig from './auth.config'`
  - `const { auth, handlers, signIn, signOut } = NextAuth(authConfig)`
  - Export all four: `auth`, `handlers`, `signIn`, `signOut`

- [ ] `src/app/api/auth/[...nextauth]/route.ts` — Catch-all route handler
  - `import { connection } from 'next/server'` — REQUIRED
  - `import { handlers } from '@/modules/auth/infrastructure/authjs/auth'`
  - Export `GET` and `POST` as async functions using `await connection()` before delegating

- [ ] `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.ts` — NEW Edge variant
  - Imports `auth` from `./auth.config` (NOT from `./auth`)
  - Maps `session.user.id` → `userId`, `session.user.email` → `email`, `session.user.emailVerified` → `emailVerified`
  - Handles null session (unauthenticated) gracefully
  - Same caching pattern as `ClerkRequestIdentitySource` (request-scoped `private cached?`)

### Files to modify:

- [ ] `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts` — Implement `get()`
  - Import `auth` from `./auth` (Node path)
  - Map session to `RequestIdentitySourceData`
  - Handle null session (unauthenticated → all fields undefined)
  - Add request-scoped caching (`private cached?`)
  - Log warning when no email claim (mirrors ClerkRequestIdentitySource pattern)

- [ ] `src/modules/auth/edge.ts` — Fix `authjs` case
  - Change from `new AuthJsRequestIdentitySource()` to `new AuthJsEdgeIdentitySource()`
  - Import `AuthJsEdgeIdentitySource` instead of `AuthJsRequestIdentitySource` for edge module

- [ ] `src/core/env.ts` — Add env vars
  - Server: `AUTH_SECRET: z.string().min(32).optional()` (required when AUTH_PROVIDER=authjs)
  - Server: `GITHUB_CLIENT_ID: z.string().optional()`
  - Server: `GITHUB_CLIENT_SECRET: z.string().optional()`
  - Server: `AUTH_URL: z.url().optional()` (base URL for OAuth callbacks)
  - Add to `runtimeEnv` section

- [ ] `.env.example` — Document new vars with comments
  - Section: "# AuthJS Provider (AUTH_PROVIDER=authjs)"
  - `AUTH_SECRET=` (generated with `openssl rand -base64 32`)
  - `AUTH_URL=http://localhost:3000`
  - `GITHUB_CLIENT_ID=`
  - `GITHUB_CLIENT_SECRET=`

### Tests to create:

- [ ] `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.test.ts` — Replace stub
  - Mock `auth` from `./auth` using `vi.mock`
  - Test: authenticated GitHub session → userId, email, emailVerified: true
  - Test: authenticated Credentials session → userId, email, emailVerified: false (or undefined)
  - Test: unauthenticated (null session) → all fields undefined
  - Test: session missing email → email undefined
  - Test: request-scoped caching (auth called once, result reused)

- [ ] `src/modules/auth/infrastructure/authjs/AuthJsEdgeIdentitySource.test.ts` — New file
  - Same test cases as above but mocking `auth` from `./auth.config`

- [ ] Update `src/modules/auth/edge.test.ts` — Verify `authjs` case
  - Confirm the `authjs` builder creates `AuthJsEdgeIdentitySource` instance

### Phase 1 Validation:

```shell
pnpm typecheck     # Must pass
pnpm lint --fix   # Must pass
pnpm test         # All unit tests green (including new AuthJS tests)
```

---

## Phase 2: OAuth Provider + Edge Proxy Integration

**Test checkpoint**: Sign-in redirects to `/sign-in`. Protected routes redirect unauthenticated users correctly. OAuth flow starts (even if callback fails without real GitHub app).

### Files to modify:

- [ ] `src/proxy.ts` — AuthJS session reading in `nonClerkProxy`
  - Import `auth` from `@/modules/auth/infrastructure/authjs/auth.config` (Edge path)
  - Only import when `AUTH_PROVIDER === 'authjs'` (avoid importing for supabase/neon)
  - For the `authjs` case: call `auth()` in `nonClerkProxy`, build `requestIdentitySource` from session (mirroring Clerk pattern)
  - For `supabase`/`neon`: remain as current (pass through to `createEdgeRequestContainer`)
  - Alternatively: create a factory function that selects the right proxy implementation

**Architecture note**: The cleanest approach mirrors the Clerk pattern — create an `authJsProxy` handler similar to `nonClerkProxy` that wraps `auth()` from `auth.config.ts`:

```typescript
const proxyHandler =
  env.AUTH_PROVIDER === 'clerk'
    ? clerkMiddleware(...)
    : env.AUTH_PROVIDER === 'authjs'
    ? authJsProxy  // New: wraps auth() from auth.config.ts
    : nonClerkProxy; // supabase, neon fallthrough
```

### Phase 2 Validation:

```shell
pnpm typecheck     # Must pass
pnpm lint --fix   # Must pass
pnpm test         # All unit tests green
# Manual: Start dev server with AUTH_PROVIDER=authjs, AUTH_SECRET set
# Visit protected route → should redirect to /sign-in (proxy session gate working)
```

---

## Phase 3: UI — Session Provider + Header Controls

**Test checkpoint**: Header shows "Sign In" when unauthenticated, shows user email + sign-out when authenticated. No Clerk-related errors in console.

### Files to create:

- [ ] `src/modules/auth/ui/AuthJsSessionProvider.tsx` — `'use client'` component
  - Wraps `SessionProvider` from `next-auth/react`
  - Props: `{ children: React.ReactNode }`

- [ ] `src/modules/auth/ui/AuthJsHeaderAuthControls.tsx` — `'use client'` component
  - Uses `useSession()` from `next-auth/react`
  - Uses `signIn()` and `signOut()` from `next-auth/react`
  - Signed-out: shows "Sign In" button → calls `signIn()` or links to `/sign-in`
  - Signed-in: shows user email/name + "Sign Out" button → calls `signOut()`
  - Loading: shows skeleton (matches existing `HeaderAuthFallback` or Clerk loading pattern)
  - Mirrors the same UX pattern as `HeaderAuthControls.tsx`

### Files to modify:

- [ ] `src/modules/auth/ui/HeaderWithAuth.tsx`
  - Add `env.AUTH_PROVIDER === 'authjs'` branch → render `<AuthJsHeaderAuthControls />`
  - Keep `env.AUTH_PROVIDER === 'clerk'` branch unchanged
  - Other providers → `<HeaderAuthFallback />`

- [ ] `src/app/layout.tsx`
  - Add conditional `AuthJsSessionProvider` wrapping when `AUTH_PROVIDER === 'authjs'`
  - Import `AuthJsSessionProvider` (server-safe — it's a client component wrapper)
  - Keep `ClerkProvider` branch unchanged

### Tests to create:

- [ ] `src/modules/auth/ui/AuthJsHeaderAuthControls.test.tsx`
  - Mock `next-auth/react` `useSession()`
  - Test: unauthenticated (`status: 'unauthenticated'`) → shows sign-in button
  - Test: authenticated (`status: 'authenticated'`, user data) → shows email + sign-out button
  - Test: loading (`status: 'loading'`) → shows skeleton

### Phase 3 Validation:

```shell
pnpm typecheck     # Must pass
pnpm lint --fix   # Must pass
pnpm test         # All unit tests green including AuthJsHeaderAuthControls
# Manual: AUTH_PROVIDER=authjs dev server → header shows correct auth state
```

---

## Phase 4: Sign-in / Sign-up Pages

**Test checkpoint**: Full flow: sign in with GitHub OAuth or Credentials → redirected to `/auth/bootstrap` → provisioned → redirected to app. Sign-up page redirects to sign-in.

### Files to modify:

- [ ] `src/app/sign-in/[[...sign-in]]/page.tsx`
  - Add `AUTH_PROVIDER === 'authjs'` branch
  - Render: GitHub OAuth sign-in button (`signIn('github', { redirectTo: '/auth/bootstrap' })`)
  - Render: Credentials sign-in form (email + password fields) with CSRF token
  - Form action uses server action calling `signIn('credentials', ...)`
  - Keep `AUTH_PROVIDER === 'clerk'` branch unchanged
  - Other providers → "not configured" message (unchanged)

- [ ] `src/app/sign-up/[[...sign-up]]/page.tsx`
  - Add `AUTH_PROVIDER === 'authjs'` branch
  - For OAuth (GitHub): redirects to sign-in (GitHub OAuth handles new account creation)
  - For Credentials: show registration form OR redirect to sign-in (boilerplate simplification)
  - Keep `AUTH_PROVIDER === 'clerk'` branch unchanged

**Bootstrap redirect**: Auth.js `signIn()` `redirectTo` param must point to `/auth/bootstrap` (matching the design from `docs/feature-desings/01 - Final Auth...`). Use `sanitizeRedirectUrl()` for any `callbackUrl` from query params (SEC-03).

### E2E tests to create:

- [ ] `e2e/auth/authjs-sign-in.spec.ts`
  - Unauthenticated user visits protected route → redirected to `/sign-in`
  - Sign-in page loads without error boundary
  - Sign-in page has correct title
  - GitHub OAuth button is visible
  - Credentials form is visible (if included)
  - (With Credentials provider): sign in → bootstrap → app lands correctly

### Phase 4 Validation:

```shell
pnpm typecheck     # Must pass
pnpm lint --fix   # Must pass
pnpm test         # All unit tests green
pnpm e2e          # AuthJS E2E spec passes (Credentials flow)
```

---

## Phase 5: Tenancy Integration Verification

**Test checkpoint**: `TENANCY_MODE=personal` fully works with AuthJS. `TENANCY_MODE=org+db` works. `TENANCY_MODE=org+provider` shows clear error/documentation.

### Files to create/modify:

- [ ] `docs/features/XX - AuthJS Authentication.md` — Documentation
  - Auth.js setup guide (env vars, GitHub app creation, Credentials dev setup)
  - Claims mapping table (session.user.id → userId, etc.)
  - Tenancy mode compatibility table
  - `TENANCY_MODE=org+provider` documented as unsupported
  - Session token configuration (jwt/session callbacks)

- [ ] `src/modules/auth/index.ts` — Add validation
  - If `authProvider === 'authjs'` and `tenancyMode === 'org'` and `tenantContextSource === 'provider'` → throw clear error: "[authModule] TENANCY_MODE=org+TENANT_CONTEXT_SOURCE=provider is not supported for AUTH_PROVIDER=authjs. Use TENANT_CONTEXT_SOURCE=db instead."

### Phase 5 Validation:

```shell
pnpm typecheck     # Must pass
pnpm lint --fix   # Must pass
pnpm test         # All unit tests green
# Manual: TENANCY_MODE=personal with AUTH_PROVIDER=authjs → full flow works
# Manual: TENANCY_MODE=org+db with AUTH_PROVIDER=authjs → tenant resolves from header/cookie
```

---

## Phase 6: Test Completion + Final Cleanup

**Test checkpoint**: Full test suite passes. Lint and typecheck clean. All validation from validation-strategy.md complete.

### Checklist:

- [ ] `AuthJsRequestIdentitySource.test.ts` — comprehensive (all edge cases from validation strategy)
- [ ] `AuthJsEdgeIdentitySource.test.ts` — comprehensive
- [ ] `AuthJsHeaderAuthControls.test.tsx` — comprehensive
- [ ] `src/modules/auth/edge.test.ts` — updated for `authjs` case
- [ ] `src/modules/auth/index.test.ts` — updated for `authjs` validation (org+provider error)
- [ ] E2E spec `e2e/auth/authjs-sign-in.spec.ts` — complete and passing
- [ ] All existing tests remain green (regression check)

### Phase 6 Validation:

```shell
pnpm typecheck       # Must pass
pnpm lint --fix     # Must pass
pnpm test           # All unit tests green
pnpm test:integration # Integration tests green
pnpm e2e            # E2E spec passes
pnpm test:all       # Full Vitest suite
```

---

## Sequencing Constraints

1. Phase 1 MUST complete before Phase 2 (edge proxy needs `AuthJsEdgeIdentitySource`)
2. Phase 1 MUST complete before Phase 3 (`auth.ts` exports needed by `signIn`/`signOut`)
3. Phase 2 and Phase 3 CAN run in parallel after Phase 1
4. Phase 4 requires Phase 2 + Phase 3 complete
5. Phase 5 can run after Phase 4
6. Phase 6 runs last

## Critical Implementation Checks Per Phase

Before marking any phase complete:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint --fix` passes
- [ ] `pnpm test` (unit) passes
- [ ] No imports of `auth.ts` from `src/proxy.ts` or any edge file
- [ ] No `export const dynamic` or `export const runtime` in route handlers
- [ ] No Auth.js imports outside `src/modules/auth/infrastructure/authjs/` and delivery entry points
