# Validation Risk Assessment

**Branch**: `feat/drizzle`  
**Assessed by**: Validation Strategy Agent  
**Date**: 2026-03-24

---

## Overall Risk Classification: ELEVATED

This is a large-scope foundational branch introducing:

- The entire Drizzle ORM infrastructure
- The full auth module (Clerk, AuthJS stubs, Supabase stubs)
- Full RBAC/ABAC domain (Authorization Service, Policy Engine, Drizzle repositories)
- Security middleware pipeline
- Provisioning module
- Testing infrastructure

The scope is high but the design discipline is strong.

---

## Risk Dimensions

### 1. Auth / Trust Boundaries / Tenancy — ELEVATED RISK

**Findings**:

- Auth module introduces multi-provider architecture (Clerk, AuthJS, Supabase) with request-scoped identity sources
- `proxy.ts` Clerk path and non-Clerk path both produce security pipelines — branching logic is correct but non-Clerk paths use stub providers
- `withAuth` middleware has complex routing logic: auth-route redirect, onboarding enforcement, unauthenticated gate, E2E bypass, ABAC resource authorization
- E2E bypass (`env.E2E_ENABLED`) is guarded — only bypasses `/users` and `/e2e-error` routes, not all routes
- Tenant resolution is multi-mode: `single`, `personal`, `org` — correct error handling for missing context
- SecurityContext `ReadinessStatus` model is explicit and complete
- Bootstrap flow correctly handles `UserNotProvisionedError` without leaking to error pages
- Clerk redirect URL normalization prevents open redirect via cross-origin rejection

**Risk factors**:

- AuthJS and Supabase adapters are stubs — not safe for production use with those providers
- `enforceResourceAuthorization: false` at Edge level means ABAC is deferred to Node (correct by design, but Edge does NOT enforce ABAC)
- `node-provisioning-runtime.ts` is 0% covered

**Verdict**: Acceptable for Clerk production deployment. AuthJS and Supabase providers must not be used in production without full implementation.

---

### 2. Module Boundaries / DI Composition — LOW RISK

**Findings**:

- `skott` analysis found zero circular dependencies across 371 files
- Dependency direction: `app → features/modules/security/shared/core` — verified
- `auth/index.ts` correctly imports from `modules/provisioning` (cross-module composition in auth module is explicit, not leaked)
- `Container` class: clean value/factory/singleton pattern
- DI keys (`AUTH.*`, `INFRASTRUCTURE.*`) centralized in `src/core/contracts/`
- `createAuthModule()` uses `Module.register()` pattern — no hidden service locator

**Risk factors**:

- `auth/index.ts` imports directly from `modules/provisioning/infrastructure` (OrgDbTenantResolver, etc.) — this is cross-module composition, acceptable at the module wiring layer
- `DrizzleDb` type is `PostgresJsDatabase<Record<string, never>> | PgliteDatabase<Record<string, never>>` — empty schema type means no compile-time column inference, but this is an explicit design choice

**Verdict**: Architecture boundaries are respected. No circular dependencies. DI composition is explicit and clean.

---

### 3. Server/Client Placement / Routing / Caching — MODERATE RISK

**Findings**:

- `proxy.ts` correctly uses Edge-safe imports only
- `createEdgeRequestContainer` vs `createNodeRequestContainer` separation exists in `src/core/runtime/`
- SecurityContext (`createSecurityContext`) is Node-only — uses `headers()`, DB access
- `withAuth` differentiates Edge vs Node modes via `isNodeMode()` type guard
- No `"use client"` on security-critical components
- Bootstrap route handler (`/auth/bootstrap/start`) is a server-side route handler
- Onboarding actions use `"use server"` properly

**Risk factors**:

- `runtime` detection in `security-context.ts` uses `process.release?.name === 'node'` heuristic — may be unreliable in some Vercel edge environments
- `console.error` used in `proxy.ts` error handler instead of structured logger — minor

**Verdict**: Placement is correct. No server/client boundary violations found.

---

### 4. Test Coverage — LOW-MODERATE RISK

**Findings**:

- Unit tests: 117 files, 778 tests — all PASS
- Integration tests: 14 files, 69 tests — all PASS
- DB tests (\*.db.test.ts): require PGlite — separate vitest configs exist, not included in standard `pnpm test`
- E2E tests: auth flow coverage for sign-in/sign-up bootstrap scenarios — require Clerk credentials, some tests conditionally skipped
- `node-provisioning-runtime.ts`: 0% coverage
- `security-dependencies.ts`: 0% coverage (type/interface file — acceptable)

**Coverage highlights**:

- `secure-action.ts`: 97.77% — good
- `with-auth.ts`: 96.8% — good
- `security-context.ts`: 89.28% — acceptable (missing branches are error paths)
- `with-node-provisioning.ts`: 90.47% — acceptable

**Risk factors**:

- DB integration tests (\*.db.test.ts) are not part of `pnpm test` — requires `pnpm test:db` or CI `db-tests.yml` workflow
- No tests verify AuthJS or Supabase adapters in real integration scenarios (stubs are tested in isolation)
- Policy condition evaluation tested in unit tests but not in real DB integration test scenarios

**Verdict**: Test coverage is professional. DB test separation is intentional and has CI workflow support. E2E skipping without Clerk credentials is expected and documented.
