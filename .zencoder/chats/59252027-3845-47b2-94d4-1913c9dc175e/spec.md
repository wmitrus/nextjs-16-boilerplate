# Technical Specification - Modular Monolith & Contracts (Strict Architecture)

## 1. Technical Context

- **Language**: TypeScript 5.9+
- **Runtime**: Node.js 20+ (Next.js 16)
- **Patterns**: Clean Architecture, Repository Pattern, Strategy Pattern, Dependency Injection.
- **Authoritative Source**: Mermaid diagrams in `docs/architecture/`.

## 2. Mandatory Dependency Rules

The implementation MUST strictly conform to the following dependency graph:

1. **UI Layer (Next.js App Router)**:
   - May only depend on the **Application Layer**.
2. **Application Layer (Use Cases)**:
   - May depend on the **Domain Layer** and **Core Contracts**.
3. **Domain Layer (Entities, Policy Engine, Repo Interfaces)**:
   - **ZERO DEPENDENCIES** on UI, Infrastructure, or Config.
   - May depend on **Core Contracts**.
4. **Infrastructure Layer (Adapters)**:
   - MUST depend on **Domain Layer** (to implement repository interfaces) and **Core Contracts**.
5. **Container (DI)**:
   - Depends on **Infrastructure** and **Application** to perform wiring.

## 3. Directory Structure

```
src/
  core/
    contracts/      # Shared interfaces (Identity, Authorization, Tenancy, Repositories)
    container/      # Dependency Injection registry & wiring
    config/         # Runtime configuration
  modules/
    [module-name]/
      domain/       # Pure logic, Entities, Policy Engine
      application/  # Use cases (Service layer)
      infrastructure/ # Adapters (Clerk, Database, repository implementations)
      ui/           # Next.js specific components, Server Actions, Route Handlers
```

## 4. Core Contracts (`src/core/contracts/`)

### 4.1 Identity & Authentication (`identity.ts`)

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

### 4.2 Authorization (`authorization.ts`)

```typescript
export interface SubjectContext {
  id: string;
  attributes?: Record<string, unknown>;
}

export interface ResourceContext {
  type: string;
  id?: string;
  attributes?: Record<string, unknown>;
}

export interface AuthorizationContext {
  tenant: TenantContext;
  subject: SubjectContext;
  resource: ResourceContext;
  action: string;
  attributes?: Record<string, unknown>;
}

export interface AuthorizationService {
  can(context: AuthorizationContext): Promise<boolean>;
}
```

### 4.3 Multi-Tenancy (`tenancy.ts`)

```typescript
export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
}

export interface TenantResolver {
  resolve(identity: Identity): Promise<TenantContext>;
}
```

### 4.4 Repository Contracts (`repositories.ts`)

All repository interfaces MUST live in `core/contracts`.

```typescript
export interface RoleRepository {
  getRoles(subjectId: string, tenantId: string): Promise<string[]>;
}

export interface PermissionRepository {
  getPermissions(roleId: string): Promise<string[]>;
}

export interface MembershipRepository {
  getMemberships(subjectId: string): Promise<string[]>;
}

export interface PolicyRepository {
  getPolicies(context: AuthorizationContext): Promise<Policy[]>;
}
```

## 5. Policy Evaluation Strategy

The Policy Engine (residing in `modules/authorization/domain/policy`) must implement:

- **Effect Model**: `allow` | `deny`.
- **Evaluation Strategy**: **deny-overrides** (if any policy denies, the result is `deny`).
- **ABAC Support**: Policies can have conditions based on `AuthorizationContext` (subject, resource, tenant, environment attributes).
- **Conditional Evaluation**: Support for `async` conditions to allow database lookups or external checks during evaluation.

## 6. Module Registration Rule

Each module MUST expose a registration function:

```typescript
export function registerModule(container: Container): void;
```

The container MUST NOT import internal module classes directly. It interacts only with the registration entry point.

## 7. Standard Authorization Flow

1. **UI Layer** calls **Application UseCase**.
2. **UseCase** requests **Identity** from `IdentityProvider`.
3. **UseCase** resolves **TenantContext** via `TenantResolver`.
4. **UseCase** evaluates permissions via `AuthorizationService.can(context)`.
5. **AuthorizationService** delegates to **PolicyEngine (Domain)**.
6. **PolicyEngine** fetches roles/policies via **Core Repositories**.
7. **Business Logic** executes only on `allow`.

## 8. Delivery Phases

1. **Phase 1: Foundation**: Core contracts and DI container wiring.
2. **Phase 2: Auth Infrastructure**: Clerk adapters for `IdentityProvider` and `TenantResolver`.
3. **Phase 3: Authorization Domain**: Policy Engine implementation with `deny-overrides`.
4. **Phase 4: Repositories**: Infrastructure implementations of core repository contracts.
5. **Phase 5: Refactoring**: Migrate existing logic (Middleware, Actions, UI) to the new architecture.
