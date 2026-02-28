# Technical Specification: Auth/Authorization Architectural Refactor

## Technical Context

- **Language**: TypeScript ^5 (strict mode)
- **Runtime**: Next.js 16, Node.js ^20
- **Auth provider**: Clerk (`@clerk/nextjs/server`)
- **DI**: Custom container (`src/core/container/index.ts`)
- **Test framework**: Vitest
- **Package manager**: pnpm

## Affected Modules

| Module                                                           | Change                                                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/contracts/identity.ts`                                 | Add `RequestIdentitySource` interface                                                                                                                     |
| `src/modules/auth/infrastructure/`                               | New: `RequestScopedIdentityProvider`, `ClerkRequestIdentitySource`, `RequestScopedTenantResolver`; delete: `ClerkIdentityProvider`, `ClerkTenantResolver` |
| `src/modules/auth/index.ts`                                      | Wire new providers                                                                                                                                        |
| `src/modules/authorization/domain/AuthorizationService.ts`       | Add `RoleRepository` dependency, enrich subject roles internally                                                                                          |
| `src/modules/authorization/infrastructure/`                      | New: `memory/` folder with in-memory repositories                                                                                                         |
| `src/modules/authorization/index.ts`                             | Environment-conditional registration                                                                                                                      |
| `src/security/core/security-context.ts`                          | Remove `roleRepository` + role computation                                                                                                                |
| `src/security/core/security-context.test.ts`                     | Update assertions to remove `role`                                                                                                                        |
| `src/security/core/security-dependencies.ts`                     | Remove `roleRepository` from both interfaces                                                                                                              |
| `src/security/actions/action-audit.ts`                           | Remove `role` from audit payload                                                                                                                          |
| `src/security/actions/secure-action.ts`                          | Remove `ensureRequiredRole` call (replaced by full ABAC)                                                                                                  |
| `src/proxy.ts`                                                   | Remove `roleRepository` from `securityDependencies`; build `RequestIdentitySource` from `auth` callback and register it in container                      |
| `src/features/security-showcase/actions/showcase-actions.ts`     | Remove `roleRepository` from security context dependencies                                                                                                |
| `src/features/security-showcase/components/AdminOnlyExample.tsx` | Remove `role` usage                                                                                                                                       |
| `src/features/security-showcase/components/ProfileExample.tsx`   | Remove `role` usage                                                                                                                                       |
| `src/testing/integration/server-actions.test.ts`                 | Remove `roleRepository` from context deps                                                                                                                 |

---

## Phase 1: RequestIdentitySource — Decouple Clerk from domain

### 1.1 Add `RequestIdentitySource` to contracts

**File**: `src/core/contracts/identity.ts`

Add interface:

```ts
export interface RequestIdentitySourceData {
  userId?: string;
  orgId?: string;
  email?: string;
}

export interface RequestIdentitySource {
  get(): Promise<RequestIdentitySourceData>;
}
```

### 1.2 Create `ClerkRequestIdentitySource`

**File**: `src/modules/auth/infrastructure/ClerkRequestIdentitySource.ts`

```ts
import { auth } from '@clerk/nextjs/server';
import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

export class ClerkRequestIdentitySource implements RequestIdentitySource {
  async get(): Promise<RequestIdentitySourceData> {
    const { userId, orgId, sessionClaims } = await auth();
    return {
      userId: userId ?? undefined,
      orgId: orgId ?? undefined,
      email:
        typeof sessionClaims?.email === 'string'
          ? sessionClaims.email
          : undefined,
    };
  }
}
```

**File**: `src/modules/auth/infrastructure/ClerkRequestIdentitySource.test.ts`

Tests: returns data from `auth()`, handles nulls.

### 1.3 Create `RequestScopedIdentityProvider`

**File**: `src/modules/auth/infrastructure/RequestScopedIdentityProvider.ts`

```ts
import type {
  Identity,
  IdentityProvider,
  RequestIdentitySource,
} from '@/core/contracts/identity';

export class RequestScopedIdentityProvider implements IdentityProvider {
  constructor(private readonly source: RequestIdentitySource) {}

  async getCurrentIdentity(): Promise<Identity | null> {
    const { userId, email } = await this.source.get();
    if (!userId) return null;
    return { id: userId, email };
  }
}
```

**File**: `src/modules/auth/infrastructure/RequestScopedIdentityProvider.test.ts`

Tests: returns null when no userId, returns identity when userId present.

### 1.4 Create `RequestScopedTenantResolver`

**File**: `src/modules/auth/infrastructure/RequestScopedTenantResolver.ts`

```ts
import type { Identity } from '@/core/contracts/identity';
import type { RequestIdentitySource } from '@/core/contracts/identity';
import type { TenantContext, TenantResolver } from '@/core/contracts/tenancy';

export class RequestScopedTenantResolver implements TenantResolver {
  constructor(private readonly source: RequestIdentitySource) {}

  async resolve(identity: Identity): Promise<TenantContext> {
    const { orgId } = await this.source.get();
    return {
      tenantId: orgId ?? 'default',
      userId: identity.id,
    };
  }
}
```

**File**: `src/modules/auth/infrastructure/RequestScopedTenantResolver.test.ts`

Tests: resolves org tenant, falls back to 'default'.

### 1.5 Add `AUTH.IDENTITY_SOURCE` token

**File**: `src/core/contracts/index.ts`

Add token `IDENTITY_SOURCE: Symbol('IDENTITY_SOURCE')` under the `AUTH` namespace.

### 1.6 Update `authModule`

**File**: `src/modules/auth/index.ts`

```ts
import { ClerkRequestIdentitySource } from './infrastructure/ClerkRequestIdentitySource';
import { RequestScopedIdentityProvider } from './infrastructure/RequestScopedIdentityProvider';
import { RequestScopedTenantResolver } from './infrastructure/RequestScopedTenantResolver';
import { ClerkUserRepository } from './infrastructure/ClerkUserRepository';
import { AUTH } from '@/core/contracts';

export const authModule: Module = {
  register(container) {
    const identitySource = new ClerkRequestIdentitySource();
    container.register(AUTH.IDENTITY_SOURCE, identitySource);
    container.register(
      AUTH.IDENTITY_PROVIDER,
      new RequestScopedIdentityProvider(identitySource),
    );
    container.register(
      AUTH.TENANT_RESOLVER,
      new RequestScopedTenantResolver(identitySource),
    );
    container.register(AUTH.USER_REPOSITORY, new ClerkUserRepository());
  },
};
```

### 1.7 Update proxy.ts — override identity source per request

In `proxy.ts`, inside `clerkMiddleware(async (auth, request) => ...)`, after `createContainer()`, override the identity source to use the closure-captured `auth` callback (avoids double `auth()` calls):

```ts
const requestIdentitySource: RequestIdentitySource = {
  get: async () => {
    const { userId, orgId, sessionClaims } = await getAuthResult();
    return {
      userId: userId ?? undefined,
      orgId: orgId ?? undefined,
      email:
        typeof sessionClaims?.email === 'string'
          ? sessionClaims.email
          : undefined,
    };
  },
};
requestContainer.register(AUTH.IDENTITY_SOURCE, requestIdentitySource);
requestContainer.register(
  AUTH.IDENTITY_PROVIDER,
  new RequestScopedIdentityProvider(requestIdentitySource),
);
requestContainer.register(
  AUTH.TENANT_RESOLVER,
  new RequestScopedTenantResolver(requestIdentitySource),
);
```

`resolveIdentity` and `resolveTenant` closures in proxy.ts delegate to the identity source instead of calling `auth()` directly.

**Delete**: `src/modules/auth/infrastructure/ClerkIdentityProvider.ts` and `.test.ts`  
**Delete**: `src/modules/auth/infrastructure/ClerkTenantResolver.ts` and `.test.ts`

---

## Phase 2: SecurityContext — Remove role computation

### 2.1 Update `SecurityContext` interface

**File**: `src/security/core/security-context.ts`

Remove `role` from `SecurityContext.user`:

```ts
export interface SecurityContext {
  user?: {
    id: string;
    tenantId: string;
    attributes?: Record<string, unknown>;
  };
  ip: string;
  userAgent?: string;
  correlationId: string;
  runtime: 'edge' | 'node';
  environment: 'development' | 'test' | 'production';
  requestId: string;
}
```

Remove `roleRepository` from `createSecurityContext` — no role computation.

### 2.2 Update `SecurityDependencies` and `SecurityContextDependencies`

**File**: `src/security/core/security-dependencies.ts`

Remove `roleRepository: RoleRepository` from both interfaces.

### 2.3 Update callers

- `src/security/actions/secure-action.ts`: Remove `authorization.ensureRequiredRole(...)` call. The full `authorization.authorize(...)` is the sole check. Remove `role: context.user.role` from subject attributes (can be omitted or derived from AuthorizationService internally).
- `src/security/actions/action-audit.ts`: Remove `role` field from log payload.
- `src/features/security-showcase/actions/showcase-actions.ts`: Remove `roleRepository` from `securityContextDependencies`.
- `src/features/security-showcase/components/AdminOnlyExample.tsx`: Replace `context.user?.role === ROLES.ADMIN` with a note (this is a showcase component).
- `src/features/security-showcase/components/ProfileExample.tsx`: Remove `role` from displayed data.
- `src/proxy.ts`: Remove `roleRepository` from `securityDependencies`.

### 2.4 Update `security-context.test.ts`

Remove all `roleRepository` references and `role` assertions. Test only `{ id, tenantId }` structure.

---

## Phase 3: AuthorizationService — Role resolution internalization

### 3.1 Add `RoleRepository` to `DefaultAuthorizationService`

**File**: `src/modules/authorization/domain/AuthorizationService.ts`

```ts
constructor(
  private readonly policyRepository: PolicyRepository,
  private readonly membershipRepository: MembershipRepository,
  private readonly tenantAttributesRepository: TenantAttributesRepository,
  private readonly roleRepository: RoleRepository,
  private readonly engine: PolicyEngine,
) {}

async can(context: AuthorizationContext): Promise<boolean> {
  const memberships = await this.membershipRepository.getTenantMemberships(context.subject.id);
  if (!memberships.includes(context.tenant.tenantId)) return false;

  const [roles, tenantAttributes] = await Promise.all([
    this.roleRepository.getRoles(context.subject.id, context.tenant.tenantId),
    this.tenantAttributesRepository.getTenantAttributes(context.tenant.tenantId),
  ]);

  const enrichedContext: AuthorizationContext = {
    ...context,
    tenantAttributes,
    subject: {
      ...context.subject,
      roles: [...(context.subject.roles ?? []), ...roles],
    },
  };

  const policies = await this.policyRepository.getPolicies(enrichedContext);
  return this.engine.evaluate(enrichedContext, policies);
}
```

### 3.2 Update `authorizationModule`

**File**: `src/modules/authorization/index.ts`

Inject `RoleRepository` into `DefaultAuthorizationService`:

```ts
container.register(
  AUTHORIZATION.SERVICE,
  new DefaultAuthorizationService(
    policyRepository,
    membershipRepository,
    tenantAttributesRepository,
    roleRepository, // ← added
    engine,
  ),
);
```

### 3.3 Update integration tests

**File**: `src/testing/integration/authorization.integration.test.ts`

Update `new DefaultAuthorizationService(...)` instantiation to include `MockRoleRepository`.

**File**: `src/testing/integration/server-actions.test.ts`

Remove `roleRepository` from `SecurityContextDependencies`. Remove role-based mock setup (`vi.mocked(roleRepository.getRoles).mockResolvedValue(...)`).

---

## Phase 4: Authorization infrastructure separation

### 4.1 Create in-memory repositories

**File**: `src/modules/authorization/infrastructure/memory/InMemoryRepositories.ts`

Move the "mock" content to proper in-memory implementations:

- `InMemoryRoleRepository` — same logic as MockRoleRepository (for now)
- `InMemoryPolicyRepository` — same policies as MockPolicyRepository
- `InMemoryMembershipRepository` — same as MockMembershipRepository
- `InMemoryTenantAttributesRepository` — same as MockTenantAttributesRepository

These are NOT test fixtures. They are stateless reference implementations.

### 4.2 Keep `MockRepositories.ts` for test imports only

`MockRepositories.ts` stays intact for use in `authorization.integration.test.ts`. But it is not imported from the module's `index.ts`.

### 4.3 Environment-conditional registration in `authorizationModule`

**File**: `src/modules/authorization/index.ts`

```ts
import { env } from '@/core/env';
import { InMemoryPolicyRepository, InMemoryRoleRepository, ... } from './infrastructure/memory/InMemoryRepositories';
import { MockPolicyRepository, MockRoleRepository, ... } from './infrastructure/MockRepositories';

export const authorizationModule: Module = {
  register(container) {
    const isTest = env.NODE_ENV === 'test';
    const policyRepository = isTest ? new MockPolicyRepository() : new InMemoryPolicyRepository();
    const roleRepository = isTest ? new MockRoleRepository() : new InMemoryRoleRepository();
    const membershipRepository = isTest ? new MockMembershipRepository() : new InMemoryMembershipRepository();
    const tenantAttributesRepository = isTest
      ? new MockTenantAttributesRepository()
      : new InMemoryTenantAttributesRepository();
    ...
  }
};
```

> **Note**: In-memory implementations will be replaced with Prisma implementations in a future billing module phase. The conditional registration pattern is already in place to support that migration.

---

## Interface Changes Summary

### `SecurityContext.user` (BEFORE)

```ts
user?: { id: string; role: UserRole; tenantId: string; attributes?: Record<string, unknown>; }
```

### `SecurityContext.user` (AFTER)

```ts
user?: { id: string; tenantId: string; attributes?: Record<string, unknown>; }
```

### `SecurityContextDependencies` (BEFORE)

```ts
{
  (identityProvider, tenantResolver, roleRepository);
}
```

### `SecurityContextDependencies` (AFTER)

```ts
{
  (identityProvider, tenantResolver);
}
```

### `DefaultAuthorizationService` constructor (BEFORE)

```ts
(policyRepository, membershipRepository, tenantAttributesRepository, engine);
```

### `DefaultAuthorizationService` constructor (AFTER)

```ts
(policyRepository,
  membershipRepository,
  tenantAttributesRepository,
  roleRepository,
  engine);
```

### `AuthorizationContext.subject` (enriched internally — unchanged externally)

```ts
subject: { id, roles?: readonly string[], attributes? }
```

`roles` was always in the contract; `DefaultAuthorizationService` now populates it from `RoleRepository`.

---

## Verification

```bash
pnpm typecheck   # zero errors
pnpm lint        # zero warnings/errors
pnpm test        # all tests pass
```
