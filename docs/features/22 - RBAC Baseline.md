# 22 - RBAC Baseline

## Purpose

This document describes the **Role-Based Access Control (RBAC) baseline** implementation: its architecture, every file's responsibility, proof that the Modular Monolith boundaries are preserved, and a usage manual with examples for all parts of the application.

---

## 1. Architecture Overview

The RBAC system is layered across four architectural zones:

```
Auth Provider (Clerk)
        │  externalId / session claims
        ▼
Identity Adapter (modules/auth)
        │  Identity { id, email? }
        ▼
Security Context (security/core)
        │  resolves tenant + roles → SecurityContext { user.role }
        ▼
Authorization Facade (security/core)
        │  ensureRequiredRole()  ·  can()  ·  authorize()
        ▼
Enforcement (security/middleware + security/actions)
```

**Key invariant**: the auth provider only contributes a `userId`. All role/tenant resolution and authorization decisions are owned by _this_ codebase and enforced server-side.

---

## 2. Role Model

### Single Source of Truth: `src/core/contracts/roles.ts`

All role values, the typed union, and the numeric hierarchy live in one file. Adding a new role requires editing **only this file**.

```typescript
// src/core/contracts/roles.ts

export type UserRole = 'guest' | 'user' | 'admin';

export const ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
} as const satisfies Record<string, UserRole>;

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
};
```

All other files import from here — **no raw string literals allowed**.

### Role semantics

| Role    | Level | Meaning                                              |
| ------- | ----- | ---------------------------------------------------- |
| `guest` | 0     | Unauthenticated principal (user context is absent)   |
| `user`  | 1     | Authenticated, standard access                       |
| `admin` | 2     | Elevated access, all permissions floor-checked first |

Floor-check rule: a principal at level N satisfies any requirement at level ≤ N (admin can do what user can do).

---

## 3. File Catalog

### 3.1 Contracts (`src/core/contracts/`)

| File               | Purpose                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `roles.ts`         | **Single source of truth** for `UserRole`, `ROLES`, `ROLE_HIERARCHY`. Import this everywhere instead of literals. |
| `authorization.ts` | `AuthorizationService` interface, `AuthorizationContext`, `Action`, `ResourceContext`, `SubjectContext`.          |
| `repositories.ts`  | `RoleRepository`, `PolicyRepository`, `MembershipRepository` interfaces used by the DI container.                 |
| `identity.ts`      | `IdentityProvider` interface — normalized `Identity` object returned by auth adapters.                            |
| `tenancy.ts`       | `TenantResolver` interface and `TenantContext` shape.                                                             |

### 3.2 Auth Module (`src/modules/auth/`)

| File                                      | Purpose                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `infrastructure/ClerkIdentityProvider.ts` | Clerk adapter. Calls `auth()`, maps result to `Identity { id, email? }`. Provider-isolated.   |
| `infrastructure/ClerkTenantResolver.ts`   | Resolves `TenantContext` (tenantId, userId) from `Identity` using Clerk session claims.       |
| `index.ts`                                | Module registration — binds `IDENTITY_PROVIDER` and `TENANT_RESOLVER` tokens in DI container. |

### 3.3 Authorization Module (`src/modules/authorization/`)

| File                                 | Purpose                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/AuthorizationService.ts`     | `DefaultAuthorizationService` — checks tenant membership, hydrates `TenantAttributes`, fetches policies, evaluates via `PolicyEngine`. 4 constructor deps. |
| `domain/policy/PolicyEngine.ts`      | Stateless policy evaluator. Checks actions against allow/deny policies and conditions.                                                                     |
| `infrastructure/MockRepositories.ts` | In-memory `RoleRepository`, `PolicyRepository`, `MembershipRepository`, `TenantAttributesRepository` for tests. Uses `ROLES` constants.                    |
| `index.ts`                           | Module registration — binds `SERVICE`, `ROLE_REPOSITORY`, `POLICY_REPOSITORY`, `MEMBERSHIP_REPOSITORY`, `TENANT_ATTRIBUTES_REPOSITORY`.                    |

### 3.4 Security Layer (`src/security/`)

| File                            | Purpose                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `core/security-context.ts`      | Builds `SecurityContext` from `IdentityProvider` + `TenantResolver` + `RoleRepository`. Maps roles → `UserRole` using `ROLE_HIERARCHY`. |
| `core/authorization-facade.ts`  | `AuthorizationFacade` — `ensureRequiredRole()` (floor-check), `can()`, `authorize()`. Wraps `AuthorizationService` contract.            |
| `core/security-context.mock.ts` | Test helper — `createMockSecurityContext()`, `createMockUser()`. Uses `ROLES` constants.                                                |
| `actions/secure-action.ts`      | `createSecureAction()` — composes Zod validation + role check + policy check + replay protection + audit log.                           |
| `actions/secure-action.mock.ts` | Test double for `createSecureAction`. Uses `ROLES` constants.                                                                           |
| `middleware/with-auth.ts`       | Route-level auth middleware. Accepts `(handler, options)` — dependencies injected by `proxy.ts`, not the global container.              |

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

### 4.2 Forbidden imports — confirmed clean

```bash
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared  # → 0 matches
grep -RInE "from ['\"]@/(app|features|security)/" src/modules          # → 0 matches
grep -RInE "from ['\"]@/(app|features|modules)/" src/security          # → 0 matches
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core     # → 0 matches (container is composition root)
```

### 4.3 DI coupling map

```
auth ↔ authorization coupling path (runtime):

ClerkIdentityProvider  ──[Identity]──▶  createSecurityContext
                                              │
ClerkTenantResolver   ──[TenantContext]──▶   │
                                              │
MockRoleRepository    ──[string[]]──────▶    │
                                              ▼
                                     SecurityContext.user.role
                                              │
                           AuthorizationFacade.ensureRequiredRole()
                                              │
                           DefaultAuthorizationService.can()
                                              │
                           MockPolicyRepository.getPolicies()
                                              │
                           PolicyEngine.evaluate()
```

Every arrow is a **contract interface** from `core/contracts/*`. No module directly imports another module.

### 4.4 No policy logic in `shared/`

All RBAC/tenant policy logic lives in `modules/authorization/domain/` and `security/core/`. The `shared/` layer contains zero domain logic.

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
import { ROLES } from '@/core/contracts/roles';
import { createSecureAction } from '@/security/actions/secure-action';
import { createSecurityContext } from '@/security/core/security-context';
import { createContainer } from '@/core/container';
import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import type { RoleRepository } from '@/core/contracts/repositories';
import type { AuthorizationService } from '@/core/contracts/authorization';
import type { SecurityContextDependencies } from '@/security/core/security-context';

const schema = z.object({ title: z.string().min(1) });

function createSecurityDependencies() {
  const c = createContainer();
  const deps: SecurityContextDependencies = {
    identityProvider: c.resolve<IdentityProvider>(AUTH.IDENTITY_PROVIDER),
    tenantResolver: c.resolve<TenantResolver>(AUTH.TENANT_RESOLVER),
    roleRepository: c.resolve<RoleRepository>(AUTHORIZATION.ROLE_REPOSITORY),
  };
  return {
    getSecurityContext: () => createSecurityContext(deps),
    authorizationService: c.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    ),
  };
}

export const createPost = createSecureAction({
  schema,
  role: ROLES.USER, // minimum required role
  dependencies: createSecurityDependencies,
  handler: async ({ input, context }) => {
    // context.user.id, context.user.role, context.user.tenantId are all typed
    return { id: 'new-post', title: input.title, authorId: context.user?.id };
  },
});
```

### 5.3 Role check in a React Server Component

```typescript
import { ROLES } from '@/core/contracts/roles';
import type { SecurityContext } from '@/security/core/security-context';

export function AdminPanel({ context }: { context: SecurityContext }) {
  if (context.user?.role !== ROLES.ADMIN) {
    return <p>Access denied.</p>;
  }
  return <div>Admin-only content</div>;
}
```

### 5.4 Middleware route protection

`src/proxy.ts` wraps the entire pipeline in `clerkMiddleware()` and creates a **per-request DI container** inside the callback. It passes explicit dependencies to `withAuth` via the options pattern:

```typescript
// proxy.ts (simplified)
export default clerkMiddleware(async (auth, request) => {
  const requestContainer = createContainer();
  const securityDependencies: SecurityDependencies = { ... };

  withAuth(next, {
    resolveIdentity,   // closure over auth() — no global auth() call
    resolveTenant,     // closure over auth() — reads orgId
    dependencies: securityDependencies,
    userRepository,
  });
});
```

`withAuth` itself:

1. Has a fast path for public non-auth routes (skips identity resolution entirely).
2. Calls `resolveIdentity()` or falls back to `identityProvider.getCurrentIdentity()`.
3. Calls `authorization.authorize()` with the full `AuthorizationContext` including `environment`.
4. Returns 401 for unauthenticated, 403/redirect for unauthorized.

No custom role logic is required in route files — middleware handles it centrally.

### 5.5 Adding a new role

1. Open `src/core/contracts/roles.ts`.
2. Add the new role to `UserRole`, `ROLES`, and `ROLE_HIERARCHY`.
3. Update `MockRoleRepository` if the mock needs to return the new role in tests.
4. All type-checked usages of `UserRole` and `ROLES` will surface any gaps at compile time.

```typescript
// Before
export type UserRole = 'guest' | 'user' | 'admin';
export const ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
} as const satisfies Record<string, UserRole>;
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  admin: 2,
};

// After (adding 'moderator')
export type UserRole = 'guest' | 'user' | 'moderator' | 'admin';
export const ROLES = {
  GUEST: 'guest',
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
} as const satisfies Record<string, UserRole>;
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  guest: 0,
  user: 1,
  moderator: 2,
  admin: 3,
};
```

TypeScript will immediately surface every `ROLE_HIERARCHY` usage that needs updating.

### 5.6 Testing with RBAC

Use `createMockSecurityContext` and `ROLES` constants in all tests — never raw strings:

```typescript
import { ROLES } from '@/core/contracts/roles';
import { createMockSecurityContext } from '@/security/core/security-context.mock';

const adminCtx = createMockSecurityContext({
  user: { id: 'admin_1', role: ROLES.ADMIN, tenantId: 'tenant_1' },
});

const userCtx = createMockSecurityContext({
  user: { id: 'user_1', role: ROLES.USER, tenantId: 'tenant_1' },
});

const guestCtx = createMockSecurityContext({ user: undefined });
```

---

## 6. Test Coverage

| Test file                                               | What it proves                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `security/core/security-context.test.ts`                | Role mapping: multi-role admin wins, empty roles → user, unknown → user |
| `security/core/authorization-facade.test.ts`            | Floor-check: admin≥admin ✅, user<admin ❌, guest<user ❌               |
| `security/middleware/with-auth.test.ts`                 | Middleware: 401 unauthenticated, 403 unauthorized, redirect for pages   |
| `security/actions/secure-action.test.ts`                | Action wrapper: role check, policy check, validation, replay protection |
| `testing/integration/authorization.integration.test.ts` | Real `DefaultAuthorizationService`: tenant isolation, policy matching   |
| `testing/integration/server-actions.test.ts`            | End-to-end: role hierarchy (admin>user>guest), policy-level denial      |

---

## 7. Gate Results (Prompt 00 final)

| Gate                    | Result                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`        | ✅ PASS                                                                 |
| `pnpm skott:check:only` | ✅ PASS                                                                 |
| `pnpm madge`            | ✅ PASS — no circular dependencies                                      |
| `pnpm depcheck`         | ✅ PASS — no unused packages                                            |
| `pnpm env:check`        | ✅ PASS — `.env.example` in sync                                        |
| `pnpm test` (unit)      | ✅ PASS — 343 passed                                                    |
| `pnpm test:integration` | ✅ PASS — 56 passed                                                     |
| Forbidden import scans  | ✅ CLEAN — only composition-root exception in `core/container/index.ts` |

**Compliance verdict: PASS. Ready for Prompt 01 ABAC.**
