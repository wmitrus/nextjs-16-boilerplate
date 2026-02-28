# 22 - RBAC Baseline

## Purpose

This document describes the **Role-Based Access Control (RBAC) baseline** implementation: its architecture, every file's responsibility, proof that the Modular Monolith boundaries are preserved, and a usage manual with examples for all parts of the application.

> **Note — Enterprise Refactor (Phases 1–5)**: This document reflects the current post-refactor state. Significant changes were applied across five refactor phases. See Section 8 for a changelog summary.

---

## 1. Architecture Overview

The authorization system is layered across four architectural zones:

```
Auth Provider (Clerk)
        │  session claims (userId, orgId, email)
        ▼
RequestIdentitySource  (modules/auth/infrastructure)
        │  { userId?, orgId?, email? }  — raw, provider-specific data
        ▼
IdentityProvider + TenantResolver  (modules/auth/infrastructure)
        │  Identity { id, email? }  +  TenantContext { tenantId, userId }
        ▼
Security Context (security/core)
        │  technical request facts only:
        │  { user: { id, tenantId, attributes? }, ip, userAgent, correlationId, ... }
        ▼
Authorization Facade (security/core)
        │  authorize()  ·  can()
        ▼
DefaultAuthorizationService  (modules/authorization/domain)
        │  1. membership guard (isMember)
        │  2. role resolution  (RoleRepository.getRoles → subject.roles)
        │  3. tenant attribute hydration (TenantAttributesRepository)
        │  4. PolicyEngine evaluation
        ▼
Enforcement (security/middleware + security/actions)
```

**Key invariants**:

- `auth()` from Clerk is called **only** in `ClerkRequestIdentitySource` (infrastructure) and `proxy.ts` (delivery). Never in domain or security layers.
- `SecurityContext` holds **technical request facts only** — no role, no permissions, no precomputed authorization.
- Role resolution is an **authorization concern** owned by `DefaultAuthorizationService`, not the security context.
- All authorization flows through `authorizationService.can()` — no role-floor-check shortcuts.

---

## 2. Role Model

### Single Source of Truth: `src/core/contracts/roles.ts`

All role values and the typed union live here. Adding a new role requires editing **only this file**.

```typescript
// src/core/contracts/roles.ts

export type UserRole = 'guest' | 'user' | 'admin';

export const ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
} as const satisfies Record<string, UserRole>;
```

> **Note**: `ROLE_HIERARCHY` has been removed from the security layer. Role hierarchy is a policy concern — it lives in `PolicyRepository` / `PolicyEngine`, not in `SecurityContext`. Custom per-tenant roles cannot be expressed by a global numeric hierarchy.

### Role semantics

| Role    | Meaning                                            |
| ------- | -------------------------------------------------- |
| `guest` | Unauthenticated principal (user context is absent) |
| `user`  | Authenticated, standard access                     |
| `admin` | Elevated access — expressed through ABAC policies  |

Access decisions are made by **policies**, not by comparing role numeric levels.

---

## 3. File Catalog

### 3.1 Contracts (`src/core/contracts/`)

| File               | Purpose                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `roles.ts`         | **Single source of truth** for `UserRole` and `ROLES`. No hierarchy constant — hierarchy lives in policies.                   |
| `authorization.ts` | `AuthorizationService`, `AuthorizationContext`, `Action`, `ResourceContext`, `SubjectContext`, `TenantAttributes`.            |
| `repositories.ts`  | `RoleRepository`, `PolicyRepository`, `MembershipRepository`, `TenantAttributesRepository` ports. No `PermissionRepository`.  |
| `identity.ts`      | `IdentityProvider`, `Identity`, `RequestIdentitySource`, `RequestIdentitySourceData` — framework-agnostic identity contracts. |
| `tenancy.ts`       | `TenantResolver` and `TenantContext`.                                                                                         |
| `index.ts`         | DI token symbols — `AUTH.*`, `AUTHORIZATION.*`. No `PERMISSION_REPOSITORY` token (removed — unused).                          |

### 3.2 Auth Module (`src/modules/auth/`)

| File                                              | Purpose                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `infrastructure/ClerkRequestIdentitySource.ts`    | **Only file that imports `@clerk/nextjs/server`** (besides `proxy.ts`). Calls `auth()`, maps result to raw source data.    |
| `infrastructure/RequestScopedIdentityProvider.ts` | Implements `IdentityProvider`. Reads from `RequestIdentitySource` — no Clerk dependency.                                   |
| `infrastructure/RequestScopedTenantResolver.ts`   | Implements `TenantResolver`. Reads `orgId` from `RequestIdentitySource`. Falls back to `identity.id` (personal workspace). |
| `index.ts`                                        | Module registration — binds `IDENTITY_SOURCE`, `IDENTITY_PROVIDER`, `TENANT_RESOLVER`, `USER_REPOSITORY`.                  |

> **Deleted** (replaced by the above): `ClerkIdentityProvider.ts`, `ClerkTenantResolver.ts`.

### 3.3 Authorization Module (`src/modules/authorization/`)

| File                                            | Purpose                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `domain/AuthorizationService.ts`                | `DefaultAuthorizationService` — membership guard → role resolution → tenant attributes → policy evaluation. 5 constructor deps.     |
| `domain/policy/PolicyEngine.ts`                 | Stateless deny-overrides evaluator.                                                                                                 |
| `infrastructure/MockRepositories.ts`            | Controlled test fixtures for all 4 repositories. Used only when `NODE_ENV === 'test'`.                                              |
| `infrastructure/memory/InMemoryRepositories.ts` | Permissive dev-only implementations. Used when `NODE_ENV === 'development'`. **Never deployed to production.**                      |
| `index.ts`                                      | Env-conditional registration: `test` → Mock, `development` → InMemory, `production` → **throws** (requires Prisma implementations). |

### 3.4 Security Layer (`src/security/`)

| File                            | Purpose                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `core/security-context.ts`      | Builds `SecurityContext` from `IdentityProvider` + `TenantResolver`. **No role computation**. Technical request facts only.      |
| `core/security-dependencies.ts` | `SecurityDependencies` and `SecurityContextDependencies`. **No `roleRepository`** — role resolution is `AuthorizationService`'s. |
| `core/authorization-facade.ts`  | `AuthorizationFacade` — `can()`, `authorize()`. **No `ensureRequiredRole()`** — all authorization through ABAC.                  |
| `core/security-context.mock.ts` | Test helper — `createMockSecurityContext()`, `createMockUser()`. User shape: `{ id, tenantId, attributes? }`.                    |
| `actions/secure-action.ts`      | `createSecureAction()` — validation + `authorization.authorize()` + replay protection + audit log. **No `role` option.**         |
| `middleware/with-auth.ts`       | Route-level middleware. Dependencies injected by `proxy.ts`.                                                                     |

---

## 4. Modular Monolith Compliance Proof

### 4.1 Dependency direction (allowed → actual)

| From                    | Imports from                                            | Allowed?                              |
| ----------------------- | ------------------------------------------------------- | ------------------------------------- |
| `modules/auth`          | `core/contracts/*`                                      | ✅                                    |
| `modules/authorization` | `core/contracts/*`                                      | ✅                                    |
| `security/*`            | `core/contracts/*`, `core/env`                          | ✅                                    |
| `security/*`            | `shared/lib/network`                                    | ✅                                    |
| `features/*`            | `core/contracts/*`, `security/actions`, `security/core` | ✅                                    |
| `core/container`        | `modules/*` (composition root)                          | ✅ (intentional exception documented) |

### 4.2 Clerk isolation — confirmed

| File                                 | Imports `@clerk/nextjs/server`? | Expected   |
| ------------------------------------ | ------------------------------- | ---------- |
| `ClerkRequestIdentitySource.ts`      | ✅ yes — infrastructure adapter | ✅ correct |
| `RequestScopedIdentityProvider.ts`   | ❌ no                           | ✅ correct |
| `RequestScopedTenantResolver.ts`     | ❌ no                           | ✅ correct |
| `proxy.ts`                           | ✅ yes — delivery layer only    | ✅ correct |
| Any domain / security / feature file | ❌ none                         | ✅ correct |

### 4.3 Forbidden imports — confirmed clean

```bash
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared  # → 0 matches
grep -RInE "from ['\"]@/(app|features|security)/" src/modules          # → 0 matches
grep -RInE "from ['\"]@/(app|features|modules)/" src/security          # → 0 matches
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core     # → 0 matches (container is composition root)
```

### 4.4 DI coupling map (current)

```
ClerkRequestIdentitySource ──[RequestIdentitySourceData]──▶ RequestScopedIdentityProvider
                                                                       │
ClerkRequestIdentitySource ──[RequestIdentitySourceData]──▶ RequestScopedTenantResolver
                                                                       │
                                                           createSecurityContext()
                                                                       │
                                                          SecurityContext { user: { id, tenantId } }
                                                                       │
                                                          AuthorizationFacade.authorize()
                                                                       │
                                                          DefaultAuthorizationService.can()
                                                           ├── MembershipRepository.isMember()
                                                           ├── RoleRepository.getRoles() → subject.roles
                                                           ├── TenantAttributesRepository → tenantAttributes
                                                           └── PolicyRepository + PolicyEngine
```

Every arrow is a **contract interface** from `core/contracts/*`. No module directly imports another module.

---

## 5. Usage Manual

### 5.1 Use `ROLES` constants — never raw strings

```typescript
import { ROLES } from '@/core/contracts/roles';
import type { UserRole } from '@/core/contracts/roles';

// ✅ Correct
const requiredRole: UserRole = ROLES.ADMIN;

// ❌ Wrong — raw literal bypasses type safety
const requiredRole = 'admin';
```

### 5.2 Secure Server Action

```typescript
'use server';

import { z } from 'zod';
import { createSecureAction } from '@/security/actions/secure-action';
import { getSecurityContext } from '@/security/core/security-context';
import { createContainer } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { SecurityContextDependencies } from '@/security/core/security-context';

const schema = z.object({ title: z.string().min(1) });

function createSecureDependencies() {
  const c = createContainer();
  const contextDeps: SecurityContextDependencies = {
    identityProvider: c.resolve<IdentityProvider>(AUTH.IDENTITY_PROVIDER),
    tenantResolver: c.resolve<TenantResolver>(AUTH.TENANT_RESOLVER),
    // Note: no roleRepository — role resolution is DefaultAuthorizationService's responsibility
  };
  return {
    getSecurityContext: () => getSecurityContext(contextDeps),
    authorizationService: c.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    ),
  };
}

export const createPost = createSecureAction({
  schema,
  // Note: no `role` option — access is controlled by policies, not role floor-checks
  dependencies: createSecureDependencies,
  handler: async ({ input, context }) => {
    // context.user.id and context.user.tenantId are available
    return { id: 'new-post', title: input.title, authorId: context.user?.id };
  },
});
```

### 5.3 Authorization check in a React Server Component

Role is no longer stored on `SecurityContext`. Use `authorizationService.can()` with a policy:

```typescript
// In a policy:
const adminOnlyPolicy: Policy = {
  effect: 'allow',
  actions: ['admin:access'],
  resource: 'admin',
  condition: (ctx) => ctx.subject.roles?.includes(ROLES.ADMIN) ?? false,
};

// In a Server Component:
const canAccess = await authorizationService.can({
  tenant: { tenantId: context.user.tenantId },
  subject: { id: context.user.id },
  resource: { type: 'admin' },
  action: 'admin:access',
});

if (!canAccess) return <p>Access denied.</p>;
return <div>Admin-only content</div>;
```

### 5.4 Middleware route protection

`proxy.ts` wraps the pipeline in `clerkMiddleware()`, builds a **request-scoped `RequestIdentitySource`** from the `auth` callback (cached via `getAuthResult`), and overrides container registrations per-request:

```typescript
// proxy.ts (simplified)
export default clerkMiddleware(async (auth, request) => {
  const getAuthResult = () => auth(); // cached per-request

  const requestIdentitySource: RequestIdentitySource = {
    get: async () => {
      const { userId, orgId, sessionClaims } = await getAuthResult();
      return { userId, orgId, email: sessionClaims?.email };
    },
  };

  const requestContainer = createContainer();
  requestContainer.register(AUTH.IDENTITY_SOURCE, requestIdentitySource);
  requestContainer.register(
    AUTH.IDENTITY_PROVIDER,
    new RequestScopedIdentityProvider(requestIdentitySource),
  );
  requestContainer.register(
    AUTH.TENANT_RESOLVER,
    new RequestScopedTenantResolver(requestIdentitySource),
  );

  // ... compose and run pipeline
});
```

`auth()` is called **at most once per request**, via the `getAuthResult` cache. Domain classes never call `auth()` directly.

### 5.5 Tenant resolution — personal workspace

When a user has no Clerk organization (`orgId` is absent), `RequestScopedTenantResolver` uses `identity.id` as the `tenantId`:

```typescript
// RequestScopedTenantResolver
tenantId: orgId ?? identity.id; // personal workspace — unique per user, multi-tenant safe
```

This ensures every user has an isolated tenant boundary even without an org. Avoids the `'default'` shared-tenant anti-pattern.

### 5.6 Adding a new role

1. Open `src/core/contracts/roles.ts`.
2. Add the new role to `UserRole` and `ROLES`.
3. Add a policy in `PolicyRepository` that grants access based on `ctx.subject.roles?.includes('new-role')`.
4. Update `MockRoleRepository` for tests.

```typescript
// Before
export type UserRole = 'guest' | 'user' | 'admin';

// After (adding 'moderator')
export type UserRole = 'guest' | 'user' | 'moderator' | 'admin';
export const ROLES = {
  GUEST: 'guest',
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const satisfies Record<string, UserRole>;
```

TypeScript will surface every `ROLES.*` usage that needs updating.

### 5.7 Testing with RBAC

```typescript
import { createMockSecurityContext } from '@/security/core/security-context.mock';

// SecurityContext no longer carries role — only id and tenantId
const adminCtx = createMockSecurityContext({
  user: { id: 'user_admin_1', tenantId: 'tenant_1' },
});

const userCtx = createMockSecurityContext({
  user: { id: 'user_1', tenantId: 'tenant_1' },
});

// Mock authorizationService.can() to control access in tests:
vi.mocked(authorizationService.can).mockResolvedValue(true); // grant
vi.mocked(authorizationService.can).mockResolvedValue(false); // deny
```

---

## 6. Test Coverage

| Test file                                                           | What it proves                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `modules/auth/infrastructure/ClerkRequestIdentitySource.test.ts`    | Clerk adapter maps auth() result to raw source data correctly         |
| `modules/auth/infrastructure/RequestScopedIdentityProvider.test.ts` | IdentityProvider reads from source, returns null when no userId       |
| `modules/auth/infrastructure/RequestScopedTenantResolver.test.ts`   | TenantResolver uses orgId; falls back to identity.id (personal ws)    |
| `security/core/security-context.test.ts`                            | No role computation: SecurityContext holds id + tenantId only         |
| `security/middleware/with-auth.test.ts`                             | Middleware: 401 unauthenticated, 403 unauthorized, redirect for pages |
| `security/actions/secure-action.test.ts`                            | Action wrapper: authorization check, validation, replay protection    |
| `testing/integration/authorization.integration.test.ts`             | Real `DefaultAuthorizationService`: tenant isolation, policy matching |
| `testing/integration/server-actions.test.ts`                        | End-to-end: authorization granted/denied, policy-level denial         |
| `testing/integration/middleware.test.ts`                            | Full middleware pipeline integration                                  |

---

## 7. Gate Results (post Phase 5 — Enterprise Refactor)

| Gate                    | Result                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`        | ✅ PASS                                                                 |
| `pnpm lint`             | ✅ PASS — 0 errors                                                      |
| `pnpm skott:check:only` | ✅ PASS                                                                 |
| `pnpm madge`            | ✅ PASS — no circular dependencies                                      |
| `pnpm depcheck`         | ✅ PASS — no unused packages                                            |
| `pnpm env:check`        | ✅ PASS — `.env.example` in sync                                        |
| `pnpm test` (unit)      | ✅ PASS — 360 passed (65 files)                                         |
| `pnpm test:integration` | ✅ PASS — 60 passed (12 files)                                          |
| Forbidden import scans  | ✅ CLEAN — only composition-root exception in `core/container/index.ts` |

**Compliance verdict: PASS. Ready for Prisma repository implementation.**

---

## 8. Refactor Changelog (Phases 1–5)

| Phase | What changed                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Deleted `ClerkIdentityProvider`, `ClerkTenantResolver`. Created `ClerkRequestIdentitySource`, `RequestScopedIdentityProvider`, `RequestScopedTenantResolver`. `proxy.ts` builds request-scoped identity source.  |
| 2     | Removed `role: UserRole` from `SecurityContext.user`. Removed `roleRepository` from `SecurityContextDependencies`. Removed `ensureRequiredRole()` and `role` option from `createSecureAction`.                   |
| 3     | `DefaultAuthorizationService` now accepts `RoleRepository` as constructor dep. Calls `getRoles()` inside `can()` and merges into `subject.roles` on enriched context.                                            |
| 4     | Created `InMemoryRepositories` (dev-only, permissive). `authorizationModule` registration is env-conditional. `MembershipRepository` interface changed to `isMember(subjectId, tenantId)`.                       |
| 5     | Production guard added (throws if `NODE_ENV === 'production'`). `TenantResolver` fallback changed from `'default'` to `identity.id`. `PERMISSION_REPOSITORY` token and `PermissionRepository` interface removed. |
