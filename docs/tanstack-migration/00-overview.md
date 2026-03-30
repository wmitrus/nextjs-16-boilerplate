# TanStack Start Boilerplate – Overview

## Purpose

This document suite defines the architecture, design decisions, and implementation plan for a **TanStack Start boilerplate** that preserves the production-grade modular monolith principles from the existing Next.js 16 boilerplate.

This is **not a migration of the Next.js app**. It is a **parallel boilerplate** using TanStack Start as the delivery framework while keeping all business domain, authorization, and infrastructure logic intact.

---

## Goals

1. Production-grade TanStack Start boilerplate, usable as a foundation for multiple production projects.
2. Preserve the **modular monolith layer model** – same 6-layer structure.
3. Preserve **DI discipline** and composition root patterns.
4. Preserve **security-by-default** posture adapted for TanStack Start runtime constraints.
5. Preserve **RBAC/ABAC readiness**, **tenancy readiness**, and **feature flag discipline**.
6. Preserve **testing infrastructure** quality (unit / integration / e2e).
7. Preserve **observability** via Sentry + structured logging.
8. Feature-by-feature build plan in logical dependency order.
9. Each feature phase independently reviewable and testable.

---

## Technology Stack

| Concern                | Decision                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| Framework              | `@tanstack/react-start@^1` (v1 RC, `latest` = `1.167.3`)           |
| Router                 | TanStack Router (bundled with Start)                               |
| Build                  | Vite + Vinxi                                                       |
| Language               | TypeScript strict                                                  |
| Runtime                | Node.js 24                                                         |
| Package manager        | pnpm                                                               |
| ORM                    | Drizzle ORM (reused from Next.js boilerplate)                      |
| Auth                   | Better Auth `^1.5.6`                                               |
| Error tracking         | `@sentry/tanstackstart-react@^10.45.0`                             |
| Rate limiting          | Upstash Redis (HTTP SDK – reused)                                  |
| Logging                | Pino (reused, simplified – no edge variant)                        |
| CSS                    | Tailwind CSS 4 (reused)                                            |
| Env config             | `@t3-oss/env-core` (replaces `@t3-oss/env-nextjs`)                 |
| Unit/integration tests | Vitest + RTL + MSW                                                 |
| E2E tests              | Playwright                                                         |
| Storybook              | `@storybook/react-vite`                                            |
| Deployment             | Vercel + Node.js (config-only switch, zero architectural overhead) |

---

## Framework Status

**`@tanstack/react-start@^1`** is the correct build target.

> Official statement: _"TanStack Start is currently in the Release Candidate stage! This means it is considered feature-complete and its API is considered stable. The road to v1 will likely be a quick one."_

- v0.x is obsolete
- v1 RC = API stable, feature-complete
- No planned v2 yet

---

## What Changes vs Next.js Boilerplate

### Layer model: unchanged

```
src/app/          → delivery layer (TanStack Router routes, layouts)
src/core/         → contracts, DI container, env, logger, stable foundation
src/features/     → product-facing composition slices
src/modules/      → isolated business/integration modules
src/security/     → centralized security middleware and enforcement
src/shared/       → neutral reusable building blocks
src/testing/      → shared testing infrastructure
```

### Dependency direction: unchanged

```
app → features/modules/security/shared/core
features → modules/security/shared/core
modules → shared/core
security → shared/core
core → (no upward dependencies)
```

### What is reused without changes

- `src/core/container/` – DI container class (framework-agnostic)
- `src/core/contracts/` – All contracts (authorization, identity, tenancy, repos, etc.)
- `src/modules/authorization/` – Full domain logic (PolicyEngine, ABAC conditions)
- `src/modules/*/infrastructure/drizzle/` – All Drizzle repositories
- `src/core/db/` – DB layer (drivers, migrations, schema)
- `src/shared/lib/rate-limit/` – Rate limit logic (HTTP SDK)
- `src/shared/utils/` – Utility functions

### What is significantly adapted

| What                                       | Why                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/core/env.ts`                          | `@t3-oss/env-nextjs` → `@t3-oss/env-core`; `NEXT_PUBLIC_` → `VITE_` prefix           |
| `src/core/logger/`                         | Remove edge variant (`edge.ts`, `edge-utils.ts`). No edge runtime in TanStack Start. |
| `src/core/runtime/bootstrap.ts`            | No edge composition root. Single unified bootstrap.                                  |
| `src/modules/auth/`                        | Clerk adapters → Better Auth adapters                                                |
| `src/modules/provisioning/infrastructure/` | Simplified: no external ID mapping tables (Better Auth manages identity natively)    |
| `src/security/`                            | `proxy.ts` (Edge middleware) → `createMiddleware()` request + function middleware    |
| `src/testing/infrastructure/`              | Remove `next/*` mocks, add Better Auth mocks, adapt for `createMiddleware`           |

### What is deleted

- `src/proxy.ts` – Edge middleware. Replaced by `createMiddleware()`.
- `src/instrumentation.ts` / `src/instrumentation-client.ts` – Replaced by Sentry TanStack Start SDK.
- `src/core/logger/edge.ts`, `edge-utils.ts`, `di-edge.ts` – No edge runtime.
- `src/core/runtime/edge.ts` – No edge composition root.
- `src/security/rsc/` – No RSC in TanStack Start.
- All Clerk-specific auth adapters.

### What is new

- `vite.config.ts` – Replaces `next.config.ts`
- `src/app/routes/` – TanStack Router file-based routes
- `src/app/client.tsx` / `src/app/server.tsx` – Hydration entry points
- `src/app/global-middleware.ts` – Global middleware registration
- `src/modules/auth/lib/auth.ts` – Better Auth instance
- `src/security/middleware/request/` – Request-level middleware (global)
- `src/security/middleware/function/` – Server function middleware (per-action)
- `src/security/actions/secure-server-fn.ts` – `createSecureServerFn` wrapper

---

## Deployment Strategy

Both deployment targets are supported from the **same codebase**. Only `vite.config.ts` differs:

```ts
// Node.js (self-hosted / Docker / Railway)
tanstackStart({ target: 'node-server' });

// Vercel
tanstackStart({ target: 'vercel' });
```

All server functions, middleware, DB, and security code are **100% identical** between both targets.

| Concern          | Vercel                                | Node.js self-hosted           |
| ---------------- | ------------------------------------- | ----------------------------- |
| DB connections   | Connection pooling recommended        | Persistent pool fine          |
| Rate limiting    | Upstash Redis (HTTP, serverless-safe) | Upstash or in-memory fallback |
| Middleware       | Identical                             | Identical                     |
| Server functions | Identical                             | Identical                     |
| Cold starts      | Yes (serverless)                      | No (long-running process)     |

---

## SSR Mode

**Standard SSR** (default). TanStack Start renders HTML on the server; the client hydrates.

This is **production-ready** and is TanStack Start's default mode.

**Not included**: React Server Components (RSC). TanStack Start is still adding RSC support. This boilerplate does NOT use RSC. All components are traditional React (SSR-hydrated).

**SPA mode** is documented as an option but is NOT the default. SPA mode loses `createServerFn`, Nitro middleware, and server-side auth enforcement – it weakens the security posture significantly and is only suitable for fully client-side internal tools.

---

## Build Phases (Dependency Order)

| Phase | Document                     | What it covers                                         |
| ----- | ---------------------------- | ------------------------------------------------------ |
| 1     | `02-foundation.md`           | Scaffold, Vite config, tooling, TypeScript, env        |
| 2     | `03-core-layer.md`           | Core layer (DI, contracts, env, logger)                |
| 3     | `04-db-layer.md`             | DB layer (Drizzle, drivers, migrations)                |
| 4     | `05-auth-module.md`          | Better Auth module (auth instance, session, API route) |
| 5     | `06-security-layer.md`       | Security pipeline (createMiddleware, secure-server-fn) |
| 6     | `07-authorization-module.md` | Authorization (RBAC/ABAC – domain logic reused)        |
| 7     | `08-provisioning-module.md`  | Provisioning (simplified vs Next.js)                   |
| 8     | `09-features.md`             | Features (user-management, security-showcase)          |
| 9     | `10-observability.md`        | Sentry + Pino logging                                  |
| 10    | `11-testing.md`              | Testing infrastructure                                 |
| 11    | `12-cicd.md`                 | CI/CD pipelines                                        |
| 12    | `13-storybook.md`            | Storybook integration                                  |
| 13    | `14-feature-flags.md`        | Feature flags readiness seams                          |
| 14    | `15-tenancy.md`              | Multi-tenancy readiness seams                          |

---

## Key Architectural Wins vs Next.js

### No Edge/Node split

The most complex architectural constraint in the Next.js boilerplate is the **Edge vs Node composition root boundary** (`docs/architecture/15`). Edge middleware cannot use DB, so the Node auth checks had to be deferred.

TanStack Start runs entirely on **Node.js**. There is no Edge runtime split. The full authorization stack (DB-backed RBAC/ABAC) can run in middleware if needed. The Edge composition root (`createEdgeRequestContainer`) disappears entirely.

### Better Auth eliminates external ID mapping complexity

In the Next.js boilerplate, Clerk is an external auth provider with opaque external user IDs. This requires:

- `auth_user_identities` table mapping `(provider, external_id) → internal UUID`
- `auth_tenant_identities` table for tenant mapping
- Complex `DrizzleInternalIdentityLookup` for read-path
- Complex `ProvisioningService` write-path to create identities on first login

Better Auth manages identity natively with an internal DB. It creates UUIDs directly. The external ID mapping tables and the `DrizzleInternalIdentityLookup` complexity **disappear**. Provisioning is significantly simplified.

### `createMiddleware()` is architecturally superior for this use case

TanStack Start's `createMiddleware()` works at two levels:

1. **Request middleware** – intercepts all server traffic (global gate)
2. **Server function middleware** – attaches to `createServerFn`, injects typed context

This maps cleanly onto the current security model without the Edge/Node split compromise. The `createSecureAction` wrapper is replaced by `createSecureServerFn` which composes middleware directly.

---

## Documents in This Suite

- [`00-overview.md`](./00-overview.md) – This document
- [`01-framework-comparison.md`](./01-framework-comparison.md) – Detailed Next.js vs TanStack Start diff
- [`02-foundation.md`](./02-foundation.md) – Phase 1: Scaffold, tooling, env
- [`03-core-layer.md`](./03-core-layer.md) – Phase 2: Core layer
- [`04-db-layer.md`](./04-db-layer.md) – Phase 3: DB layer
- [`05-auth-module.md`](./05-auth-module.md) – Phase 4: Better Auth
- [`06-security-layer.md`](./06-security-layer.md) – Phase 5: Security redesign
- [`07-authorization-module.md`](./07-authorization-module.md) – Phase 6: Authorization
- [`08-provisioning-module.md`](./08-provisioning-module.md) – Phase 7: Provisioning
- [`09-features.md`](./09-features.md) – Phase 8: Features
- [`10-observability.md`](./10-observability.md) – Phase 9: Observability
- [`11-testing.md`](./11-testing.md) – Phase 10: Testing
- [`12-cicd.md`](./12-cicd.md) – Phase 11: CI/CD
- [`13-storybook.md`](./13-storybook.md) – Phase 12: Storybook
- [`14-feature-flags.md`](./14-feature-flags.md) – Phase 13: Feature flags
- [`15-tenancy.md`](./15-tenancy.md) – Phase 14: Tenancy
- [`BLOCKING-POINTS.md`](./BLOCKING-POINTS.md) – Live blocking point log
