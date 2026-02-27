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
        │    subject   { id, attributes: { role, plan, ... } }
        │    resource  { type, id, attributes: { ownerId, ... } }
        │    environment { ip, time, path, method }
        ▼
AuthorizationFacade  (security/core)
        │  1. ensureRequiredRole()  — RBAC floor-check
        │  2. authorize()          — delegates to service
        ▼
DefaultAuthorizationService  (modules/authorization/domain)
        │  1. membership guard (tenant isolation)
        │  2. fetch policies from PolicyRepository
        │  3. evaluate via PolicyEngine
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
  readonly tenantAttributes?: TenantAttributes; // ← added in Enterprise Refactor (hydrated by service)
  readonly subject: SubjectContext; // id + roles (tenant-scoped) + attributes
  readonly resource: ResourceContext; // type + id + attributes (ownerId, ...)
  readonly action: Action;
  readonly environment?: EnvironmentContext;
  readonly attributes?: Record<string, unknown>;
}
```

**`tenant.userId` was removed**: `subject.id` already carries the user identity. Keeping it on `tenant` was redundant and confused the multi-tenant boundary.

**`tenantAttributes` is populated by `DefaultAuthorizationService`** — never by the enforcement layer. It arrives from the database (billing module writes it; authorization module reads it).

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
  role: UserRole;
  tenantId: string;
  attributes?: Record<string, unknown>;  // ← NEW — user metadata (plan, onboardingComplete, ...)
}
```

The `attributes` field holds user metadata as **data only** — no policy logic. It is currently unpopulated and will be filled from the Drizzle `UserRepository` in a future prompt.

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

### 3.3 Modified files (Enterprise Readiness Refactor)

| File                                                           | Layer          | Change                                                                                                                                                                                                                |
| -------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/contracts/authorization.ts`                          | contracts      | Added `TenantAttributes` interface; `SubjectContext.roles?`; `EnvironmentContext.userAgent?`; `AuthorizationContext.tenant` narrowed to `{ tenantId }` (no `userId`); `AuthorizationContext.tenantAttributes?` added. |
| `src/core/contracts/repositories.ts`                           | contracts      | Added `TenantAttributesRepository` port interface + re-export `TenantAttributes`.                                                                                                                                     |
| `src/core/contracts/index.ts`                                  | contracts      | Added `AUTHORIZATION.TENANT_ATTRIBUTES_REPOSITORY` DI token.                                                                                                                                                          |
| `src/modules/authorization/domain/AuthorizationService.ts`     | modules/domain | Added `TenantAttributesRepository` as 3rd constructor dependency. Service now hydrates `tenantAttributes` before PolicyEngine evaluation.                                                                             |
| `src/modules/authorization/infrastructure/MockRepositories.ts` | modules/infra  | Added `MockTenantAttributesRepository` (returns free-tier defaults).                                                                                                                                                  |
| `src/modules/authorization/index.ts`                           | modules        | Registered `MockTenantAttributesRepository` and wired into `DefaultAuthorizationService`.                                                                                                                             |
| `src/security/middleware/with-auth.ts`                         | security       | Refactored to `(handler, options)` 2-arg pattern. Dependencies injected by `proxy.ts`, not resolved from global container. Fast path for public non-auth routes.                                                      |
| `src/proxy.ts`                                                 | delivery       | Per-request `createContainer()` inside `clerkMiddleware` callback. Closure-based `resolveIdentity`/`resolveTenant` use `auth` from middleware — never global `auth()`.                                                |

### 3.4 ConditionEvaluator API

```typescript
// src/modules/authorization/domain/policy/ConditionEvaluator.ts

isOwner(ctx);
// Returns true if subject.id === resource.id. Use for ownership-gated mutations.

hasAttribute(ctx, key, value);
// Returns true if subject.attributes[key] === value. Use for plan/tier/flag checks.

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

| From                                                        | Imports from                                                                    | Allowed?                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| `modules/authorization/domain/policy/ConditionEvaluator.ts` | `core/contracts/repositories`                                                   | ✅                               |
| `modules/authorization/infrastructure/MockRepositories.ts`  | `modules/authorization/domain/policy/ConditionEvaluator`                        | ✅ (same module, infra → domain) |
| `modules/authorization/domain/AuthorizationService.ts`      | `core/contracts/repositories` (incl. `TenantAttributesRepository`)              | ✅                               |
| `security/actions/secure-action.ts`                         | `core/contracts/authorization`                                                  | ✅                               |
| `security/middleware/with-auth.ts`                          | `core/contracts/authorization`, `core/contracts/tenancy`, `core/contracts/user` | ✅                               |
| `proxy.ts`                                                  | `core/container`, `core/contracts`, `security/middleware/*`                     | ✅ (delivery layer)              |

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

### 4.4 DI — not touched

No new DI tokens. No new container registrations. The `ConditionEvaluator` is used as pure functions inside policy definitions — no injection needed.

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

### 5.2 Plan/tier attribute check (hasAttribute)

Allow a feature only for users on the `'pro'` plan:

```typescript
import { hasAttribute } from '@/modules/authorization/domain/policy/ConditionEvaluator';

const proFeaturePolicy: Policy = {
  effect: 'allow',
  actions: ['export:csv'],
  resource: 'export',
  condition: (ctx) => hasAttribute(ctx, 'plan', 'pro'),
};
```

The enforcement layer must pass `plan` through `subject.attributes`:

```typescript
// In secure-action.ts, user.attributes is already spread into subject.attributes.
// Populate SecurityContext.user.attributes from the user record:
userContext = {
  id: identity.id,
  role,
  tenantId: tenantContext.tenantId,
  attributes: { plan: userRecord.plan }, // set in createSecurityContext (future)
};
```

### 5.3 Time-window restriction (isBeforeHour / isAfterHour)

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

`environment.time` is set automatically by the enforcement layer (`new Date()` at request time).

### 5.4 IP-based restriction (isFromAllowedIp)

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

### 5.5 Deny policy (deny-overrides)

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

### 5.6 Combining RBAC + ABAC in a single policy set

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
  // ABAC: pro plan users can export
  {
    effect: 'allow',
    actions: ['document:export'],
    resource: 'document',
    condition: (ctx) => hasAttribute(ctx, 'plan', 'pro'),
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

### 5.7 Tenant feature flag condition (TenantAttributes)

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

`tenantAttributes` is automatically hydrated by `DefaultAuthorizationService` before policy evaluation. The enforcement layer (secure-action, middleware) does **not** need to fetch it.

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

### 5.8 Testing ABAC policies

Test ABAC conditions directly against `DefaultAuthorizationService` + real policy implementations:

```typescript
import { DefaultAuthorizationService } from '@/modules/authorization/domain/AuthorizationService';
import { PolicyEngine } from '@/modules/authorization/domain/policy/PolicyEngine';
import {
  MockMembershipRepository,
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

// DefaultAuthorizationService now takes 4 args (PolicyRepo, MembershipRepo, TenantAttributesRepo, Engine)
const service = new DefaultAuthorizationService(
  testPolicyRepo,
  new MockMembershipRepository(),
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

## 7. Gate Results (current — post Enterprise Refactor + Clerk fix)

| Gate                    | Result                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`        | ✅ PASS                                                                 |
| `pnpm lint`             | ✅ PASS — 0 errors                                                      |
| `pnpm skott:check:only` | ✅ PASS                                                                 |
| `pnpm madge`            | ✅ PASS — no circular dependencies                                      |
| `pnpm depcheck`         | ✅ PASS — no unused packages                                            |
| `pnpm env:check`        | ✅ PASS — `.env.example` in sync                                        |
| `pnpm test`             | ✅ PASS — **360 passed (64 files)**                                     |
| Forbidden import scans  | ✅ CLEAN — only composition-root exception in `core/container/index.ts` |

**Compliance verdict: PASS. Ready for Prompt 02 (DrizzleRepositories + PGlite).**
