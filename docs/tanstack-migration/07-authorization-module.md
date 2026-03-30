# Phase 6: Authorization Module – RBAC/ABAC

## Objective

Verify and integrate the authorization module. The domain logic is **entirely reused** from the Next.js boilerplate with zero changes. This phase is primarily about:

1. Confirming the module integrates correctly with the TanStack Start DI bootstrap
2. Verifying the `createSecureServerFn` authorization integration
3. Documenting the module boundaries and extension points

**Prerequisite**: Phase 5 (Security Layer) complete. `createSecureServerFn` uses `AUTHORIZATION.SERVICE`.

---

## What Changes

| File/Dir                                            | Status           | Change       |
| --------------------------------------------------- | ---------------- | ------------ |
| `src/modules/authorization/domain/`                 | **Reused as-is** | Zero changes |
| `src/modules/authorization/infrastructure/drizzle/` | **Reused as-is** | Zero changes |
| `src/modules/authorization/index.ts`                | **Reused as-is** | Zero changes |

**This phase has no new files to write.** It is a verification and documentation phase.

---

## 1. Module Structure (Unchanged)

```
src/modules/authorization/
├── domain/
│   ├── PolicyEngine.ts           # Core policy evaluation engine
│   ├── AuthorizationService.ts   # Authorization orchestration
│   ├── conditions/               # ABAC condition evaluators
│   │   ├── TimeCondition.ts
│   │   ├── ResourceOwnerCondition.ts
│   │   └── ...
│   └── policies/                 # Policy definitions (per resource type)
│       └── ...
├── infrastructure/
│   └── drizzle/
│       ├── DrizzleMembershipRepository.ts  # Membership lookups
│       └── DrizzleRoleRepository.ts         # Role lookups
└── index.ts                      # createAuthorizationModule() factory
```

---

## 2. DI Registration (Unchanged)

```ts
// src/modules/authorization/index.ts
import type { Container, Module } from '@/core/container';
import { AUTHORIZATION, INFRASTRUCTURE } from '@/core/contracts';
import type { DrizzleDb } from '@/core/db';
import { DrizzleAuthorizationRepository } from './infrastructure/drizzle/DrizzleAuthorizationRepository';
import { AuthorizationService } from './domain/AuthorizationService';
import { PolicyEngine } from './domain/PolicyEngine';

export function createAuthorizationModule(config: { db: DrizzleDb }): Module {
  return {
    register(container: Container) {
      const repository = new DrizzleAuthorizationRepository(config.db);
      const policyEngine = new PolicyEngine();
      const authorizationService = new AuthorizationService(
        policyEngine,
        repository,
      );
      container.register(AUTHORIZATION.SERVICE, authorizationService);
    },
  };
}
```

No change required. The composition root (`bootstrap.ts`) calls `createAuthorizationModule({ db: dbRuntime.db })` – identical to the Next.js version.

---

## 3. Using Authorization in Server Functions

### Via `createSecureServerFn` (recommended)

```ts
import { createSecureServerFn } from '@/security/actions/secure-server-fn';
import { z } from 'zod';

export const deleteUser = createSecureServerFn({
  schema: z.object({ userId: z.uuid() }),
  resource: { type: 'user', id: 'dynamic' },
  action: 'delete',
  handler: async ({ data, context }) => {
    // Authorization already checked by createSecureServerFn
    await removeUser(data.userId);
    return { deleted: true };
  },
});
```

### Via `authorizationMiddleware` (explicit per-function)

```ts
import { createServerFn } from '@tanstack/react-start';
import { authorizationMiddleware } from '@/security/middleware/function/with-authorization';

export const adminAction = createServerFn({ method: 'POST' })
  .middleware([authorizationMiddleware({ type: 'admin-panel' }, 'access')])
  .handler(async ({ context }) => {
    // context.authorized === true
    return { ok: true };
  });
```

### Direct `AuthorizationService` usage (manual, for custom flows)

```ts
import { getAppContainer } from '@/core/runtime/bootstrap';
import { AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';

const container = getAppContainer();
const authService = container.resolve<AuthorizationService>(
  AUTHORIZATION.SERVICE,
);

const allowed = await authService.can({
  subject: { id: userId, attributes: userAttributes },
  resource: { type: 'report', id: reportId },
  action: 'read',
  environment: { time: new Date(), ip },
});
```

---

## 4. ABAC Condition Evaluators (All Reused)

The ABAC conditions in `src/modules/authorization/domain/conditions/` are pure functions with no framework dependencies. All reused:

- `ResourceOwnerCondition` – checks if subject owns resource
- `TimeCondition` – time-window based conditions
- `TenantScopeCondition` – tenant isolation enforcement
- (others as implemented)

These conditions can be extended per-project without touching the boilerplate core.

---

## 5. Policy Definitions

Policy files in `src/modules/authorization/domain/policies/` define what roles/attributes allow which actions on which resources. They are pure domain logic.

The boilerplate ships with example policies for:

- `user` resource (CRUD by role)
- `admin-panel` resource (admin-only access)
- `settings` resource (self-access only)

Per-project extensions add policies without touching the framework layer.

---

## 6. RBAC Model

The boilerplate supports a role-based model extensible to attribute-based:

```
Role (e.g. "admin", "member", "viewer")
  → Permission (e.g. "user:delete", "report:read")
  → Policy (resource type + action + optional ABAC conditions)
```

Roles are stored in DB (`roles`, `permissions`, `role_permissions` tables). Membership links users to tenants with roles (`memberships` table).

All tables exist in `src/core/db/schema/` and are reused as-is.

---

## 7. Route-Level Authorization

For route-level authorization (protecting pages), use `beforeLoad` in TanStack Router:

```tsx
// src/app/routes/_authed/admin/route.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSession } from '@/modules/auth/lib/session';
import { getAppContainer } from '@/core/runtime/bootstrap';
import { AUTHORIZATION } from '@/core/contracts';
import type { AuthorizationService } from '@/core/contracts/authorization';

export const Route = createFileRoute('/_authed/admin')({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: '/auth/sign-in' });

    const container = getAppContainer();
    const authService = container.resolve<AuthorizationService>(
      AUTHORIZATION.SERVICE,
    );

    const allowed = await authService.can({
      subject: { id: session.user.id, attributes: {} },
      resource: { type: 'admin-panel' },
      action: 'access',
      environment: { time: new Date() },
    });

    if (!allowed) throw redirect({ to: '/app' });
  },
});
```

This is equivalent to the RSC guard in the Next.js boilerplate but runs via TanStack Router's `beforeLoad` hook.

---

## 8. Future RBAC/ABAC Extensions

The current design supports future extensions without architectural changes:

### Dynamic policies from DB

The `PolicyEngine` can be extended to load policies from the DB instead of code. The `AuthorizationService` interface remains the same.

### Multi-tenant policy isolation

Each `can()` call includes `tenant` context. Policies can check that a resource belongs to the calling user's tenant. This is already supported by the `TenantScopeCondition`.

### Fine-grained ABAC attributes

The `subject.attributes` and `resource.attributes` fields allow arbitrary attributes for ABAC rules. These are already present in the `AuthorizationContext` type – they just need to be populated at authorization time.

### Audit trail

Every authorization decision flows through `createSecureServerFn` which calls `logActionAudit`. Full audit trail is already in place.

---

## Risks

| Risk                                                                                                  | Severity | Mitigation                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAppContainer()` in `authorizationMiddleware` creates potential hidden service-locator             | MAJOR    | This is an explicit design choice at the composition boundary. Document it as a known composition point exception. Alternative: inject authorization service via middleware context setup in `beforeLoad`. |
| Policy definitions are code-defined – adding per-project policies requires touching boilerplate files | MINOR    | Document extension pattern: add policies in `src/features/*/policies/` and register in module                                                                                                              |
| Role permission table seeding must happen before first authorization check                            | MAJOR    | Provisioning module (Phase 7) handles initial seed via `ensureProvisioned`                                                                                                                                 |

---

## Validation

Phase 6 is complete when:

- [ ] `createSecureServerFn` with `resource` and `action` correctly enforces authorization
- [ ] Unauthorized access returns `{ status: 'unauthorized' }` not 500
- [ ] Admin route (`/_authed/admin`) redirects non-admin users
- [ ] `AuthorizationService.can()` unit tests pass (these should pass unchanged from Next.js boilerplate)
- [ ] `PolicyEngine` unit tests pass unchanged
- [ ] Integration test: server function with authorization check
- [ ] `pnpm typecheck` passes
