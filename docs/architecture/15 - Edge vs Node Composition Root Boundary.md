# 15 - Edge vs Node Composition Root Boundary

## Purpose

This document is the architecture-level source of truth for runtime boundaries in this repository.

It defines where security checks may run, where DB-backed authorization is allowed, and which composition root must be used in each runtime.

## Non-negotiable boundary

- Edge middleware must not initialize or use DB runtime.
- DB-backed RBAC/ABAC authorization must run only in Node runtime.

## Composition roots

### Edge composition root

- Entry point: `getEdgeContainer()`
- Used by: `src/proxy.ts` middleware flow
- Allowed dependencies:
  - identity provider
  - tenant resolver
  - user repository (for onboarding checks)
- Forbidden dependencies:
  - DB runtime
  - authorization service backed by Drizzle/Postgres/PGLite

### Node composition root

- Entry point: `getAppContainer()`
- Used by: server actions, route handlers, server-only services
- Allowed dependencies:
  - DB runtime via process-scope infrastructure
  - authorization service and policy engine
  - full RBAC/ABAC checks

## Why this boundary exists

- Next middleware executes in Edge runtime by default.
- DB clients used in this app are not a valid middleware strategy for Edge runtime.
- Running DB-backed authorization in middleware causes runtime failures and architecture drift.

## Security responsibility split

### Edge middleware responsibilities

- request classification
- internal API guard
- rate limiting
- authentication gate (signed in vs not signed in)
- onboarding redirects

### Node responsibilities

- resource-level authorization (`AuthorizationService`, policies, ABAC attributes)
- domain security decisions requiring persistence

## Required implementation rules

1. `src/proxy.ts` must resolve dependencies from `getEdgeContainer()` only.
2. `withAuth` in middleware must run with `enforceResourceAuthorization: false`.
3. No middleware code may resolve `AUTHORIZATION.SERVICE`.
4. Resource-level authorization must be executed in Node flows (`secure-action`, route handlers, server-side orchestration).
5. Process-scope DB runtime lifecycle remains centralized in `src/core/runtime/infrastructure.ts`.

## Forbidden patterns

- Using `getAppContainer()` directly in middleware.
- Importing or resolving `AUTHORIZATION.SERVICE` in Edge middleware composition.
- Creating DB clients/pools per middleware request.
- Moving policy decisions into `proxy.ts` to "save one server call".

## Validation gates for this boundary

- Runtime guard tests:
  - `src/proxy.edge-composition.test.ts`
  - `src/testing/integration/proxy-runtime.integration.test.ts`
- Auth middleware tests:
  - `src/security/middleware/with-auth.test.ts`
  - `src/testing/integration/middleware.test.ts`
- Static gates:
  - `pnpm typecheck`
  - `pnpm madge`
  - `pnpm test`

## Extension rule

Any new security feature must first decide runtime placement:

- If it needs DB/policy/tenant attributes from persistence -> Node only.
- If it is request-level gate/headers/rate/internal-key -> Edge middleware is valid.

If uncertain, default to Node and keep middleware minimal.
