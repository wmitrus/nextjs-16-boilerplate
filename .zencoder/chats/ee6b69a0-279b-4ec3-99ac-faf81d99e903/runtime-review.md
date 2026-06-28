# Runtime Review — Phase 7: AuthJS Adapter

**Agent**: 03 - Next.js Runtime
**Plan step**: Runtime Review
**Date**: 2026-04-20

---

## Runtime Surfaces Affected

| Surface                            | Runtime                            | Auth.js Component                             |
| ---------------------------------- | ---------------------------------- | --------------------------------------------- |
| `src/proxy.ts`                     | **Edge**                           | `auth.config.ts` + `AuthJsEdgeIdentitySource` |
| `/api/auth/[...nextauth]/route.ts` | **Node**                           | `auth.ts` (full config)                       |
| `AuthJsRequestIdentitySource`      | **Node** (called from RSC)         | `auth.ts` session read                        |
| `SessionProvider` wrapper          | **Client** (browser)               | `next-auth/react`                             |
| `/auth/signin/page.tsx`            | **Node** (RSC) + **Client** (form) | Custom form submits to Auth.js handler        |
| `/auth/signup/page.tsx`            | **Node** (RSC) + **Client** (form) | DB insert, then redirect to signin            |

---

## `cacheComponents: true` Hard Constraint

**CRITICAL**: `cacheComponents: true` is active in `next.config.ts`. This bans:

- `export const dynamic = 'force-dynamic'`
- `export const runtime = 'nodejs'`

Both produce hard compile errors in Turbopack HMR.

### Required `await connection()` Usage

All new route handlers and RSC pages that need dynamic rendering MUST use:

```typescript
import { connection } from 'next/server';

export async function GET(): Promise<Response> {
  await connection();
  // ... rest of handler
}
```

**Required in**:

- `/api/auth/[...nextauth]/route.ts` — Auth.js is inherently request-bound
- `/auth/signin/page.tsx` — session check before rendering
- `/auth/signup/page.tsx` — if checking existing session

**NOT required in**: Static content portions of sign-in/sign-up pages (Auth.js forms are client-side)

---

## Edge vs Node Split for Auth.js

Auth.js v5 (`next-auth`) provides two import paths:

- **Edge-safe**: `next-auth` (the base package, config only)
- **Node-only**: Credentials provider, bcrypt, DB adapter

### `auth.config.ts` — Edge-safe

```typescript
import type { NextAuthConfig } from 'next-auth';

export const authConfig: NextAuthConfig = {
  providers: [],  // NO Credentials here — Credentials is Node-only
  callbacks: {
    authorized({ auth, request: { nextUrl } }) { ... }
  },
  pages: {
    signIn: '/auth/signin',
    signUp: '/auth/signup', // if supported
  },
};
```

### `auth.ts` — Node-only

```typescript
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import bcrypt from 'bcryptjs';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({ ... }), // bcrypt here — Node only
  ],
});
```

---

## Proxy.ts Integration

The `nonClerkProxy` path currently creates a bare edge container with no identity source override. For `AUTH_PROVIDER=authjs`, we need to inject `AuthJsEdgeIdentitySource`:

```typescript
async function nonClerkProxy(request: NextRequest): Promise<NextResponse> {
  let requestContainer = createEdgeRequestContainer({
    auth: { authProvider: env.AUTH_PROVIDER },
  });

  if (env.AUTH_PROVIDER === 'authjs') {
    const identitySource = new AuthJsEdgeIdentitySource();
    requestContainer = createRequestContainer(identitySource);
  }

  return runSecurityPipeline(request, requestContainer);
}
```

`AuthJsEdgeIdentitySource` reads the Auth.js session via the Edge-safe `auth()` from `auth.config.ts`.

---

## Route Handler — `/api/auth/[...nextauth]`

```typescript
import { handlers } from '@/modules/auth/infrastructure/authjs/auth';
import { connection } from 'next/server';

export async function GET(request: Request): Promise<Response> {
  await connection();
  return handlers.GET(request);
}

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handlers.POST(request);
}
```

**NO** `export const dynamic` or `export const runtime`.

---

## SessionProvider in Layout

Auth.js requires a `SessionProvider` in the client component tree. The layout already conditionally renders `ClerkProvider`. Add a parallel `SessionProvider` branch:

```typescript
// In layout.tsx (server component)
const isClerkProvider = env.AUTH_PROVIDER === 'clerk';
const isAuthJsProvider = env.AUTH_PROVIDER === 'authjs';

// In JSX:
{isAuthJsProvider ? (
  <SessionProvider>
    <AppLayoutContent>{children}</AppLayoutContent>
  </SessionProvider>
) : isClerkProvider ? (
  <ClerkProvider ...>
    <AppLayoutContent>{children}</AppLayoutContent>
  </ClerkProvider>
) : (
  <AppLayoutContent>{children}</AppLayoutContent>
)}
```

`SessionProvider` is a Client Component wrapper — import from `@/modules/auth/ui/authjs/SessionProvider`.

---

## Sign-in / Sign-up Pages

These are RSC pages with client form components. The pattern follows existing Clerk auth pages.

```
src/app/auth/signin/
  page.tsx          — RSC shell (checks existing session, redirects if authenticated)
  sign-in-client.tsx — Client component with form
```

Auth.js form submission targets the Next.js Server Action (v5) or the route handler. Using the route handler (`/api/auth/callback/credentials`) is safer given the `cacheComponents` constraint.

---

## Caching Assessment

- Auth.js sessions should NOT be cached by Next.js (they're request-scoped)
- `await connection()` in route handlers ensures no static caching
- `SessionProvider` reads from `useSession()` client-side — not affected by server caching

---

## Environment Variables Required

New variable needed in `src/core/env.ts`:

- `AUTH_SECRET` (server-only, required when `AUTH_PROVIDER=authjs`)

---

## Runtime Constraints Summary

1. **NEVER** use `export const runtime` or `export const dynamic` in new files
2. **ALWAYS** use `await connection()` in new route handlers
3. **Keep** `auth.config.ts` Edge-safe (no bcrypt, no DB)
4. **Keep** `auth.ts` Node-only (bcrypt, DB adapter)
5. `AuthJsEdgeIdentitySource` → imports only `auth.config.ts`
6. `AuthJsRequestIdentitySource` → imports `auth.ts`

---

## Status: APPROVED with CONSTRAINTS

Runtime analysis complete. All constraints above are implementation requirements.
