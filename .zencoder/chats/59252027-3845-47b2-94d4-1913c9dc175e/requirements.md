# Product Requirements Document (PRD) - Modular Monolith & Contracts (Updated)

## 1. Purpose

The goal is to transition the current Next.js architecture into a **Modular Monolith** that is future-proof, scalable, and fully decoupled from any specific framework or authentication provider. This architecture will support **Multi-Tenancy**, **RBAC/ABAC**, and be ready for potential migration to a monorepo or microservices.

## 2. Core Requirements

### 2.1 Strict Separation: Authentication vs Authorization

Authentication (identity) and Authorization (permissions) must be fully decoupled.

- **`IdentityProvider` Contract**: Defined in `core/contracts`, responsible for retrieving the current user's identity.
- **Identity Abstraction**: Identity must contain a unique ID and optional attributes, but NO roles or permissions.
- **Provider Independence**: Authorization modules must NEVER reference Clerk, Auth.js, or any other provider directly. Clerk will be implemented as an infrastructure adapter for `IdentityProvider`.

### 2.2 Domain-Driven RBAC & ABAC

Roles and permissions must NOT come from the authentication provider (e.g., Clerk metadata or JWT claims).

- **Repositories**: Roles, permissions, policies, and memberships must be stored and resolved via domain repository contracts (`RoleRepository`, `PermissionRepository`, etc.).
- **Resolution**: Permission logic must be resolved by the domain layer based on the current identity and context.

### 2.3 Abstracted Tenant Resolution

Multi-tenancy resolution must be independent of the auth provider.

- **`TenantResolver` Contract**: Responsible for resolving the `TenantContext` from an `Identity`.
- **Flexibility**: Supports various strategies like subdomains, database lookups, or external IdP mapping.

### 2.4 Policy Engine Location

- **Domain Layer**: The core policy evaluation logic must reside in `modules/authorization/domain/policy/`.
- **Infrastructure**: Only provides storage adapters for policies, not evaluation logic.

### 2.5 Module Isolation Rules

- **No Direct Cross-Module Imports**: All inter-module communication must pass through contracts.
- **Public API**: Each module must expose a strict public API.
- **UI Layer Restriction**: UI components and Server Actions must only interact with Application Use Cases, never directly with Domain entities.
- **NPM Package Readiness**: Modules must be designed as if they were independent packages.

### 2.6 Runtime Adapter Selection

- **Dependency Injection**: The central container in `core/container` is responsible for selecting the correct adapter (Web vs Admin vs API) based on the execution context.

## 3. Core Contracts (Initial Set)

### Identity

```typescript
interface IdentityProvider {
  getCurrentIdentity(): Promise<Identity | null>;
}

interface Identity {
  id: string;
  email?: string;
  attributes?: Record<string, unknown>;
}
```

### Authorization & Multi-Tenancy

```typescript
interface AuthorizationService {
  can(context: AuthorizationContext): Promise<boolean>;
}

interface TenantResolver {
  resolve(identity: Identity): Promise<TenantContext>;
}
```

## 4. Technical Constraints

- **Language**: TypeScript 5.9+.
- **No `any`**: Strict type safety.
- **Verification**: All changes must pass `lint`, `typecheck`, and `test`.
