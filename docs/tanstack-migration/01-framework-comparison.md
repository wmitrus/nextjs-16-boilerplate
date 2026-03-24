# Phase 0: Framework Comparison – Next.js 16 vs TanStack Start

## Purpose

This document provides a precise, implementation-level comparison between Next.js 16 (App Router) and TanStack Start v1. It is architecture-first, not tutorial-level.

All claims are based on verified framework behavior, not assumptions.

---

## 1. Core Mental Model

| Aspect           | Next.js 16 (App Router)                             | TanStack Start v1                                     |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Component model  | React Server Components (RSC) + Client Components   | Traditional React (SSR-hydrated, no RSC by default)   |
| Routing paradigm | File-based, directory-first, collocated server      | File-based, type-safe client-first router             |
| Server logic     | `"use server"` Server Actions                       | `createServerFn()` – explicit server function calls   |
| Data fetching    | RSC fetch, `use()`, cache                           | TanStack Query + loaders (explicit)                   |
| Middleware       | `middleware.ts` – Edge runtime by default           | `createMiddleware()` – Node, request + function level |
| Build tool       | Turbopack / Webpack                                 | Vite + Vinxi                                          |
| Runtime          | Edge + Node split                                   | Node only (Nitro adapter)                             |
| Caching          | `unstable_cache`, fetch cache, Route Segment Config | TanStack Query (`staleTime`, `gcTime`)                |

---

## 2. Routing

### Next.js App Router

- Routes are directories with special files: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`
- Route groups with `(group)/` prefix
- Dynamic segments with `[param]/` and `[...catchall]/`
- API routes via `route.ts` files in any directory
- Server Components by default; `"use client"` to opt into client

### TanStack Router (TanStack Start routing layer)

- Routes are files in `src/app/routes/`
- `__root.tsx` = global root layout (equivalent to `app/layout.tsx`)
- `index.tsx` = index route at that path level
- `_authed/route.tsx` = layout route with `beforeLoad` guard (underscore prefix = pathless layout route)
- `_public/` = pathless layout for public routes
- Dynamic segments: `$param.tsx` (dollar prefix instead of brackets)
- Catch-all: `$.tsx`
- API routes: any route file can export a server-side handler

**Type safety**: TanStack Router generates a `routeTree.gen.ts` file that provides fully typed `Link`, `useNavigate`, `useParams`, etc. This is a significant advantage over Next.js.

**Key difference**: No `page.tsx` / `layout.tsx` split. Routes export a `Route` object created with `createFileRoute()`. Layout behavior comes from nesting.

```ts
// Next.js (app/dashboard/page.tsx)
export default function DashboardPage() {
  return <Dashboard />
}

// TanStack Start (src/app/routes/_authed/dashboard/index.tsx)
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/dashboard/')({
  loader: async () => {
    // data loading here (runs on server during SSR)
    return { data: await fetchDashboardData() }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { data } = Route.useLoaderData()
  return <Dashboard data={data} />
}
```

---

## 3. Server Logic

### Next.js Server Actions

```ts
// "use server" marks entire module or function as server-only
'use server';

export async function updateUser(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  // ...
}
```

- Invoked implicitly from forms or `action={updateUser}`
- Can be called from Client Components directly
- Transport: POST request to same origin, opaque to developer
- Validation: manual (no built-in schema validator)
- No middleware composition built-in

### TanStack Start Server Functions

```ts
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const updateUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((data: unknown) => z.object({ name: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    // context is typed from middleware chain
    return updateUserInDb(context.session.userId, data);
  });

// Called from client:
await updateUser({ data: { name: 'Alice' } });
```

**Key differences**:

- Explicit `createServerFn` – developer controls the RPC boundary
- Built-in middleware composition via `.middleware([...])`
- Built-in schema validator via `.validator(...)`
- Typed context flows through middleware chain
- Called explicitly from client – no form magic required
- Transport: HTTP POST to auto-generated endpoint

**Architectural implication**: `createSecureServerFn` (replacing `createSecureAction`) becomes a thin wrapper around `createServerFn` with auth, authorization, and audit middleware attached.

---

## 4. Middleware

### Next.js middleware

```ts
// middleware.ts – runs in Edge runtime by default
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // CANNOT use DB – Edge runtime constraint
  // CANNOT use Node.js APIs
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|static).*)', '/api(.*)'],
};
```

**Constraints**:

- Runs on V8 Edge runtime (not Node.js)
- No DB access, no Node.js APIs
- Forces Edge/Node composition root split
- Authentication in middleware = session-only gate (no RBAC)

### TanStack Start middleware

Two distinct middleware types:

**1. Request middleware** (intercepts all server requests):

```ts
import { createMiddleware } from '@tanstack/react-start';

export const headersMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const response = await next();
    response.headers.set('X-Frame-Options', 'DENY');
    return response;
  },
);
```

Registered globally in `src/app/global-middleware.ts`:

```ts
import { registerGlobalMiddleware } from '@tanstack/react-start';
import {
  headersMiddleware,
  rateLimitMiddleware,
} from '@/security/middleware/request';

registerGlobalMiddleware({
  middleware: [headersMiddleware, rateLimitMiddleware],
});
```

**2. Server function middleware** (per-server-function, typed context):

```ts
import { createMiddleware } from '@tanstack/react-start';

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const session = await getSession();
    if (!session) throw new Error('Unauthorized');
    return next({ context: { session } });
  },
);
```

**Key differences from Next.js**:

- Runs on **Node.js** – full DB access available
- No Edge/Node split
- Typed context injection (middleware can add typed fields to context)
- Two levels: request-level AND function-level
- No separate matcher config – function middleware is explicitly composed per function

---

## 5. Data Fetching

### Next.js

- RSC: fetch in component body (cached, deduplicated)
- Route Segment Config: `export const dynamic = 'force-dynamic'`
- `unstable_cache` for deferred invalidation
- TanStack Query available but optional (mostly for client-side)

### TanStack Start

- **Loaders**: `loader()` in route definition (server-side, runs during SSR)
- **TanStack Query**: first-class integration, used for client-side caching and mutations
- `ensureQueryData` in loaders to prime Query cache
- No special cache directives – explicit cache control via Query options

```ts
// Route loader (server-side)
export const Route = createFileRoute('/users/')({
  loader: async ({ context }) => {
    return context.queryClient.ensureQueryData(usersQueryOptions())
  },
  component: UsersPage,
})

// Client query (with cache)
function UsersPage() {
  const { data } = useSuspenseQuery(usersQueryOptions())
  return <UserList users={data} />
}
```

**Implication**: Features using `createSecureAction` for data fetching switch to:

1. Route loaders for initial page data (SSR)
2. `createServerFn` for mutations
3. TanStack Query for client-side caching

---

## 6. Auth Integration

### Next.js + Clerk

- `@clerk/nextjs` wraps middleware, layout, and server actions
- `auth()` in Server Components
- `<ClerkProvider>` in root layout
- Clerk handles sign-in/sign-up UI as hosted pages or `<SignIn />` components
- External auth: Clerk manages users externally; app maps to internal UUIDs

### TanStack Start + Better Auth

- Better Auth is self-hosted (auth data in your own DB)
- `auth.handler` receives all `/api/auth/*` requests
- `auth.$Infer.Session` for TypeScript types
- `getSession()` via Better Auth client or server helper
- No external ID mapping needed – Better Auth creates internal UUIDs directly
- Sign-in/sign-up: custom forms using Better Auth client methods

**Key difference**: Better Auth is framework-agnostic with an official TanStack Start integration (`tanstackStartCookies` plugin). No SDK wrapping middleware, no `ClerkProvider` needed.

```ts
// Better Auth instance (src/modules/auth/lib/auth.ts)
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  plugins: [tanstackStartCookies()],
  emailAndPassword: { enabled: true },
});
```

---

## 7. Environment Variables

| Aspect                  | Next.js                          | TanStack Start (Vite)      |
| ----------------------- | -------------------------------- | -------------------------- |
| Client vars prefix      | `NEXT_PUBLIC_`                   | `VITE_`                    |
| Env validation          | `@t3-oss/env-nextjs`             | `@t3-oss/env-core`         |
| Access pattern (server) | `process.env.VAR`                | `process.env.VAR`          |
| Access pattern (client) | `process.env.NEXT_PUBLIC_VAR`    | `import.meta.env.VITE_VAR` |
| Edge constraint         | Must be declared in `runtimeEnv` | No Edge constraint         |

Migration rule: all `NEXT_PUBLIC_*` vars rename to `VITE_*`. Client code accessing them changes from `process.env.NEXT_PUBLIC_VAR` to `import.meta.env.VITE_VAR`.

---

## 8. Error Handling

### Next.js

- `error.tsx` = error boundary per route segment
- `global-error.tsx` = global fallback
- `not-found.tsx` = 404 handler

### TanStack Start

- `errorComponent` in route definition
- `notFoundComponent` in route definition
- `onError` hook at router level

```ts
export const Route = createFileRoute('/users/')({
  errorComponent: ({ error }) => <ErrorAlert message={error.message} />,
  notFoundComponent: () => <NotFound />,
  component: UsersPage,
})
```

`ErrorBoundary` from React is still usable for client-side boundaries. The `ClientErrorBoundary` component from `src/shared/components/error/` needs minor adaptation (remove `next/*` imports).

---

## 9. Sentry Integration

| Aspect         | Next.js                                | TanStack Start                                      |
| -------------- | -------------------------------------- | --------------------------------------------------- |
| Package        | `@sentry/nextjs`                       | `@sentry/tanstackstart-react@^10.45.0`              |
| Init (server)  | `src/instrumentation.ts`               | `src/app/server.tsx` (Sentry init before app)       |
| Init (client)  | `src/instrumentation-client.ts`        | `src/app/client.tsx` (Sentry init before hydration) |
| Error boundary | `Sentry.ErrorBoundary`                 | `Sentry.ErrorBoundary` (same)                       |
| Source maps    | `withSentryConfig` in `next.config.ts` | Sentry Vite plugin                                  |
| Route capture  | Automatic (Next.js integration)        | Via `tanstackRouterBrowserTracingIntegration`       |

---

## 10. Build Configuration

### Next.js (`next.config.ts`)

```ts
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig = {
  experimental: {
    reactCompiler: true,
  },
}

export default withSentryConfig(nextConfig, { ... })
```

### TanStack Start (`vite.config.ts`)

```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { sentryVitePlugin } from '@sentry/vite-plugin';

export default defineConfig({
  plugins: [
    tanstackStart({
      target: process.env.DEPLOY_TARGET === 'vercel' ? 'vercel' : 'node-server',
    }),
    tsConfigPaths(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
});
```

---

## 11. Testing Infrastructure

| Concern          | Next.js boilerplate               | TanStack Start boilerplate      |
| ---------------- | --------------------------------- | ------------------------------- |
| Unit/integration | Vitest                            | Vitest (same)                   |
| E2E              | Playwright                        | Playwright (same)               |
| Component tests  | `@testing-library/react`          | `@testing-library/react` (same) |
| API mocking      | MSW                               | MSW (same)                      |
| Auth mocking     | `@clerk/nextjs` mocks             | Better Auth session mocks       |
| Next.js mocks    | `next/headers`, `next/navigation` | Removed (no Next.js deps)       |
| Setup            | `tests/setup.tsx`                 | Same pattern, adapted imports   |

---

## 12. Key Architectural Improvements

### Problem eliminated: Edge/Node composition root split

The most architecturally complex constraint in the Next.js boilerplate (`docs/architecture/15`) **disappears entirely**:

| Issue                                          | Next.js                                 | TanStack Start                        |
| ---------------------------------------------- | --------------------------------------- | ------------------------------------- |
| Edge runtime limitation                        | Middleware cannot use DB                | No Edge runtime – full Node.js access |
| Edge composition root                          | `createEdgeRequestContainer()` required | Not needed                            |
| withAuth `enforceResourceAuthorization: false` | Required in middleware                  | Not needed – full RBAC in middleware  |
| DB-backed auth gate in middleware              | Impossible                              | Trivially possible                    |

### Problem eliminated: External ID mapping complexity

| Issue                           | Next.js + Clerk                          | TanStack Start + Better Auth               |
| ------------------------------- | ---------------------------------------- | ------------------------------------------ |
| External auth provider          | Clerk (external, opaque IDs)             | Better Auth (self-hosted, internal UUIDs)  |
| Identity mapping table          | `auth_user_identities` required          | Not needed                                 |
| Tenant identity mapping         | `auth_tenant_identities` required        | Not needed                                 |
| `DrizzleInternalIdentityLookup` | Required for every auth check            | Not needed                                 |
| Provisioning complexity         | High (write-path + read-path separation) | Low (Better Auth owns the identity record) |

### New capability: Typed middleware context

TanStack Start's server function middleware injects typed context through the chain:

```ts
// Auth middleware injects { session: Session }
// Authorization middleware adds { authorized: true, permissions: string[] }
// Both are typed at the handler level – compile-time safety
handler: async ({ context }) => {
  context.session.userId; // ✅ typed
  context.permissions; // ✅ typed
};
```

This is impossible in Next.js Server Actions without manual dependency injection.

---

## 13. What Does NOT Change

- Modular monolith layer model
- DI container (`src/core/container/index.ts`)
- All contracts (`src/core/contracts/`)
- Authorization domain logic (PolicyEngine, ABAC)
- Drizzle repositories
- DB schema and migrations
- Rate limiting (Upstash HTTP SDK)
- Security business logic (SSRF protection, audit logging, replay protection)
- RBAC/ABAC readiness
- Tenancy readiness
- Feature flag discipline
- Pino server logger
- Tailwind CSS
- ESLint flat config
- Prettier
- Commitlint / semantic-release
