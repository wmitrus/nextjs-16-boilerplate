# Architecture Analysis & Redesign Report: Authentication Decoupling

## 1. Current State Analysis (Step 1)

The current implementation is heavily coupled with Clerk, violating several architectural principles:

- **Framework & Provider Leakage**: Clerk-specific logic and metadata access are present in core security, middleware, and domain-adjacent actions (onboarding).
- **Authorization Coupling**: Roles and tenant IDs are retrieved directly from Clerk session claims/metadata.
- **Domain Pollution**: The onboarding process directly updates Clerk's user metadata instead of a domain-owned repository.

### 1.1 Coupling Audit

| File                                    | Type of Coupling | Severity     | Description                                                                                |
| :-------------------------------------- | :--------------- | :----------- | :----------------------------------------------------------------------------------------- |
| `src/security/core/security-context.ts` | Data/Logic       | **Critical** | Direct `auth()` call; extracts `role` and `tenantId` from Clerk metadata.                  |
| `src/proxy.ts`                          | Structural       | **Critical** | Uses `clerkMiddleware`; logic depends on Clerk-specific metadata for onboarding redirects. |
| `src/actions/onboarding.ts`             | Domain/Infra     | **Critical** | Updates Clerk metadata directly; uses `clerkClient` and `auth()`.                          |
| `src/security/middleware/with-auth.ts`  | Logic            | **Critical** | Middleware helper tightly coupled with Clerk's `sessionClaims` and `clerkClient`.          |
| `src/security/core/authorization.ts`    | Logic            | Medium       | Depends on `SecurityContext` which is currently Clerk-dependent.                           |
| `src/app/layout.tsx`                    | UI               | Low          | Root `ClerkProvider` integration.                                                          |
| `src/shared/components/Header.tsx`      | UI               | Low          | Uses Clerk-specific control components.                                                    |

---

## 2. Proposed Target Architecture (Step 2 & 3)

### 2.1 Core Contracts (`src/core/contracts/`)

#### Identity Provider (`auth.ts`)

```typescript
export interface Identity {
  readonly id: string;
  readonly email?: string;
  readonly attributes?: Record<string, unknown>;
}

export interface IdentityProvider {
  getCurrentIdentity(): Promise<Identity | null>;
}
```

#### Tenant Resolver (`tenancy.ts`)

```typescript
export interface TenantResolver {
  resolve(identity: Identity): Promise<TenantContext>;
}

export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
}
```

### 2.2 Infrastructure Implementation (`src/modules/auth/infrastructure/`)

- `ClerkIdentityProvider`: Implements `IdentityProvider` using Clerk's `auth()`.
- `ClerkTenantResolver`: Implements `TenantResolver`. If we still use Clerk Organizations, this is where the mapping happens.

---

## 3. Removing Role Leakage (Step 4)

Authorization MUST be domain-driven. Roles and permissions will be resolved via repositories within the `authorization` module.

### 3.1 Authorization Repositories (`src/modules/authorization/domain/repositories/`)

- `RoleRepository`: `getRoles(identityId: string, tenantId: string): Promise<string[]>`
- `PermissionRepository`: `getPermissions(roles: string[]): Promise<Permission[]>`
- `MembershipRepository`: `getMemberships(identityId: string): Promise<Membership[]>`

### 3.2 Strategy

1. **Migration**: Move role/tenant metadata from Clerk to a dedicated database schema (or mock repositories initially).
2. **Evaluation**: `AuthorizationService` will call these repositories instead of reading from a pre-populated context derived from Clerk.

---

## 4. Final Authorization Flow (Step 5)

1. **Entry**: UI Layer (Server Action/Component) calls an Application Use Case.
2. **Identity**: Use Case requests the current user via `IdentityProvider.getCurrentIdentity()`.
3. **Tenancy**: Use Case resolves the context via `TenantResolver.resolve(identity)`.
4. **Authorization**: Use Case calls `AuthorizationService.can({ identity, tenant, action, resource })`.
5. **Execution**: Business logic executes only if authorized.

---

## 6. Verification Criteria (Step 6)

- [ ] `grep -r "@clerk/nextjs" src` returns zero results outside `src/modules/auth/infrastructure`, `src/app/layout.tsx`, and `src/shared/components/Header.tsx`.
- [ ] `AuthorizationService` contains no imports or references to Clerk.
- [ ] `TenantContext` is explicitly passed to all Use Cases and Repositories.
- [ ] No `if (role === ...)` blocks in UI or Domain layers.
- [ ] Switching to a MockIdentityProvider/MockTenantResolver requires zero changes to domain or authorization logic.
