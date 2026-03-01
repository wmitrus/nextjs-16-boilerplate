# PRD – Modular Monolith Architecture Correction

## 1. Context

The codebase has an existing Modular Monolith foundation that partially diverges from its own architecture diagrams (`docs/architecture/01–09` and `Enterprise-Ready DB layer` docs). An expert audit identified concrete structural violations. This task is a targeted correction to align the implementation with the documented target architecture.

The architecture diagrams are the **source of truth**. The implementation must match them.

## 2. Audit Findings (Problems to Fix)

### 2.1 Container / Composition Root

**Problem**: Global mutable singleton + double-registration bug.

- `export const container = new Container(registerCoreModules)` – global mutable singleton.
- `export function bootstrap()` – re-registers core modules manually, causing double registration on first `resolve()`.
- `onResolveMissing` hook triggers module re-registration on every cache miss – unstable, hard to debug in tests.
- `src/core/container/index.ts` imports `authModule` and `authorizationModule` directly, violating the `core → modules` forbidden dependency direction.
- No single composition root file exists. The `createApp(config)` factory and `src/core/runtime/bootstrap.ts` are absent.

**Required state**:

- Remove global `container`, `bootstrap()`, and `onResolveMissing`.
- Create `src/core/runtime/bootstrap.ts` as the sole composition root.
- Expose `createApp(config: AppConfig): Container` and a module-level `appContainer` singleton created there.

### 2.2 Auth Module – reads env directly

**Problem**: `src/modules/auth/index.ts` calls `env.AUTH_PROVIDER` inside `register()`.

Modules must not read env. They must receive config from the composition root.

**Required state**:

- `authModule: Module` → `createAuthModule(config: AuthModuleConfig): Module`.
- `AuthModuleConfig = { authProvider: 'clerk' | 'authjs' | 'supabase' }`.
- Auth module reads no env variables directly.

### 2.3 Authorization Module – imports DB singleton and reads env

**Problem**: `src/modules/authorization/index.ts`:

- `import { db } from '@/core/db'` – direct import of global DB singleton.
- Reads `env.NODE_ENV` and `env.DB_PROVIDER` directly.
- Decides mock vs. real repositories based on `NODE_ENV === 'test'` inside the module.

**Required state**:

- `authorizationModule: Module` → `createAuthorizationModule(): Module`.
- Module resolves DB from the container: `container.resolve<DrizzleDb>(INFRASTRUCTURE.DB)`.
- No env reads inside the module.
- Always uses DrizzleRepositories (mock/real distinction is a composition root concern).

### 2.4 DB Layer – global singleton

**Problem**: `src/core/db/client.ts`:

- `let _db: DrizzleDb | undefined` – global mutable state.
- `export const db: DrizzleDb = getDb()` – module-level singleton exported globally.
- `getDb()` function exists with internal state.
- No `DbConfig` contract type.
- No separate driver files.
- No `createDb(config: DbConfig): DrizzleDb` factory function.

**Required state**:

- Create `src/core/db/types.ts` with `DbConfig` interface.
- Create `src/core/db/drivers/create-pglite.ts` and `src/core/db/drivers/create-postgres.ts`.
- Create `src/core/db/create-db.ts` with `createDb(config: DbConfig): DrizzleDb`.
- Remove global `_db`, `db`, `getDb()` from the db layer.
- `src/core/db/index.ts` exports only types and `createDb`.

### 2.5 Proxy – full container per request

**Problem**: `src/proxy.ts` calls `createContainer()` inside the request handler, building a complete container (all modules) for every HTTP request.

**Required state**:

- Import `appContainer` from `src/core/runtime/bootstrap`.
- Per request: `const requestContainer = appContainer.createChild()`.
- Register only request-scoped dependencies in `requestContainer`.

### 2.6 Schema Ownership – all tables in authorization module

**Problem**: `src/modules/authorization/infrastructure/drizzle/schema.ts` owns ALL tables: `users`, `tenants`, `roles`, `memberships`, `policies`, `tenant_attributes`, `subscriptions`. This violates the principle that each module owns its tables.

**Required state per DB Ownership diagram**:

- `modules/user/infrastructure/drizzle/schema.ts` → `usersTable`
- `modules/billing/infrastructure/drizzle/schema.ts` → `subscriptionsTable`, `subscriptionStatusEnum`
- `modules/authorization/infrastructure/drizzle/schema.ts` → `tenantsTable`, `rolesTable`, `membershipsTable`, `policiesTable`, `tenantAttributesTable`, `contractTypeEnum`
- Cross-module FK references at schema level are accepted as an infrastructure-layer exception (DB-level constraints need referenced table definitions).

### 2.7 Drizzle Config – hardcoded single-module schema path

**Problem**: `drizzle.config.ts` has `schema: './src/modules/authorization/infrastructure/drizzle/schema.ts'`.

**Required state**:

- `schema: './src/modules/**/infrastructure/drizzle/schema.ts'` (glob covers all modules).
- Migration output: `./src/core/db/migrations/generated`.

## 3. DB Token

A new infrastructure token is needed for the container to register the DB instance:

- Add `INFRASTRUCTURE = { DB: Symbol('Database') }` to `src/core/contracts/index.ts`.

## 4. Composition Root Contract

```ts
// src/core/runtime/bootstrap.ts
export interface AppConfig {
  db: DbConfig;
  auth: AuthModuleConfig;
}

export function createApp(config: AppConfig): Container;

export const appContainer: Container; // built from env at module load
```

## 5. Constraints

- No billing, logger, or feature-flag changes (out of scope per audit).
- All existing tests must pass after the refactor.
- `pnpm typecheck` and `pnpm lint` must pass.
- No circular dependencies introduced.
- Drizzle schema split must produce no new migration diff (table structures are unchanged, only file ownership moves).
- `src/core` must NOT import from `src/modules` after this change.

## 6. Non-Goals

- Caching layer for authorization (PolicyEngine cache) – deferred.
- RequestScopedTenantResolver personal-tenant fallback tightening – deferred.
- Logger or billing modules – out of scope.
- Testcontainers integration – out of scope.
- Seed system – out of scope.
