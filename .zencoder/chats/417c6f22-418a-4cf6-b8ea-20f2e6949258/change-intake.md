# Change Intake

**Branch**: `feat/drizzle`  
**Base**: `main`  
**Total changed files**: 646 (including docs, AI artifacts, workflow files)  
**Source-code changed files**: ~240  
**Date**: 2026-03-24

---

## Changed File Set — Source Code

### Core Layer (`src/core/`)

- `src/core/db/` — NEW: entire Drizzle DB layer (createDb, drivers, migrations, types, schema/references)
- `src/core/db/migrations/generated/` — 6 migrations (0000–0005)
- `src/core/container/` — DI container (Module, Container, createContainer)
- `src/core/contracts/` — identity, authorization, tenancy, user, feature-flags, provisioning-access, resources-actions
- `src/core/env.ts` — env schema updated
- `src/core/logger/` — pino-based logger with DI wiring, edge variant, logflare, streams
- `src/core/runtime/` — bootstrap, edge, infrastructure runtimes

### Auth Module (`src/modules/auth/`)

- Multi-provider identity sources: `ClerkRequestIdentitySource`, `AuthJsRequestIdentitySource`, `SupabaseRequestIdentitySource`, `SystemIdentitySource`
- Drizzle-backed: `DrizzleExternalIdentityMapper`, `DrizzleInternalIdentityLookup`
- `RequestScopedIdentityProvider`, `RequestScopedTenantResolver`
- `ClerkUserRepository` (Clerk admin SDK user repository)
- `clerk-redirects.ts` — redirect URL normalization with cross-origin rejection
- UI: `HeaderWithAuth`, `HeaderAuthControls`, `HeaderAuthFallback`, `onboarding-actions.ts`

### Authorization Module (`src/modules/authorization/`)

- Domain: `DefaultAuthorizationService`, `PolicyEngine`, `ConditionEvaluator`, `permission.ts`
- Drizzle repositories: `DrizzleMembershipRepository`, `DrizzleRoleRepository`, `DrizzlePolicyRepository`, `DrizzleTenantAttributesRepository`
- Memory repositories: `InMemoryRepositories`
- `deserializeCondition.ts` for ABAC condition deserialization

### Provisioning Module (`src/modules/provisioning/`)

- Domain: `ProvisioningService`, `tenancy-mode`, `tenant-context-source`, domain repository interfaces
- Tenant resolvers: `SingleTenantResolver`, `PersonalTenantResolver`, `OrgDbTenantResolver`, `OrgProviderTenantResolver`
- Request-context: `CompositeActiveTenantSource`, `CookieActiveTenantSource`, `HeaderActiveTenantSource`
- Drizzle: `DrizzleProvisioningService`
- Policy templates

### User Module (`src/modules/user/`)

- `DrizzleUserRepository`, schema, seed

### Billing Module (`src/modules/billing/`)

- `BillingService` domain interface, `StripeBillingService` stub, schema, seed

### Feature Flags Module (`src/modules/feature-flags/`)

- `InMemoryFeatureFlagService`, `OpenFeatureFeatureFlagService` stub

### Security Layer (`src/security/`)

- `proxy.ts` — request interception pipeline (Edge-safe, Clerk-wrapped)
- Middleware pipeline: `withSecurity`, `withAuth`, `withRateLimit`, `withInternalApiGuard`, `withHeaders`, `route-classification`
- `security-context.ts` — ReadinessStatus model (ALLOWED, BOOTSTRAP_REQUIRED, ONBOARDING_REQUIRED, TENANT_CONTEXT_REQUIRED, TENANT_MEMBERSHIP_REQUIRED, UNAUTHENTICATED)
- `authorization-facade.ts`, `node-provisioning-access.ts`, `node-provisioning-runtime.ts`
- `secure-action.ts` — server action security wrapper
- `secure-fetch.ts` — SSRF-safe outbound fetch

### App Layer (`src/app/`)

- Bootstrap flow: `/auth/bootstrap/`, `/auth/bootstrap/start/`
- Onboarding: `/onboarding/` (actions, layout, form)
- Auth pages: `/sign-in/`, `/sign-up/`
- Users layout: `/users/layout.tsx` (DB-backed authorization gate)
- API routes: `/api/me/provisioning-status/`, `/api/users/`, `/api/logs/`

### Testing Infrastructure (`src/testing/`)

- `src/testing/db/create-test-db.ts` — PGlite-based test DB factory
- `src/testing/factories/` — provisioning, security factories
- `src/testing/integration/` — middleware, proxy-runtime, provisioning-status-route, server-actions, users-route-provisioning integration tests
- `src/testing/infrastructure/` — env, logger mocks

### Config / Build

- `vitest.unit.config.ts`, `vitest.integration.config.ts`, `vitest.db.config.ts`, `vitest.db.ci.config.ts`, `vitest.db.local.config.ts`
- `playwright.config.ts`, `e2e/auth.spec.ts`, `e2e/provisioning-runtime.spec.ts`
- `next.config.ts`, `package.json`, `pnpm-lock.yaml`
- `scripts/db-ops.mjs`, `scripts/db-seed.ts`, `scripts/compose-db-local.mjs`, `scripts/reset-pglite.mjs`
- `.github/workflows/db-tests.yml`, `.github/workflows/e2e-matrix.yml`

---

## Auth Flow Reference

Per `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md` — auth flow scenarios affected:

- Sign-in via `/sign-in` → bootstrap redirect
- Sign-up via `/sign-up` → bootstrap redirect
- Modal sign-in/sign-up flows → bootstrap redirect
- Auth route: authenticated user redirect to bootstrap/start
- Onboarding incomplete → `/onboarding` redirect
- Tenant context missing → `/onboarding?reason=tenant-context-required`

---

## Risk Notes from User

User explicitly noted the following validation questions:

1. Is the Drizzle implementation and DB design production-ready and correct?
2. Is the full auth design and implementation ready for production Clerk instance?
3. Is the auth/RBAC/ABAC design ready for implementation of first production features?
4. Are tests professional and complete — unit, integration, and E2E?
5. Is security fully implemented?
6. Is the branch ready for a PR?
