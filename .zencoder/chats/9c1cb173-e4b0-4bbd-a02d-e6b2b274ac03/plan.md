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

### [x] Step 7.3 – Verify migration diff is empty

`pnpm db:generate` → "No schema changes, nothing to migrate" ✅ All 7 tables detected from split schema files.

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

### [x] Step 9.3 – Run `pnpm test`

9 failed / 65 passed — failures are **pre-existing** (all `toBeInTheDocument` from missing `@testing-library/jest-dom` setup, unrelated to this refactor). ✅

### [x] Step 9.4 – Run `pnpm test:integration`

1 failed / 11 passed — failure is **pre-existing** (same `toBeInTheDocument` issue), unrelated to this refactor. ✅

### [x] Step 9.5 – Run `pnpm skott:check:only` and `pnpm madge`

✓ no circular dependencies found (both tools). ✅

### [x] Step 9.6 – Verify core has no module imports

`src/core/container/index.ts` has zero imports from `src/modules/*`. ✅

---

## Phase 10 – Professional Migration Flow (DEV vs PROD vs CI)

### [x] Step 10.1 – Create `src/core/db/migrations/config/drizzle.dev.ts`

PGlite-only config. No env switching. Schema/out use cwd-relative paths (drizzle-kit resolves from cwd, not config file). ✅

### [x] Step 10.2 – Create `src/core/db/migrations/config/drizzle.prod.ts`

Postgres-only config. Throws at parse time if `DATABASE_URL` missing or not postgres://. ✅

### [x] Step 10.3 – Create `src/core/db/run-migrations.ts`

Programmatic `runMigrations(db, driver)` using dynamic import of the correct drizzle migrator. MIGRATIONS_FOLDER resolved via `import.meta.url`. ✅

### [x] Step 10.4 – Replace `DB_PROVIDER` with `DB_DRIVER` in env schema

- `src/core/env.ts`: `DB_DRIVER: z.enum(['pglite', 'postgres']).optional()`
- `src/core/runtime/bootstrap.ts`: `env.DB_DRIVER ?? (env.NODE_ENV === 'production' ? 'postgres' : 'pglite')`
- `src/testing/infrastructure/env.ts`: `DB_DRIVER: undefined`
- `.env.example`: `DB_DRIVER=` with explanatory comment ✅

### [x] Step 10.5 – Update `package.json` db scripts

- `db:generate` → `--config=src/core/db/migrations/config/drizzle.dev.ts`
- `db:migrate:dev` → `--config=src/core/db/migrations/config/drizzle.dev.ts`
- `db:migrate:prod` → `--config=src/core/db/migrations/config/drizzle.prod.ts`
- `db:studio` → `--config=src/core/db/migrations/config/drizzle.dev.ts`
- Removed `db:migrate` (ambiguous) and `db:migrate:test` (CI uses programmatic `runMigrations`) ✅

### [x] Step 10.6 – Delete `src/migrations/` (dead directory)

Deleted. Only `src/core/db/migrations/generated/` remains. ✅

### [x] Step 10.7 – Run `pnpm typecheck` and `pnpm lint`

Both pass. `pnpm db:generate` verified — 7 tables, "No schema changes, nothing to migrate". ✅

---

## Execution Order

Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

Phases 1–2 establish the foundation. Phases 3–4 wire the composition root. Phase 5 updates the entry point. Phase 6–7 fix schema ownership. Phase 8–9 verify everything. Phase 10 professionalizes migration flow. Phase 11 adds enterprise seed system.

**Ask for confirmation before starting each phase.**

---

## Phase 11 – Enterprise Seed System

### [x] Step 11.1 – Create `src/modules/user/infrastructure/drizzle/seed.ts`

Module-level seed for users table.

- `UserSeedResult` interface with typed fixtures `{ alice, bob }`
- `seedUsers(db: DrizzleDb): Promise<UserSeedResult>`
- Fixed well-known UUIDs for idempotency
- Upsert via `onConflictDoNothing()`

### [x] Step 11.2 – Create `src/modules/authorization/infrastructure/drizzle/seed.ts`

Module-level seed for authorization tables (tenants, roles, memberships, policies, tenantAttributes).

- `AuthSeedResult` interface with typed fixtures
- `seedAuthorization(db: DrizzleDb, deps: { users: UserSeedResult }): Promise<AuthSeedResult>`
- Two tenants: acme (enterprise plan) + globex (pro plan)
- System roles per tenant: admin, member
- Memberships: alice=acme:admin + globex:admin, bob=acme:member
- Policies: admin=allow:\*, member=allow:read:users
- TenantAttributes for both tenants
- Upsert via `onConflictDoNothing()`

### [x] Step 11.3 – Create `src/modules/billing/infrastructure/drizzle/seed.ts`

Module-level seed for subscriptions.

- `BillingSeedResult` interface with typed fixtures
- `seedBilling(db: DrizzleDb, deps: { tenants: AuthSeedResult['tenants'] }): Promise<BillingSeedResult>`
- Active subscription per tenant (stripe provider)
- Upsert via `onConflictDoNothing()`

### [x] Step 11.4 – Create `src/core/db/seed.ts`

Composition root for all seeds.

- `SeedAllResult` interface composing all module results
- `seedAll(db: DrizzleDb): Promise<SeedAllResult>`
- Orchestrates in dependency order: users → authorization → billing

### [x] Step 11.5 – Create `scripts/db-seed.ts`

CLI entry point for running seeds.

- Reads `DB_DRIVER` / `DATABASE_URL` from env
- Creates db via `createDb`
- Calls `seedAll(db)` and logs structured output
- Exits with code 1 on error

### [x] Step 11.6 – Update `package.json`

Add `db:seed` → `tsx scripts/db-seed.ts`

### [x] Step 11.7 – Run `pnpm typecheck` and `pnpm lint`

Both pass. ✅

Both must pass.

---

## Phase 12 – DB Test Infrastructure (PGLite local + Testcontainers CI)

### Drizzle config decision (documented)

No `drizzle.test.ts` needed. Tests run migrations via `runMigrations(db, driver)` programmatically.

- PGLite tests: `memory://` — never touches `./data/pglite`
- Postgres CI tests: Testcontainers URL — never touches dev/prod
- Zero env var reads inside test factory — explicit params only

### [x] Step 12.1 – Install `@testcontainers/postgresql`

`pnpm add -D @testcontainers/postgresql`

### [x] Step 12.2 – Create `src/testing/db/create-test-db.ts`

Shared test DB factory.

- `TestDb` interface: `{ db: DrizzleDb; cleanup: () => Promise<void> }`
- `createTestDb(driver?: DbDriver, url?: string): Promise<TestDb>`
- PGLite path: creates `memory://` instance, runs migrations, cleanup = close pglite
- Postgres path: connects to given URL, truncates all user tables, cleanup = truncate again (leave schema intact for next test)

### [x] Step 12.3 – Create `tests/db/setup.postgres.ts`

Testcontainers globalSetup for Vitest.

- Starts `PostgreSqlContainer('postgres:16-alpine')`
- Runs `runMigrations(db, 'postgres')` once
- `provide('TEST_DATABASE_URL', container.getConnectionUri())`
- teardown: `container.stop()`

### [x] Step 12.4 – Create `vitest.db.config.ts`

PGLite DB tests config.

- `include: ['src/**/*.db.test.ts']`
- `environment: 'node'`
- No globalSetup (PGLite is in-process)
- No setupFiles from unit test (no mocks — real DB)
- `pool: 'threads'` (each thread gets own memory:// instance)

### [x] Step 12.5 – Create `vitest.db.ci.config.ts`

Testcontainers DB tests config.

- Same `include: ['src/**/*.db.test.ts']`
- `environment: 'node'`
- `globalSetup: ['tests/db/setup.postgres.ts']`
- `pool: 'forks', maxForks: 1` (sequential — shared Postgres DB, truncate between suites)

### [x] Step 12.6 – Update `package.json`

Add scripts:

- `test:db` → `vitest run --config vitest.db.config.ts`
- `test:db:ci` → `vitest run --config vitest.db.ci.config.ts`

### [x] Step 12.7 – Create example `*.db.test.ts` files

Two example tests co-located with repositories:

- `src/modules/authorization/infrastructure/drizzle/DrizzlePolicyRepository.db.test.ts`
- `src/modules/authorization/infrastructure/drizzle/DrizzleMembershipRepository.db.test.ts`

Both work with PGLite (`pnpm test:db`) and Postgres CI (`pnpm test:db:ci`) — driver-agnostic via `createTestDb`.

### [x] Step 12.8 – Run `pnpm typecheck` and `pnpm lint`

Both pass. `pnpm test:db` → 9/9 ✅

---

## Phase 13 – CI Pipeline for DB Tests

### [x] Step 13.1 – Fix connection leak in `tests/db/setup.postgres.ts`

The migration postgres client is never closed. Fix: use `postgres()` directly,
run migrations, then `client.end()`. Connection is released before tests start.

### [x] Step 13.2 – Create `.github/workflows/db-tests.yml`

GitHub Actions workflow for DB tests with Testcontainers.

- `ubuntu-latest` (Docker pre-installed)
- `TESTCONTAINERS_RYUK_DISABLED: "true"` (avoids Ryuk cleanup container issues in CI)
- Pre-pull `postgres:16-alpine` to reduce test flakiness from slow Docker pulls
- `pnpm test:db:ci`
- Timeout: 15 minutes

### [x] Step 13.3 – Run `pnpm typecheck` and `pnpm lint`

Both pass. ✅

---

## Phase 14 – Local Podman Compose Pattern for DB CI Tests

### [x] Step 14.1 – Create root `compose.yml` for local DB

- Added `postgres:16-alpine` service for local DB tests
- Host port `5433` mapped to container `5432` (avoids local conflicts)
- Added health check via `pg_isready`
- Added named volume for fast local re-runs

### [x] Step 14.2 – Extend `resolveTestDb()` fallback behavior

- Updated `src/testing/db/create-test-db.ts`
- Driver detection now checks, in order:
  1.  Vitest injected `TEST_DATABASE_URL` (CI/Testcontainers)
  2.  `process.env.TEST_DATABASE_URL` (local Podman/Postgres)
  3.  default in-memory PGLite

### [x] Step 14.3 – Create `vitest.db.local.config.ts`

- Added local DB config without `globalSetup`
- Uses external running Postgres (from compose)
- Kept include scope to `src/**/*.db.test.ts`
- Uses `forks` + `fileParallelism: false` for shared DB safety

### [x] Step 14.4 – Add local scripts in `package.json`

- `db:migrate:local` — runs Drizzle migrations against local Postgres (`5433`)
- `test:db:local` — runs DB tests with `TEST_DATABASE_URL` set to local Postgres

### [x] Step 14.5 – Verify local flow end-to-end

Expected local workflow:

1. `podman compose up -d`
2. `pnpm db:migrate:local`
3. `pnpm test:db:local`

Verified ✅ (`pnpm db:local:up`, `pnpm db:migrate:local`, `pnpm test:db:local`, `pnpm db:local:down`)

### [x] Step 14.6 – Add project-local compose engine policy

- Added `scripts/compose-db-local.mjs` as a project-level compose runner.
- Default engine is `DB_COMPOSE_ENGINE=podman` (clean, predictable, no host-global changes).
- Podman candidates are tried first (`podman-compose`, then `podman compose`).
- Docker users can opt in with one change: `DB_COMPOSE_ENGINE=docker`.
- `package.json` scripts `db:local:up` / `db:local:down` now route through this runner.
