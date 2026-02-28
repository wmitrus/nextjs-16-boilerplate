# 23 - ABAC Foundation

## Purpose

This document describes the **Attribute-Based Access Control (ABAC) foundation** built on top of the RBAC baseline (doc 22). It covers the extended `AuthorizationContext`, every new file's responsibility, proof that the Modular Monolith boundaries are preserved, and a usage manual with examples.

ABAC allows authorization decisions to be driven by **contextual facts** — who the subject is, what attributes the resource has, what the environment looks like (IP, time, plan) — rather than role alone.

---

## 1. Architecture Overview

ABAC is layered **on top of** the existing RBAC flow. No existing layers were restructured.

```
Enforcement layer (secure-action / with-auth)
        │  assembles AuthorizationContext:
        │    subject   { id, roles (from DefaultAuthorizationService), attributes? }
        │    resource  { type, id, attributes: { ownerId, ... } }
        │    environment { ip, time, path, method }
        ▼
AuthorizationFacade  (security/core)
        │  authorize()  — delegates to service (no role floor-check)
        ▼
DefaultAuthorizationService  (modules/authorization/domain)
        │  1. membership guard (isMember)
        │  2. role resolution (RoleRepository.getRoles → merged into subject.roles)
        │  3. tenant attributes hydration (TenantAttributesRepository → tenantAttributes)
        │  4. fetch policies from PolicyRepository
        │  5. evaluate via PolicyEngine
        ▼
PolicyEngine  (modules/authorization/domain/policy)
        │  for each policy:
        │    matchesAction? → matchesResource? → condition(ctx)?
        │    deny-overrides: any deny short-circuits to false
        ▼
ConditionEvaluator  (modules/authorization/domain/policy)
        │  pure functions: isOwner, hasAttribute, isBeforeHour,
        │  isAfterHour, isFromAllowedIp, isNotFromBlockedIp
        ▼
        allow / deny
```

**Key invariant**: all ABAC decision logic lives exclusively in `modules/authorization/domain`. The enforcement layer (middleware, secure-action) only **assembles data** — it never evaluates conditions.

---

## 2. ABAC Model

### 2.1 `EnvironmentContext` — added in Prompt 01, extended in Enterprise Refactor

```typescript
// src/core/contracts/authorization.ts

export interface EnvironmentContext {
  readonly ip?: string;
  readonly userAgent?: string; // ← added in Enterprise Refactor
  readonly time?: Date;
  readonly [key: string]: unknown;
}
```

Populated by the enforcement layer and passed into `AuthorizationContext`. Contains request-level facts: caller IP, user-agent, request timestamp, HTTP method, path. Conditions in `PolicyEngine` read this field — they never call external services.

### 2.2 Extended `AuthorizationContext` — current shape

```typescript
export interface AuthorizationContext {
  readonly tenant: { readonly tenantId: TenantId }; // ← no userId (removed in Enterprise Refactor)
  readonly tenantAttributes?: TenantAttributes; // ← hydrated by DefaultAuthorizationService
  readonly subject: SubjectContext; // id + roles (tenant-scoped, resolved by service) + attributes
  readonly resource: ResourceContext; // type + id + attributes (ownerId, ...)
  readonly action: Action;
  readonly environment?: EnvironmentContext;
  readonly attributes?: Record<string, unknown>;
}
```

**`tenant.userId` was removed**: `subject.id` already carries the user identity. Keeping it on `tenant` was redundant and confused the multi-tenant boundary.

**`tenantAttributes` is populated by `DefaultAuthorizationService`** — never by the enforcement layer. It arrives from the database (billing module writes it; authorization module reads it).

**`subject.roles` is populated by `DefaultAuthorizationService`** — `RoleRepository.getRoles()` is called inside `can()` and merged into the enriched `AuthorizationContext` before `PolicyEngine` evaluation. The enforcement layer passes `subject: { id }` only.

### 2.3 `TenantAttributes` — added in Enterprise Refactor

```typescript
// src/core/contracts/authorization.ts

export interface TenantAttributes {
  readonly plan?: 'free' | 'pro' | 'enterprise';
  readonly subscriptionStatus?: 'active' | 'trial' | 'past_due' | 'canceled';
  readonly features?: readonly string[];
  readonly contractType?: 'standard' | 'enterprise';
  readonly userLimit?: number;
  readonly [key: string]: unknown;
}
```

This is the **billing/feature-flag data surface** for ABAC conditions. It is:

- **Written** by the billing module (Stripe webhook → DB update)
- **Read** by `DefaultAuthorizationService` from DB via `TenantAttributesRepository`
- **Never read** by middleware or secure-action directly

Feature flags are ABAC conditions on `tenantAttributes.features` — not ENV variables, not middleware checks.

### 2.4 `SecurityContext.user.attributes` — new in Prompt 01

```typescript
// src/security/core/security-context.ts

SecurityContext.user: {
  id: string;
  tenantId: string;
  attributes?: Record<string, unknown>;  // ← user metadata (custom per-user data)
}
```

The `attributes` field holds user metadata as **data only** — no policy logic. It is currently unpopulated and will be filled from the `UserRepository` in a future implementation. Note: `role` was removed from `SecurityContext.user` in Phase 2 — roles are resolved by `DefaultAuthorizationService`, not the security context.

### 2.5 ABAC policy shape (unchanged)

The `Policy` interface already supported ABAC via its `condition?` field:

```typescript
export interface Policy {
  effect: 'allow' | 'deny';
  actions: Action[];
  resource: string;
  condition?: (context: AuthorizationContext) => Promise<boolean> | boolean;
}
```

No changes were needed to `Policy` or `PolicyEngine` — ABAC conditions were already wired.

---

## 3. File Catalog

### 3.1 New files (Prompt 01)

| File                                                                 | Layer            | Purpose                                                                                                                  |
| -------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/authorization/domain/policy/ConditionEvaluator.ts`      | `modules/domain` | Pure ABAC condition builders. Import these inside `Policy.condition` definitions. No side effects, no framework imports. |
| `src/modules/authorization/domain/policy/ConditionEvaluator.test.ts` | test             | Unit tests for all 6 evaluator functions.                                                                                |

### 3.2 Modified files (Prompt 01)

| File                                                           | Layer            | Change                                                                                        |
| -------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `src/core/contracts/authorization.ts`                          | contracts        | Added `EnvironmentContext` interface + `environment?` field to `AuthorizationContext`.        |
| `src/security/core/security-context.ts`                        | security         | Added `attributes?: Record<string, unknown>` to `SecurityContext.user`.                       |
| `src/security/actions/secure-action.ts`                        | security         | Passes `environment: { ip, time }` and spreads `user.attributes` into `AuthorizationContext`. |
| `src/security/middleware/with-auth.ts`                         | security         | Passes `environment: { ip, time, path, method }` from request into `AuthorizationContext`.    |
| `src/modules/authorization/infrastructure/MockRepositories.ts` | modules/infra    | Added ABAC example policies: ownership, plan-attribute, IP allow-list.                        |
| `src/testing/integration/authorization.integration.test.ts`    | integration test | Added 6 ABAC tests: isOwner, hasAttribute, isFromAllowedIp, no-IP denial.                     |

### 3.3 Modified files (Enterprise Refactor — Phases 1–5)

| File                                                                      | Phase | Change                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/contracts/authorization.ts`                                     | 1–3   | Added `TenantAttributes`; `SubjectContext.roles?`; `EnvironmentContext.userAgent?`; `tenant` narrowed to `{ tenantId }` (no `userId`); `tenantAttributes?` added.                                                              |
| `src/core/contracts/repositories.ts`                                      | 3–5   | Added `TenantAttributesRepository` port; `RoleRepository` kept; `MembershipRepository` changed to `isMember(subjectId, tenantId)`; `PermissionRepository` removed.                                                             |
| `src/core/contracts/index.ts`                                             | 3, 5  | Added `AUTHORIZATION.TENANT_ATTRIBUTES_REPOSITORY`; removed `AUTHORIZATION.PERMISSION_REPOSITORY`.                                                                                                                             |
| `src/modules/authorization/domain/AuthorizationService.ts`                | 3     | Added `RoleRepository` as 3rd constructor dep (now 5 total). Resolves roles + tenant attributes in parallel inside `can()`. Merges into enriched `AuthorizationContext`.                                                       |
| `src/modules/authorization/infrastructure/MockRepositories.ts`            | 3–5   | Added `MockRoleRepository`, `MockTenantAttributesRepository`; `MockMembershipRepository` updated to `isMember()`.                                                                                                              |
| `src/modules/authorization/infrastructure/memory/InMemoryRepositories.ts` | 4     | **New file.** `InMemoryRoleRepository` (→ `[]`), `InMemoryPolicyRepository` (allow-all), `InMemoryMembershipRepository` (`isMember → true`), `InMemoryTenantAttributesRepository` (free-tier). Used in `development` env only. |
| `src/modules/authorization/index.ts`                                      | 4–5   | Env-conditional `buildRepositories()`: `test` → Mock, `development` → InMemory, `production` → **throws**. Injects all 5 deps into `DefaultAuthorizationService`.                                                              |
| `src/security/core/security-context.ts`                                   | 2     | Removed `role: UserRole` from `SecurityContext.user`. No role computation. Technical request facts only.                                                                                                                       |
| `src/security/core/security-dependencies.ts`                              | 2     | Removed `roleRepository` from `SecurityDependencies` and `SecurityContextDependencies`.                                                                                                                                        |
| `src/security/core/authorization-facade.ts`                               | 2     | Removed `ensureRequiredRole()`. All authorization via `authorize()` → `can()`.                                                                                                                                                 |
| `src/security/actions/secure-action.ts`                                   | 2     | Removed `role` option. Removed `ensureRequiredRole()` call. All access via `authorizationService.can()`.                                                                                                                       |
| `src/modules/auth/infrastructure/RequestScopedTenantResolver.ts`          | 5     | Fallback changed from `orgId ?? 'default'` to `orgId ?? identity.id` (personal workspace pattern).                                                                                                                             |
| `src/proxy.ts`                                                            | 1     | Per-request `RequestIdentitySource` built from `auth` callback. Cached via `getAuthResult`. Container registrations overridden per-request.                                                                                    |
| `tests/setup.tsx`                                                         | 5     | Removed `PERMISSION_REPOSITORY` registration from global mock.                                                                                                                                                                 |

### 3.4 ConditionEvaluator API

```typescript
// src/modules/authorization/domain/policy/ConditionEvaluator.ts

isOwner(ctx);
// Returns true if subject.id === resource.id. Use for ownership-gated mutations.

hasAttribute(ctx, key, value);
// Returns true if subject.attributes[key] === value. Use for per-user metadata checks.

isBeforeHour(ctx, hour);
// Returns true if environment.time UTC hour < hour. Use for time-window restrictions.

isAfterHour(ctx, hour);
// Returns true if environment.time UTC hour >= hour. Use for time-window restrictions.

isFromAllowedIp(ctx, allowList);
// Returns true if environment.ip is in the allow list. Use for IP-restricted internal endpoints.

isNotFromBlockedIp(ctx, blockList);
// Returns true if environment.ip is NOT in the block list. Use for blocking specific IPs.
```

---

## 4. Modular Monolith Compliance Proof

### 4.1 Dependency direction — no new violations

| From                                                        | Imports from                                                                         | Allowed?                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| `modules/authorization/domain/policy/ConditionEvaluator.ts` | `core/contracts/repositories`                                                        | ✅                               |
| `modules/authorization/infrastructure/MockRepositories.ts`  | `modules/authorization/domain/policy/ConditionEvaluator`                             | ✅ (same module, infra → domain) |
| `modules/authorization/domain/AuthorizationService.ts`      | `core/contracts/repositories` (incl. `TenantAttributesRepository`, `RoleRepository`) | ✅                               |
| `security/actions/secure-action.ts`                         | `core/contracts/authorization`                                                       | ✅                               |
| `security/middleware/with-auth.ts`                          | `core/contracts/authorization`, `core/contracts/tenancy`, `core/contracts/user`      | ✅                               |
| `proxy.ts`                                                  | `core/container`, `core/contracts`, `security/middleware/*`                          | ✅ (delivery layer)              |

### 4.2 ABAC logic boundary — confirmed

| Layer                               | Contains ABAC logic?        | Expected   |
| ----------------------------------- | --------------------------- | ---------- |
| `security/actions/secure-action.ts` | ❌ — data assembly only     | ✅ correct |
| `security/middleware/with-auth.ts`  | ❌ — data assembly only     | ✅ correct |
| `features/*`                        | ❌                          | ✅ correct |
| `modules/authorization/domain/`     | ✅ — conditions, evaluators | ✅ correct |

### 4.3 Forbidden imports — confirmed clean

```bash
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/shared  # → 0 matches
grep -RInE "from ['\"]@/(app|features|security)/" src/modules          # → 0 matches
grep -RInE "from ['\"]@/(app|features|modules)/" src/security          # → 0 matches
grep -RInE "from ['\"]@/(modules|security|features|app)/" src/core     # → 0 matches
```

### 4.4 DI — no new tokens (other than `TENANT_ATTRIBUTES_REPOSITORY`)

`ConditionEvaluator` functions are used as pure functions inside policy definitions — no injection needed. The only new DI token added across all ABAC work is `AUTHORIZATION.TENANT_ATTRIBUTES_REPOSITORY`.

---

## 5. Usage Manual

### 5.1 Ownership check (isOwner)

Restrict an action to the resource owner only:

```typescript
import { isOwner } from '@/modules/authorization/domain/policy/ConditionEvaluator';
import type { Policy } from '@/core/contracts/repositories';

const ownerOnlyDeletePolicy: Policy = {
  effect: 'allow',
  actions: ['document:delete'],
  resource: 'document',
  condition: (ctx) => isOwner(ctx),
};
```

The enforcement layer must set `resource.id` to the owning subject's ID, and `subject.id` to the requesting user:

```typescript
await authorization.authorize({
  tenant: { tenantId }, // no userId here — subject.id carries identity
  subject: { id: currentUserId },
  resource: { type: 'document', id: document.ownerId }, // ← ownerId
  action: 'document:delete',
  environment: { ip, time: new Date() },
});
```

### 5.2 Tenant feature flag condition (tenantAttributes)

Allow an action only if the tenant has a specific feature enabled. Feature flags are stored in `TenantAttributes.features` and populated by the billing module — never by middleware or ENV:

```typescript
const exportFeaturePolicy: Policy = {
  effect: 'allow',
  actions: ['invoice:export'],
  resource: 'invoice',
  condition: (ctx) =>
    ctx.tenantAttributes?.features?.includes('invoice_export') ?? false,
};
```

`tenantAttributes` is automatically hydrated by `DefaultAuthorizationService` before policy evaluation. The enforcement layer does **not** fetch it.

### 5.3 Plan/tier attribute check (hasAttribute on subject)

`hasAttribute` checks `subject.attributes` — per-user metadata. For plan checks that are tenant-scoped, prefer `tenantAttributes` (see 5.2). Use `hasAttribute` for user-specific overrides:

```typescript
import { hasAttribute } from '@/modules/authorization/domain/policy/ConditionEvaluator';

const betaUserPolicy: Policy = {
  effect: 'allow',
  actions: ['beta:access'],
  resource: 'beta',
  condition: (ctx) => hasAttribute(ctx, 'betaEnrolled', true),
};
```

### 5.4 Time-window restriction (isBeforeHour / isAfterHour)

Allow maintenance actions only between 02:00–04:00 UTC:

```typescript
import {
  isAfterHour,
  isBeforeHour,
} from '@/modules/authorization/domain/policy/ConditionEvaluator';

const maintenanceWindowPolicy: Policy = {
  effect: 'allow',
  actions: ['db:vacuum'],
  resource: 'database',
  condition: (ctx) => isAfterHour(ctx, 2) && isBeforeHour(ctx, 4),
};
```

`environment.time` is set by the enforcement layer (`new Date()` at request time).

### 5.5 IP-based restriction (isFromAllowedIp)

Restrict an admin endpoint to internal infrastructure IPs only:

```typescript
import { isFromAllowedIp } from '@/modules/authorization/domain/policy/ConditionEvaluator';

const INTERNAL_IPS = ['10.0.0.1', '10.0.0.2', '127.0.0.1'];

const internalOnlyPolicy: Policy = {
  effect: 'allow',
  actions: ['metrics:read'],
  resource: 'metrics',
  condition: (ctx) => isFromAllowedIp(ctx, INTERNAL_IPS),
};
```

### 5.6 Deny policy (deny-overrides)

Block a specific IP regardless of other allow policies:

```typescript
import { isFromAllowedIp } from '@/modules/authorization/domain/policy/ConditionEvaluator';

const blocklistPolicy: Policy = {
  effect: 'deny',
  actions: ['document:read'],
  resource: 'document',
  condition: (ctx) => isFromAllowedIp(ctx, ['192.0.2.1']),
};
```

Deny policies short-circuit immediately — any matching deny returns `false` regardless of allow policies.

### 5.7 Combining RBAC + ABAC in a single policy set

A realistic production policy set:

```typescript
const policies: Policy[] = [
  // RBAC: any authenticated user can read documents
  {
    effect: 'allow',
    actions: ['document:read'],
    resource: 'document',
    condition: (ctx) => Boolean(ctx.subject.id),
  },
  // ABAC: only the owner can delete their document
  {
    effect: 'allow',
    actions: ['document:delete'],
    resource: 'document',
    condition: (ctx) => isOwner(ctx),
  },
  // ABAC: tenant with pro plan can export (tenantAttributes — not subject.attributes)
  {
    effect: 'allow',
    actions: ['document:export'],
    resource: 'document',
    condition: (ctx) => ctx.tenantAttributes?.plan === 'pro',
  },
  // ABAC: hard deny from known bad IPs (deny-overrides everything above)
  {
    effect: 'deny',
    actions: ['document:read', 'document:delete', 'document:export'],
    resource: 'document',
    condition: (ctx) => isFromAllowedIp(ctx, BLOCKED_IPS),
  },
];
```

### 5.8 Adding a new condition evaluator

All ABAC conditions are pure functions. Add new ones to `ConditionEvaluator.ts`:

```typescript
// src/modules/authorization/domain/policy/ConditionEvaluator.ts

export function isVerifiedEmail(ctx: AuthorizationContext): boolean {
  return ctx.subject.attributes?.emailVerified === true;
}
```

Then use it immediately in any policy:

```typescript
condition: (ctx) => isVerifiedEmail(ctx);
```

No DI changes. No infrastructure changes. No contract changes.

### 5.9 Testing ABAC policies

Test ABAC conditions directly against `DefaultAuthorizationService` + real policy implementations.

`DefaultAuthorizationService` takes **5 constructor parameters** (Policy, Membership, Role, TenantAttributes repos + Engine):

```typescript
import { DefaultAuthorizationService } from '@/modules/authorization/domain/AuthorizationService';
import { PolicyEngine } from '@/modules/authorization/domain/policy/PolicyEngine';
import {
  MockMembershipRepository,
  MockRoleRepository,
  MockTenantAttributesRepository,
} from '@/modules/authorization/infrastructure/MockRepositories';
import type { AuthorizationContext } from '@/core/contracts/authorization';
import type { PolicyRepository } from '@/core/contracts/repositories';

const testPolicyRepo: PolicyRepository = {
  getPolicies: async () => [
    {
      effect: 'allow',
      actions: ['document:delete'],
      resource: 'document',
      condition: (ctx) => isOwner(ctx),
    },
  ],
};

const service = new DefaultAuthorizationService(
  testPolicyRepo,
  new MockMembershipRepository(),
  new MockRoleRepository(),
  new MockTenantAttributesRepository(),
  new PolicyEngine(),
);

it('allows owner to delete', async () => {
  const ctx: AuthorizationContext = {
    tenant: { tenantId: 't1' }, // no userId — subject.id carries identity
    subject: { id: 'user_1' },
    resource: { type: 'document', id: 'user_1' }, // same as subject.id
    action: 'document:delete',
    environment: { ip: '127.0.0.1', time: new Date() },
  };
  expect(await service.can(ctx)).toBe(true);
});
```

---

## 6. Test Coverage

| Test file                                                              | What it proves                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `modules/authorization/domain/policy/ConditionEvaluator.test.ts`       | All 6 evaluators: isOwner, hasAttribute, isBeforeHour, isAfterHour, isFromAllowedIp, isNotFromBlockedIp — 15 unit tests   |
| `testing/integration/authorization.integration.test.ts` (ABAC section) | Real `DefaultAuthorizationService` with ABAC conditions: ownership, plan-attribute, IP allow-list, no-IP denial — 6 tests |

---

## 7. Gate Results (post Enterprise Refactor — Phases 1–5)

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
