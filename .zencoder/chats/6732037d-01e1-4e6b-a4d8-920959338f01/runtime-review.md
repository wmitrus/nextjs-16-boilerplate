# Runtime Review — AuthJS Adapter Implementation

## Task

Implement a complete Auth.js (next-auth v5) adapter for the modular auth infrastructure. This touches App Router route handlers, edge middleware (`src/proxy.ts`), RSC layouts, and client components.

## Runtime Classification

- **route handler** — `/api/auth/[...nextauth]/route.ts` is a fully dynamic Node runtime route handler
- **middleware / proxy** — `src/proxy.ts` (Edge) must read Auth.js sessions via `auth.config.ts`
- **client component** — `SessionProvider`, `useSession()`, `signIn()`, `signOut()` are client-side
- **server component** — `auth()` from `auth.ts` is called in RSC and server actions
- **env exposure** — `AUTH_SECRET`, OAuth secrets must remain server-only

## Affected Runtime Surfaces

| Surface                      | File                                                                    | Change                                       |
| ---------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| Edge proxy                   | `src/proxy.ts`                                                          | Read Auth.js session in `nonClerkProxy` path |
| Route handler (dynamic)      | `src/app/api/auth/[...nextauth]/route.ts`                               | New Auth.js catch-all handler                |
| RSC identity source          | `src/modules/auth/infrastructure/authjs/AuthJsRequestIdentitySource.ts` | Call `auth()` from `auth.ts`                 |
| Client provider              | `src/app/layout.tsx`                                                    | Conditional `SessionProvider` wrapper        |
| Client components            | `src/modules/auth/ui/AuthJsHeaderAuthControls.tsx`                      | `useSession()` + `signIn()` + `signOut()`    |
| Sign-in page (server/client) | `src/app/sign-in/[[...sign-in]]/page.tsx`                               | AuthJS sign-in form                          |
| Sign-up page (server)        | `src/app/sign-up/[[...sign-up]]/page.tsx`                               | Redirect to sign-in                          |

## Server vs Client Placement

### auth.config.ts — Edge-Compatible (Server/Edge)

Must contain ONLY Edge-safe code:

- Provider configurations (OAuth provider constructors)
- `jwt()` and `session()` callbacks
- Basic configuration (`pages`, `session.strategy`)
- No Node.js built-ins (`fs`, `crypto`)
- No Drizzle adapter import
- No `src/core/db` import

This file is imported in `src/proxy.ts` (Edge runtime) and must not trigger Node.js-only module resolution.

### auth.ts — Node-Only (Server)

Extends `auth.config.ts`:

- `NextAuth(authConfig)` — creates the full Auth.js instance
- Optionally: Drizzle adapter import (if session persistence is needed)
- Exports: `auth`, `handlers`, `signIn`, `signOut`

Must NEVER be imported from `src/proxy.ts` or any edge-executed file.

### AuthJsRequestIdentitySource.ts — Node-Only (Server)

- Calls `auth()` from `auth.ts`
- Returns `RequestIdentitySourceData`
- Must be request-scoped (matching Clerk implementation)
- This is in `src/modules/auth/infrastructure/authjs/` — Node path, correct

### SessionProvider — Client-Only

- Import: `import { SessionProvider } from 'next-auth/react'`
- Must be in a `'use client'` file
- Required as a wrapper in `src/app/layout.tsx` when `AUTH_PROVIDER=authjs`
- Since `layout.tsx` is a Server Component, the provider must be in a dedicated wrapper:

```typescript
// src/modules/auth/ui/AuthJsSessionProvider.tsx
'use client';
import { SessionProvider } from 'next-auth/react';
export function AuthJsSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

### HeaderAuthControls — Client-Only

- Uses `useSession()` hook — client-only
- Uses `signIn()` and `signOut()` — can be called from client
- Must be `'use client'` component
- Replaces Clerk's `<SignedIn>`, `<SignedOut>`, `<UserButton>` with custom implementation

### Sign-in Page

- Server Component wrapper is fine (renders the form)
- The form submission must call `signIn()` from a client component OR use a server action
- Auth.js recommends calling `signIn()` from server actions for Credentials provider
- For OAuth providers, `signIn('github')` from a client button is the standard pattern

## Route Handlers — cacheComponents: true Constraint

**CRITICAL**: `cacheComponents: true` in `next.config.ts` **bans** `export const dynamic` and `export const runtime` from ALL App Router segments.

The Auth.js route handler at `/api/auth/[...nextauth]/route.ts` is inherently fully dynamic (OAuth callbacks, CSRF token generation, session creation). Under `cacheComponents: true`, the only legal way to opt into dynamic rendering is:

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { connection } from 'next/server';
import { handlers } from '@/modules/auth/infrastructure/authjs/auth';

export async function GET(request: Request): Promise<Response> {
  await connection(); // REQUIRED — opts into dynamic rendering
  return handlers.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  await connection(); // REQUIRED — opts into dynamic rendering
  return handlers.POST(request);
}
```

**DO NOT use:**

```typescript
export const dynamic = 'force-dynamic'; // ❌ BANNED with cacheComponents: true
export const runtime = 'nodejs'; // ❌ BANNED with cacheComponents: true
```

## Middleware / Proxy Behavior

### Current nonClerkProxy Path

```typescript
async function nonClerkProxy(request: NextRequest): Promise<NextResponse> {
  const requestContainer = createEdgeRequestContainer({
    auth: { authProvider: env.AUTH_PROVIDER },
  });
  return runSecurityPipeline(request, requestContainer);
}
```

The `createEdgeRequestContainer` creates an `AuthJsRequestIdentitySource` (via `createEdgeAuthModule`), which currently throws "not implemented."

After Phase 1, `AuthJsRequestIdentitySource.get()` will call `auth()`. However, in the edge proxy context, **`auth()` must come from `auth.config.ts`**, not `auth.ts`.

**The proxy has a structural issue**: `AuthJsRequestIdentitySource` in the edge module currently imports from `auth.ts` (the future implementation). In the edge context (proxy), it must import from `auth.config.ts`.

**Solution**: Create a separate `AuthJsEdgeIdentitySource` that imports `auth` from `auth.config.ts`. Wire this in `src/modules/auth/edge.ts` for the `authjs` case.

The proxy update for AuthJS:

```typescript
// In nonClerkProxy or in createEdgeAuthModule for authjs
// The edge module must use AuthJsEdgeIdentitySource (imports auth.config.ts)
// The node module uses AuthJsRequestIdentitySource (imports auth.ts)
```

This is why there's a separate `edge.ts` module — it already anticipates this split.

### Matcher Configuration

The existing `src/proxy.ts` matcher already covers:

```javascript
'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)';
```

The Auth.js route at `/api/auth/[...nextauth]` falls under `/(api|trpc)(.*)` matcher — it will be processed by the proxy. This is correct — rate limiting and security headers apply.

**Critical**: Ensure the Auth.js CSRF endpoint (`/api/auth/csrf`) and session endpoint (`/api/auth/session`) are not blocked by the `withInternalApiGuard` middleware (which guards internal APIs with `INTERNAL_API_KEY`). These are public-facing Auth.js endpoints.

Looking at `withInternalApiGuard`: it likely matches `/api/internal/*` or uses a specific header check. Need to verify it won't block `/api/auth/*`.

## Caching / Revalidation

### Session Data — Must NOT Be Cached

Auth.js session data is request-specific (tied to the session cookie). It must never be statically cached.

The `AuthJsRequestIdentitySource` must cache within the request scope only (matching the Clerk implementation's `private cached?: Promise<RequestIdentitySourceData>` pattern — cached per instance, and instances are created per-request in the DI container).

**No static caching risk** because:

1. `AuthJsRequestIdentitySource` is request-scoped (new instance per request via DI container)
2. The DI container itself is created fresh per request in `nonClerkProxy`

### Route Handler — Not Cacheable

`/api/auth/[...nextauth]` must never be cached. The `await connection()` call ensures dynamic rendering. Auth.js's internal implementation is already dynamic (generates CSRF tokens, etc.).

### Layout — Conditional Provider

`src/app/layout.tsx` conditionally wraps with `SessionProvider`. The layout may be prerendered for static parts. `SessionProvider` on the client side is fine — it makes HTTP requests to `/api/auth/session` to populate session state client-side. This is the correct pattern.

### RSC — `auth()` Calls

Any RSC that calls `auth()` from `auth.ts` reads from the session cookie. This is a request-time dynamic read. Under `cacheComponents: true`, `auth()` internally reads cookies/headers — this should automatically opt into dynamic rendering (similar to `cookies()` calls). However, to be explicit and safe, RSC pages calling `auth()` should also use `await connection()` before the call if they depend on request-time data.

For `AuthJsRequestIdentitySource.get()`, it's called from within the DI system during request handling — this is always request-time, so no caching concern.

## Edge vs Node Runtime

### Edge-Safe (can run in both Node and Edge)

- `auth.config.ts` — providers, callbacks, session config
- `AuthJsEdgeIdentitySource` (new) — imports `auth` from `auth.config.ts`
- Session cookie read via `auth()` from `auth.config.ts`

### Node-Only (must not run in Edge)

- `auth.ts` — full Auth.js instance with optional DB adapter
- `AuthJsRequestIdentitySource` — imports from `auth.ts`
- `DrizzleInternalIdentityLookup` — uses `src/core/db` (Node/Drizzle)
- Sign-in/sign-up server actions using `signIn()` from `auth.ts`

### Verification: No Edge Runtime Violations

The current `createEdgeAuthModule` in `src/modules/auth/edge.ts` creates `AuthJsRequestIdentitySource` for the `authjs` case. This is incorrect — the edge module should create `AuthJsEdgeIdentitySource` instead.

**Required fix in `src/modules/auth/edge.ts`**:

```typescript
case 'authjs':
  return new AuthJsEdgeIdentitySource(); // NOT AuthJsRequestIdentitySource
```

This is a critical fix — without it, importing `auth.ts` in the edge proxy will either fail compilation or cause a runtime crash.

## Environment Exposure

### Server-Only (must NOT appear in client schema)

- `AUTH_SECRET` / `AUTHJS_SECRET` — JWT signing key
- `GITHUB_CLIENT_ID` — OAuth client ID (server-side only; despite "ID", it's a credential)
- `GITHUB_CLIENT_SECRET` — OAuth client secret
- `AUTH_URL` / `NEXTAUTH_URL` — base URL for OAuth callbacks

### Public (acceptable in client schema)

- None required for AuthJS core operation

**Verification**: Auth.js provider secrets go into `process.env.GITHUB_CLIENT_ID` etc. in `auth.config.ts` on the server. They must NOT appear in the `client` section of `src/core/env.ts`.

## Runtime Constraints

1. **Route handler MUST use `await connection()`** — `export const dynamic` is banned
2. **`src/proxy.ts` MUST import `auth` from `auth.config.ts` for edge session reading** — NOT from `auth.ts`
3. **`auth.config.ts` MUST NOT import Drizzle adapter or any Node-only module**
4. **`SessionProvider` MUST be in a `'use client'` file** — the root layout is a Server Component
5. **`AuthJsRequestIdentitySource` uses `auth.ts`** (Node-only path — correct)
6. **`AuthJsEdgeIdentitySource` uses `auth.config.ts`** (edge path — required)
7. **The existing `createEdgeAuthModule` wires `AuthJsRequestIdentitySource` for `authjs`** — this must be changed to `AuthJsEdgeIdentitySource`
8. **All `auth()` calls that read timestamps** must be preceded by `await connection()` in any RSC that might be prerendered (per AGENTS.md RSC prerender constraint)

## Recommended Implementation Direction

### Phase 1 Runtime Focus

1. Create `auth.config.ts` (Edge-safe) with JWT strategy and placeholder provider
2. Create `auth.ts` (Node-only) wrapping `auth.config.ts`
3. Create `/api/auth/[...nextauth]/route.ts` using `await connection()` pattern
4. Implement `AuthJsRequestIdentitySource.get()` — calls `auth()` from `auth.ts`
5. Create `AuthJsEdgeIdentitySource.get()` — calls `auth()` from `auth.config.ts`
6. Fix `src/modules/auth/edge.ts` to use `AuthJsEdgeIdentitySource`

### Phase 3 Runtime Focus

7. Create `AuthJsSessionProvider.tsx` as `'use client'` component
8. Modify `layout.tsx` to conditionally render `AuthJsSessionProvider`
9. Create `AuthJsHeaderAuthControls.tsx` as `'use client'` using `useSession()`

## Recommendation

**Safe with constraints.**

The Auth.js adapter is implementable within this repository's runtime model. The critical constraints are:

1. `auth.config.ts` / `auth.ts` split is non-negotiable for Edge safety
2. `await connection()` in the route handler is non-negotiable for `cacheComponents: true`
3. `AuthJsEdgeIdentitySource` (separate from `AuthJsRequestIdentitySource`) is required for the proxy
4. `SessionProvider` needs a `'use client'` wrapper component
5. `withInternalApiGuard` must not block `/api/auth/*` endpoints

All constraints are implementable without touching core contracts or security invariants.
