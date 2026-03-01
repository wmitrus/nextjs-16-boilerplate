# Modular Monolith Architecture Correction – Implementation Plan

## References

- Requirements: `.zencoder/chats/9c1cb173-e4b0-4bbd-a02d-e6b2b274ac03/requirements.md`
- Spec: `.zencoder/chats/9c1cb173-e4b0-4bbd-a02d-e6b2b274ac03/spec.md`
- Architecture truth: `docs/architecture/01–09` and `docs/architecture/Enterprise-Ready DB layer/`

---

## Phase 1 – DB Layer Refactor

### [x] Step 1.1 – Create `src/core/db/types.ts`

Create with `DrizzleDb` type, `DbDriver` type, and `DbConfig` interface.
No imports from other project files.

### [x] Step 1.2 – Create `src/core/db/drivers/create-pglite.ts`

Factory function `createPglite(url?: string): DrizzleDb`.
Extract `resolvePglitePath` logic from existing `client.ts`.

### [x] Step 1.3 – Create `src/core/db/drivers/create-postgres.ts`

Factory function `createPostgres(url: string): DrizzleDb`.
Use existing `postgres` + `drizzle-orm/postgres-js` (not `pg`).

### [x] Step 1.4 – Create `src/core/db/create-db.ts`

Factory `createDb(config: DbConfig): DrizzleDb`.
No singletons. Delegates to `createPglite` or `createPostgres`.

### [x] Step 1.5 – Update `src/core/db/index.ts`

Exports new API (`createDb`, `DrizzleDb`, `DbConfig`, `DbDriver`) + backward-compat `db`/`getDb` (removed in Phase 3 after consumers updated).

### [x] Step 1.6 – Refactor `src/core/db/client.ts`

Refactored to use `createDb` internally. `db`/`getDb` exports kept for backward compat until Phase 3 consumers are migrated. `DrizzleDb` type now imported from `types.ts`.

---

## Phase 2 – Contract & Container Refactor

### [x] Step 2.1 – Add `INFRASTRUCTURE` token to `src/core/contracts/index.ts`

Added `INFRASTRUCTURE = { DB: Symbol('Database') }`.

### [x] Step 2.2 – Refactor `src/core/container/index.ts`

- Removed global `container` singleton and `bootstrap()` function
- Removed `onResolveMissing` constructor parameter and lazy-registration logic
- Removed `registerCoreModules()` and module imports (`modules/auth`, `modules/authorization`)
- Simplified `createContainer()` to `return new Container()`
- Rewrote `integration.test.ts` to test Container fundamentals

---

## Phase 3 – Module Refactors

### [x] Step 3.1 – Refactor `src/modules/auth/index.ts`

- Exported `AuthModuleConfig` interface
- Changed `authModule: Module` → `createAuthModule(config: AuthModuleConfig): Module`
- Removed `import { env }` — env reads removed from module

### [x] Step 3.2 – Refactor `src/modules/authorization/index.ts`

- Changed `authorizationModule: Module` → `createAuthorizationModule(): Module`
- Removed `import { db }` — DB resolved from container via `INFRASTRUCTURE.DB`
- Removed env reads — always uses DrizzleRepositories

---

## Phase 4 – Composition Root

### [x] Step 4.1 – Create `src/core/runtime/bootstrap.ts`

- Exported `AppConfig` interface
- Exported `createApp(config: AppConfig): Container`
- Exported `appContainer: Container` (module-level singleton built from env)
- Reads env only here; passes config down to modules
- Registers `INFRASTRUCTURE.DB` in container before modules

---

## Phase 5 – Proxy Refactor

### [x] Step 5.1 – Refactor `src/proxy.ts`

- Removed `import { createContainer }` from container
- Added `import { appContainer } from '@/core/runtime/bootstrap'`
- Inside handler: `const requestContainer = appContainer.createChild()`
- Request-scoped IDENTITY_SOURCE, IDENTITY_PROVIDER, TENANT_RESOLVER registered in child
- AUTHORIZATION.SERVICE resolves from parent via child delegation

---

## Phase 6 – Schema Ownership Split

### [x] Step 6.1 – Create `src/modules/user/infrastructure/drizzle/schema.ts`

Moved `usersTable` definition here.

### [x] Step 6.2 – Create `src/modules/billing/infrastructure/drizzle/schema.ts`

Moved `subscriptionsTable` + `subscriptionStatusEnum` here.
Imports `tenantsTable` from `authorization/schema.ts` for FK.

### [x] Step 6.3 – Update `src/modules/authorization/infrastructure/drizzle/schema.ts`

- Removed `usersTable` (moved to user module)
- Removed `subscriptionsTable` and `subscriptionStatusEnum` (moved to billing module)
- Added `import { usersTable } from '@/modules/user/infrastructure/drizzle/schema'` for membershipsTable FK
- Kept: `contractTypeEnum`, `tenantsTable`, `rolesTable`, `membershipsTable`, `policiesTable`, `tenantAttributesTable`

---

## Phase 7 – Drizzle Config & Migrations

### [x] Step 7.1 – Update `drizzle.config.ts`

- Changed `schema` to `'./src/modules/**/infrastructure/drizzle/schema.ts'`
- Changed `out` to `'./src/core/db/migrations/generated'`

### [x] Step 7.2 – Move migration files

Moved `./src/migrations/` → `./src/core/db/migrations/generated/`.

### [ ] Step 7.3 – Verify migration diff is empty

Run `pnpm db:generate` and confirm no new SQL is generated (table structures unchanged, only file locations moved).

---

## Phase 8 – Test Updates

### [x] Step 8.1 – Rewrite `src/core/container/integration.test.ts`

Replaced usage of `bootstrap()` and global `container` with direct `Container` usage.

### [x] Step 8.2 – Update `tests/setup.tsx`

- Removed `bootstrap()` call and mocks of `authModule`/`authorizationModule`
- Added mock for `@/core/runtime/bootstrap` that exports `appContainer` with mock services

### [x] Step 8.3 – Update consumer tests

- `src/security/core/security-context.test.ts` → uses `appContainer` from bootstrap
- `src/testing/integration/server-actions.test.ts` → uses `appContainer` from bootstrap
- All consumers of old `container`/`bootstrap` updated

---

## Phase 9 – Quality Gates

### [x] Step 9.1 – Run `pnpm typecheck`

Passed ✅

### [x] Step 9.2 – Run `pnpm lint`

Passed ✅

### [ ] Step 9.3 – Run `pnpm test`

Unit tests to be verified.

### [ ] Step 9.4 – Run `pnpm test:integration`

Integration tests to be verified.

### [ ] Step 9.5 – Run `pnpm skott:check:only` and `pnpm madge`

No circular dependencies check.

### [ ] Step 9.6 – Verify core has no module imports

Confirm `src/core/container/index.ts` has zero imports from `src/modules/*`.

---

## Execution Order

Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

Phases 1–2 establish the foundation. Phases 3–4 wire the composition root. Phase 5 updates the entry point. Phase 6–7 fix schema ownership. Phase 8–9 verify everything.

**Ask for confirmation before starting each phase.**
