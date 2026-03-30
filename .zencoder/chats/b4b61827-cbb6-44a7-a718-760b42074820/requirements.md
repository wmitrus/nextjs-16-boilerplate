# TanStack Start Boilerplate – Migration PRD

## 1. Background

This document defines the product requirements for a **new TanStack Start boilerplate** that mirrors the production-grade modular monolith architecture currently implemented in the Next.js 16 boilerplate.

The goal is NOT a runtime migration of the Next.js app. The goal is a **parallel design artifact**: a new standalone boilerplate using TanStack Start as the framework while preserving all architectural principles from the current codebase.

---

## 2. Primary Goals

1. Produce a production-grade TanStack Start boilerplate.
2. Preserve the **modular monolith architecture** with the same layer model.
3. Preserve **DI discipline** and composition root patterns.
4. Preserve **security-by-default** posture adapted for TanStack Start runtime constraints.
5. Preserve **RBAC/ABAC readiness**, **tenancy readiness**, and **feature flag discipline**.
6. Preserve **testing infrastructure** quality (unit / integration / e2e).
7. Preserve **observability** via Sentry + structured logging.
8. The migration plan must be **feature-by-feature**, in logical dependency order.
9. Each feature phase must be independently reviewable and testable.

---

## 3. Scope

### In Scope

- Full feature-by-feature migration plan documented in `docs/tanstack-migration/`
- Architectural redesign for TanStack Start framework constraints
- Re-mapping of each layer (`core`, `modules`, `security`, `features`, `shared`, `app`) to TanStack Start equivalents
- Auth integration with **Better Auth** (framework-agnostic, Drizzle adapter)
- DB layer (Drizzle ORM – framework-agnostic, high reuse)
- Security pipeline redesign (replacing Next.js middleware with TanStack Start middleware)
- Environment config redesign (`@t3-oss/env-core` with Vite)
- Rate limiting, logging, error handling
- Testing infrastructure
- CI/CD pipelines
- Storybook integration

### Out of Scope

- Actual code implementation (plan only – docs creation comes after approval)
- Migration of Next.js-specific features with no TanStack Start equivalent (RSC, PPR, Cache Components, Edge runtime)
- Deploying both frameworks simultaneously in a single project

---

## 4. Framework Context: TanStack Start – Verified Facts

**Package**: `@tanstack/react-start`
**Latest version**: `1.167.3` (dist-tag: `latest`)
**Status**: **Release Candidate** – feature-complete, API stable per official docs.
**Build tool**: Vite + Vinxi
**Routing**: TanStack Router

> Official statement: _"TanStack Start is currently in the Release Candidate stage! This means it is considered feature-complete and its API is considered stable. The road to v1 will likely be a quick one."_

**Decision**: Build on `@tanstack/react-start@^1` (latest). This is the correct version. v0.x is obsolete. There is no planned v2 yet.

### Key architectural differences from Next.js 16

| Concern         | Next.js 16                            | TanStack Start                                                         |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Routing         | App Router (file-based, RSC)          | TanStack Router (file-based, type-safe, client-first)                  |
| Server logic    | Server Actions (`use server`)         | Server Functions (`createServerFn`)                                    |
| Middleware      | `middleware.ts` (Edge runtime)        | `createMiddleware()` – composable, works at request AND function level |
| Data fetching   | RSC, `fetch` w/ cache                 | TanStack Query + loader functions                                      |
| Runtime         | Edge + Node split                     | Node only (Nitro; no separate Edge runtime split)                      |
| Component model | Server Components + Client Components | Traditional React (SSR-hydrated, no RSC by default)                    |
| Build           | Turbopack / Next.js                   | Vite + Vinxi                                                           |
| Env variables   | `NEXT_PUBLIC_` prefix                 | `VITE_` prefix for client vars                                         |
| Auth SDK        | `@clerk/nextjs`                       | Better Auth (self-hosted)                                              |
| Error tracking  | `@sentry/nextjs`                      | `@sentry/tanstackstart-react` v10.45.0                                 |
| Deployment      | Vercel-optimized                      | Multi-target (Vercel, Node, Cloudflare, Railway, Netlify, ...)         |

---

## 5. Resolved Blocking Points

### BP-01 – Deployment: **Vercel + Node.js (both)**

**Decision**: The boilerplate will support both Vercel and self-hosted Node.js.

**Architecture impact**: **Zero**. TanStack Start's architecture is identical for both targets. The only difference is the `vite.config.ts` preset:

```ts
// Node.js (self-hosted / Docker / Railway)
tanstackStart({ target: 'node-server' });

// Vercel
tanstackStart({ target: 'vercel' });
```

All server functions, middleware, DB, and security code are **100% identical** between both targets. The boilerplate will use an environment variable or build flag to switch the deployment target. No architectural overhead.

**Constraints analysis by target**:

| Concern          | Vercel                                      | Node.js self-hosted             |
| ---------------- | ------------------------------------------- | ------------------------------- |
| DB connections   | Connection pooling recommended (serverless) | Persistent connection pool fine |
| Rate limiting    | Upstash Redis (HTTP, works serverless)      | Upstash OR in-memory fallback   |
| Middleware       | Works identically                           | Works identically               |
| Server functions | Works identically                           | Works identically               |
| Cold starts      | Yes (serverless functions)                  | No (long-running process)       |
| Config change    | `target: 'vercel'`                          | `target: 'node-server'`         |

**Conclusion**: Design once, switch with one config line. No design-level duplication needed.

---

### BP-02 – SSR Mode: **SSR (Standard, Default)**

**Decision**: Standard SSR mode (TanStack Start default). SPA mode is documented as an option but NOT the default.

**Critical clarification**: The user's concern about "not production ready" was about **React Server Components (RSC)**, which TanStack Start is still adding. This is NOT about SSR itself.

**Verified facts from official docs**:

- TanStack Start does **full-document SSR** (server renders HTML, client hydrates)
- This is production-ready and the default
- RSC (React Server Components like Next.js App Router) is NOT yet available but is being added
- TanStack Start uses **traditional React components** – they SSR and hydrate, and use state/effects/event handlers normally
- This is exactly what "React app not server app" means: **no RSC paradigm**, not "no server"

**What "React app not server app" means in practice**:

- Components work like normal React (state, effects, hooks work by default)
- No `"use client"` annotation required everywhere
- No RSC boundaries to manage
- Server functions (`createServerFn`) handle the server-side operations explicitly
- The mental model is: **React app + server functions**, not **server components + client islands**

**SPA mode** (optional, documented):

- No SSR – static HTML shell, all rendering client-side
- Server functions and API routes still work (it's only the document rendering that's client-side)
- Good for internal apps where SEO doesn't matter
- The boilerplate will document how to enable SPA mode but default to SSR

---

### BP-03 – Auth Provider: **Better Auth**

**Decision**: Better Auth (user-confirmed).

**Verified package details**:

- Package: `better-auth`
- Version: `1.5.6` (stable)
- Official TanStack Start integration: **built into Better Auth** (`tanstackStartCookies` plugin)
- **Listed in `npm create @tanstack/start` as first-class option**
- Drizzle ORM adapter: **available natively**
- Cookie handling for TanStack Start: `import { tanstackStartCookies } from 'better-auth/tanstack-start'`

**Architecture impact**:

- No vendor lock-in (Clerk was a SaaS; Better Auth is self-hosted)
- Auth tables managed in the same DB via Drizzle adapter
- No external API calls for auth (only OAuth providers if used)
- `modules/auth` module redesign: Clerk adapter → Better Auth adapter
- Session-based auth (HTTP-only cookies) instead of Clerk JWT sessions
- Bootstrap route concept preserved but simpler (no external provisioning)

**Note**: This means the "provisioning" module in Next.js (complex because of Clerk external identity mapping) becomes simpler. Internal identity is managed directly by Better Auth + our Drizzle schema.

---

### BP-04 – Sentry: **`@sentry/tanstackstart-react`**

**Decision**: Use official Sentry TanStack Start SDK.

**Verified package details**:

- Package: `@sentry/tanstackstart-react`
- Version: `10.45.0` (published 2026-03-19 – 4 days ago, very active)
- Official Sentry SDK, maintained by Sentry Bot
- Sentry is an **official partner** of TanStack Start (listed on their hosting/observability page)

**Integration approach from official TanStack Start docs**:

```ts
// Client-side: @sentry/react
// Server functions: @sentry/node
// Framework integration: @sentry/tanstackstart-react
```

No manual setup needed. Use the official SDK.

---

### BP-05 – Storybook: **Yes, included**

**Decision**: Include Storybook.

**Package**: `@storybook/react-vite` (works with Vite-based projects)
TanStack Start is Vite-based. Integration is clean and straightforward.

---

### BP-06 – TanStack Start Version: **v1 RC (latest)**

**Decision**: Build on `@tanstack/react-start@^1` (`latest` dist-tag = `1.167.3`).

**Verified facts**:

- `latest` npm dist-tag points to `1.167.3` (NOT v0.x)
- v0.x was beta, now obsolete (`beta` dist-tag = `0.0.1-beta.204`)
- v1 RC = feature-complete, API stable
- Active development: SSR throughput improved 5x (blog post March 17, 2026)
- Safe to build on. Minor breaking changes may occur before v1 stable, but the boilerplate will pin to `^1` and document upgrade process

---

## 6. Core Architecture Preservation

### 6.1 Layer Model (preserved)

The same layer model MUST be preserved in TanStack Start:

```
src/app      → delivery layer (routes, layouts, pages)
src/core     → contracts, DI container, env, logger, stable foundation
src/features → product-facing composition slices
src/modules  → isolated business/integration modules
src/security → centralized security runtime and enforcement
src/shared   → neutral reusable building blocks
src/testing  → shared testing infrastructure
```

### 6.2 Dependency Direction (preserved)

```
app → features/modules/security/shared/core
features → modules/security/shared/core
modules → shared/core
security → shared/core
core → (no upward dependencies)
```

### 6.3 DI / Composition Root (preserved)

The custom `Container` class (`src/core/container/index.ts`) is framework-agnostic and **reused as-is**.

Composition roots adapt to TanStack Start:

- **Next.js**: `middleware.ts` (edge) + `getAppContainer()` (node)
- **TanStack Start**: Request middleware (global gate) + route `beforeLoad` (per-route auth) + `createServerFn` middleware chain (action scope)

---

## 7. Security Pipeline Redesign

### 7.1 Key Discovery: TanStack Start has a proper middleware system

**This is not a downgrade from Next.js middleware – it is an upgrade.**

TanStack Start's `createMiddleware()` is composable and works at two levels:

1. **Request middleware** – intercepts all server requests (SSR + API + server functions)
2. **Server function middleware** – attaches to specific `createServerFn` calls, can inject typed context

This maps naturally to the security pipeline:

| Next.js Proxy Pipeline                      | TanStack Start Equivalent                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `proxy.ts` (edge middleware)                | Request middleware (`createMiddleware`)                                   |
| Route classification                        | Route group files + middleware selectors                                  |
| Security headers (`withHeaders`)            | Request middleware (`headersMiddleware`)                                  |
| Internal API guard (`withInternalApiGuard`) | Request middleware or server route handler                                |
| Rate limiting (`withRateLimit`)             | Request middleware (`rateLimitMiddleware`)                                |
| Auth session gate (`withAuth`)              | Route `beforeLoad` + `ensureSession` server fn                            |
| Provisioning readiness gate                 | Route `beforeLoad` + `ensureProvisioned` server fn                        |
| `createSecureAction` wrapper                | `createServerFn` + middleware chain (`authMiddleware`, `auditMiddleware`) |

### 7.2 Security pipeline implementation pattern

```ts
// Global request middleware (security/middleware/logging.ts)
const loggingMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const start = Date.now();
    const result = await next();
    // log duration, status, path
    return result;
  },
);

// Auth middleware for server functions (security/middleware/auth.ts)
const authMiddleware = createMiddleware({ type: 'function' })
  .middleware([loggingMiddleware])
  .server(async ({ next }) => {
    const session = await getSession();
    if (!session) throw new Error('Unauthorized');
    return next({ context: { session } });
  });

// Usage on server function
export const updateSettings = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, auditMiddleware])
  .validator(schema)
  .handler(async ({ data, context }) => {
    // context.session is typed
  });
```

### 7.3 No Edge/Node split

The Next.js Edge vs Node boundary **collapses** in TanStack Start. Everything runs in Node/Nitro. This simplifies the architecture significantly:

- No separate edge composition root
- No separate edge logger
- DB-backed authorization can run at any point (no restriction)
- No need for `enforceResourceAuthorization: false` pattern in middleware

---

## 8. Auth Integration: Better Auth

### 8.1 Better Auth architecture

```ts
// src/modules/auth/lib/auth.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    /* optional */
  },
  plugins: [tanstackStartCookies()], // must be last
});
```

### 8.2 Route protection pattern

```ts
// Using beforeLoad in route definitions
export const Route = createFileRoute('/app/_layout')({
  beforeLoad: async () => {
    const session = await ensureSession(); // createServerFn that throws if no session
    return { session };
  },
});
```

### 8.3 Server function auth pattern

```ts
export const protectedAction = createServerFn({ method: 'POST' })
  .middleware([authMiddleware]) // injects context.session
  .validator(schema)
  .handler(async ({ data, context }) => {
    // context.session.user.id available
  });
```

### 8.4 Auth route handler

```ts
// src/app/routes/api/auth/$.ts
import { auth } from '@/modules/auth/lib/auth';

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => auth.handler(request),
      POST: async ({ request }) => auth.handler(request),
    },
  },
});
```

---

## 9. Environment Variables

- `@t3-oss/env-nextjs` → **`@t3-oss/env-core`** (framework-agnostic, works with Vite)
- Client-side env: `VITE_` prefix instead of `NEXT_PUBLIC_`
- Server-side env: same approach, validated at startup via `createEnv({ server: {...}, client: {...} })`

---

## 10. DB Layer

- **Drizzle ORM**: fully framework-agnostic, **reused as-is**
- **Better Auth Drizzle adapter**: `drizzleAdapter(db, { provider: 'pg' })` - manages auth tables automatically
- **PGLite**: used for dev/test (same pattern)
- **Postgres**: production driver (same)
- **Migrations**: Drizzle Kit (same)
- DB schema files can be largely copied; Better Auth adds its own managed schema

---

## 11. Testing

| Suite       | Next.js                  | TanStack Start                |
| ----------- | ------------------------ | ----------------------------- |
| Unit        | Vitest                   | Vitest (same)                 |
| Integration | Vitest + RTL + MSW       | Vitest + RTL + MSW (adjusted) |
| E2E         | Playwright               | Playwright (same)             |
| Storybook   | `@storybook/nextjs-vite` | `@storybook/react-vite`       |

**Testing infra changes**:

- Remove all `next/*` mocks (`next/headers`, `next/navigation`, `next/image`)
- Add TanStack Router mock utilities
- `createServerFn` is testable in Node context without a running server
- Better Auth provides test utilities for session mocking

---

## 12. Observability

- **Sentry**: `@sentry/tanstackstart-react` v10.45.0 (official SDK, use it)
- **Pino**: framework-agnostic, server logger reused (simplified: no edge logger needed)
- **Logflare**: same pattern, adapted for TanStack Start server routes

---

## 13. CI/CD

- Most GitHub Actions workflows reusable with minor command changes
- `pnpm build`, `pnpm dev`, `pnpm typecheck`, `pnpm lint`, `pnpm test` commands preserved
- Playwright E2E flow unchanged
- Vercel + Node.js deployments both covered by same codebase, different `TARGET` env var

---

## 14. Confirmed Technology Stack

| Concern            | Choice                        | Version            | Notes                                  |
| ------------------ | ----------------------------- | ------------------ | -------------------------------------- |
| Framework          | TanStack Start                | `^1.167.3` (RC)    | Latest stable, build on it             |
| Router             | TanStack Router               | bundled with Start |                                        |
| Build              | Vite + Vinxi                  | via Start          |                                        |
| ORM                | Drizzle                       | reused             | Framework-agnostic                     |
| Auth               | Better Auth                   | `^1.5.6`           | Drizzle adapter, TanStack Start plugin |
| Error tracking     | `@sentry/tanstackstart-react` | `^10.45.0`         | Official SDK                           |
| Rate limiting      | Upstash Redis                 | reused             | Framework-agnostic HTTP SDK            |
| Logging            | Pino                          | reused, simplified | No edge variant needed                 |
| CSS                | Tailwind CSS 4                | reused             | Framework-agnostic                     |
| Testing (unit/int) | Vitest + RTL + MSW            | reused             | Adjusted setup                         |
| Testing (e2e)      | Playwright                    | reused             | Same                                   |
| Storybook          | `@storybook/react-vite`       | latest             | Vite-native                            |
| Commits            | Conventional Commits          | reused             | Same tooling                           |
| Release            | Semantic Release              | reused             | Same tooling                           |
| Env management     | `@t3-oss/env-core`            | latest             | Non-Next.js adapter                    |
| DI Container       | Custom Container class        | reused             | Framework-agnostic                     |
| RBAC/ABAC model    | Preserved                     | –                  | Domain logic unchanged                 |
| Tenancy model      | Preserved                     | –                  | Same invariants                        |
| Deployment         | Vercel + Node.js              | –                  | Single codebase, config preset         |

---

## 15. Remaining Open Points (Non-Blocking)

These can be decided during spec writing, not blockers:

1. **Better Auth plugin selection**: Which Better Auth plugins to include by default? (email/password is baseline; OAuth providers are optional)
2. **SPA mode documentation**: How detailed to make the SPA mode switch guide?
3. **Multi-tenant Better Auth strategy**: Better Auth has organization plugin – evaluate if it fits the tenancy model or if we keep custom implementation
4. **DB connection pooling for Vercel**: PgBouncer vs direct Postgres vs Neon HTTP driver for serverless

---

## 16. All Blocking Points – RESOLVED

| ID    | Question               | Resolution                                                                                         |
| ----- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| BP-01 | Deployment target      | **Vercel + Node.js both**. Same architecture, config-only difference. Zero overhead.               |
| BP-02 | SPA vs SSR             | **SSR (default)**. This is production-ready. "Not RSC" ≠ "not SSR". SPA mode documented as option. |
| BP-03 | Auth provider          | **Better Auth** (confirmed by user). v1.5.6, official TanStack Start support.                      |
| BP-04 | Sentry                 | **`@sentry/tanstackstart-react` v10.45.0**. Official SDK, published March 19 2026.                 |
| BP-05 | Storybook              | **Yes**, `@storybook/react-vite`.                                                                  |
| BP-06 | TanStack Start version | **v1 RC** (`1.167.3`). `latest` npm tag. Build on it now.                                          |
