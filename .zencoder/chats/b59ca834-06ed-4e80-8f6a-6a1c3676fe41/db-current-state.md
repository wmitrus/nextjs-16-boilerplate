# Current State Analysis — Local Development Database Setup

**Date**: 2026-03-16  
**Scope**: Local development Postgres workflow for Next.js 16 modular monolith  
**Status**: Analysis only — no changes proposed here

---

## 1. Files Inspected

| File                                             | Purpose                                       |
| ------------------------------------------------ | --------------------------------------------- |
| `package.json`                                   | All script definitions                        |
| `podman-compose.yml`                             | Only container definition in repo             |
| `src/core/db/create-db.ts`                       | DB factory — driver selection                 |
| `src/core/db/drivers/create-pglite.ts`           | PGlite driver                                 |
| `src/core/db/drivers/create-postgres.ts`         | Postgres driver                               |
| `src/core/db/types.ts`                           | DB type contracts                             |
| `src/core/db/index.ts`                           | DB public API                                 |
| `src/core/db/migrate-cli.ts`                     | CLI migration entrypoint                      |
| `src/core/db/migrations/run-migrations.ts`       | Migration runner                              |
| `src/core/db/migrations/config/drizzle.dev.ts`   | Drizzle config — PGlite dev                   |
| `src/core/db/migrations/config/drizzle.local.ts` | Drizzle config — Postgres "local"             |
| `src/core/db/migrations/config/drizzle.prod.ts`  | Drizzle config — Postgres prod                |
| `scripts/compose-db-local.mjs`                   | Compose command proxy (Podman/Docker)         |
| `scripts/db-seed.ts`                             | Seed entrypoint                               |
| `scripts/reset-pglite.mjs`                       | PGlite reset + remigrate + reseed             |
| `scripts/e2e/load-env.mjs`                       | E2E env loading + DB path resolution          |
| `scripts/e2e/run-scenario.mjs`                   | E2E scenario runner                           |
| `scripts/e2e/env/base.env`                       | Base E2E env (sets DB_DRIVER=pglite)          |
| `scripts/e2e/env/single.env`                     | Single-tenancy E2E env                        |
| `.env.example`                                   | Env template                                  |
| `.env.local`                                     | Live local env (current developer config)     |
| `.env.e2e.local`                                 | Local E2E secrets                             |
| `vitest.db.config.ts`                            | DB tests — PGlite (threads)                   |
| `vitest.db.ci.config.ts`                         | DB tests — Testcontainers (forks)             |
| `vitest.db.local.config.ts`                      | DB tests — against Podman test-db container   |
| `tests/db/setup.postgres.ts`                     | Global setup for CI DB tests (Testcontainers) |

---

## 2. Current Dev DB Path

**Default** (zero-config): PGlite file-based store at `./data/pglite`

- Controlled by `DB_DRIVER=pglite` (default when not production)
- `DATABASE_URL=file:./data/pglite` (from `.env.local`)
- `predev` script removes `data/pglite/postmaster.pid` on each dev start to unblock stale locks
- Data directory exists: `data/pglite/` (confirmed present)

**No default Postgres dev container exists.** Zero Postgres infrastructure is configured or expected for `pnpm dev`.

---

## 3. Current Test DB Path

Three test database configurations exist in parallel:

### 3a. PGlite in-process (unit/integration DB tests)

- Script: `pnpm test:db` → `vitest.db.config.ts`
- Pool: threads (in-process, no shared state)
- DB: PGlite in-memory or ephemeral
- Isolation: per-test-file thread isolation

### 3b. Testcontainers (CI DB tests)

- Script: `pnpm test:db:ci` → `vitest.db.ci.config.ts`
- Global setup: `tests/db/setup.postgres.ts`
- Spins up `postgres:16-alpine` via `@testcontainers/postgresql`
- Ephemeral — lives only for test run duration
- Migrations applied at setup: `runMigrations(db, 'postgres')`
- Connection URL injected via `project.provide('TEST_DATABASE_URL', url)`
- Pool: forks, fileParallelism: false
- No dependency on Podman or persistent containers

### 3c. Podman test-db container (local DB integration tests)

- Script: `pnpm test:db:local`
- Env: `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/app_test`
- Requires: `podman-compose.yml` service `test-db` to be running
- Container: `nextjs16_test_db`
- DB: `app_test`, port: 5433
- Config: `vitest.db.local.config.ts`

### 3d. E2E tests (PGlite, per-scenario)

- All E2E scenarios use `DB_DRIVER=pglite` (from `scripts/e2e/env/base.env`)
- Each scenario gets an isolated PGlite path: `./data/e2e/{scenario}` or `./data/e2e/{scenario}-{variant}`
- Computed in `load-env.mjs` → `resolveScenarioDatabaseUrl()`
- Reset before each run: `run-scenario.mjs` does `fs.rmSync(databasePath, { recursive: true, force: true })`
- Migrations + seed applied via `pnpm db:migrate:dev` and `pnpm db:seed` (both target pglite path in E2E env)

---

## 4. Current Script Matrix

### DB lifecycle scripts

| Script             | Config / Target                      | DB Backend                             | Notes                                |
| ------------------ | ------------------------------------ | -------------------------------------- | ------------------------------------ |
| `db:generate`      | `drizzle.dev.ts`                     | PGlite                                 | Schema codegen                       |
| `db:migrate:dev`   | `drizzle.dev.ts`                     | PGlite (`./data/pglite`)               | Dev migrations                       |
| `db:migrate:prod`  | `drizzle.prod.ts`                    | Postgres (requires `DATABASE_URL`)     | Prod migrations                      |
| `db:migrate:cli`   | `migrate-cli.ts`                     | Reads `DB_DRIVER` env                  | Flexible                             |
| `db:migrate:local` | `drizzle.local.ts`                   | Postgres `127.0.0.1:5433/app_test`     | **⚠️ hardcoded to test DB URL**      |
| `db:local:up`      | `compose-db-local.mjs up -d test-db` | Starts **test-db** service             | **⚠️ "local" starts test container** |
| `db:local:down`    | `compose-db-local.mjs down`          | Stops containers                       | All services                         |
| `db:studio`        | `drizzle.dev.ts`                     | PGlite                                 | Dev studio                           |
| `db:studio:local`  | hardcoded `127.0.0.1:5433/app_test`  | **⚠️ test DB URL**                     | —                                    |
| `db:seed`          | `db-seed.ts`                         | Reads `DB_DRIVER` env, defaults pglite | Seeds current DB                     |
| `db:reset:pglite`  | `reset-pglite.mjs`                   | PGlite only                            | Delete + remigrate + reseed          |
| `db:export:sql`    | `drizzle.dev.ts`                     | PGlite                                 | Exports schema SQL                   |

### Test scripts (DB-adjacent)

| Script          | Config                      | DB Used                             |
| --------------- | --------------------------- | ----------------------------------- |
| `test:db`       | `vitest.db.config.ts`       | PGlite (in-process threads)         |
| `test:db:ci`    | `vitest.db.ci.config.ts`    | Testcontainers (ephemeral Postgres) |
| `test:db:local` | `vitest.db.local.config.ts` | Podman test-db at 5433              |

### E2E scripts (DB-adjacent)

| Script                      | DB Path                            |
| --------------------------- | ---------------------------------- |
| `e2e:scenario:single`       | `./data/e2e/single` (PGlite)       |
| `e2e:scenario:personal`     | `./data/e2e/personal` (PGlite)     |
| `e2e:scenario:org-provider` | `./data/e2e/org-provider` (PGlite) |
| `e2e:scenario:org-db`       | `./data/e2e/org-db` (PGlite)       |

---

## 5. Currently Coupled Areas

### 5a. "local" = test container (naming collision — MAJOR risk)

The `db:local:*` family of scripts uses the **test container** and **test database URL**:

```
db:local:up      → starts service named "test-db" in podman-compose.yml
db:migrate:local → targets postgres://postgres:postgres@127.0.0.1:5433/app_test
db:studio:local  → targets postgres://postgres:postgres@127.0.0.1:5433/app_test
```

A developer reading `pnpm db:local:up` reasonably assumes this is a "local dev" database, not the test database. The service name in compose (`test-db`) and the database name (`app_test`) make the intent clear to anyone reading `podman-compose.yml`, but the script name `db:local:up` actively misleads.

**Risk**: A developer could run migrations or seeds against the test-db container under the belief they are working with a dev DB, corrupting test data state.

### 5b. `db:reset:pglite` implicitly chains to `db:migrate:dev` + `db:seed`

The chain targets PGlite only. If `DATABASE_URL` is set to a Postgres URL, `db:migrate:dev` silently falls back to the PGlite default path. This is safe for PGlite reset but can be confusing.

### 5c. E2E runner chains `db:migrate:dev` + `db:seed`

`run-scenario.mjs` applies the E2E env (DB_DRIVER=pglite, custom path), then calls:

1. `pnpm db:migrate:dev` — targets PGlite scenario path (from env)
2. `pnpm db:seed` — seeds PGlite scenario path (from env)

This works correctly because `resolveScenarioDatabaseUrl` overrides `DATABASE_URL` before spawning. The chain is sound but relies on env override ordering being correct.

### 5d. `drizzle.dev.ts` silently ignores postgres:// URLs

If `DATABASE_URL` contains a postgres:// URL, `drizzle.dev.ts` falls back silently to `./data/pglite`. This is a surprise behavior — a developer who sets `DATABASE_URL=postgres://...` and runs `db:migrate:dev` gets PGlite migration, not Postgres.

---

## 6. Risky Assumptions

| #   | Assumption                                    | Risk Level | Detail                                                                                                  |
| --- | --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| 1   | `db:local:up` = dev database                  | **HIGH**   | Actually starts test container                                                                          |
| 2   | `db:migrate:local` = dev migration            | **HIGH**   | Targets test DB URL hardcoded                                                                           |
| 3   | Running `db:reset:pglite` resets dev DB only  | MEDIUM     | Correct, but only if `DB_DRIVER=pglite` is active; no postgres reset path exists                        |
| 4   | `db:local:down` stops only test container     | MEDIUM     | Stops all services in compose file — currently that's only test-db, but adding dev-db would change this |
| 5   | E2E runner correctly isolates from dev PGlite | LOW        | Confirmed: uses `./data/e2e/{scenario}`, wiped before each run                                          |
| 6   | Testcontainers CI tests are always isolated   | LOW        | Confirmed: ephemeral container per test run                                                             |

---

## 7. Missing Separation

| Gap                                                                  | Impact                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| No dedicated `dev-db` Postgres service                               | Developers who need Postgres locally reuse test container              |
| No separate port for dev Postgres                                    | Port 5433 is shared between test and any dev Postgres workflow         |
| No separate database name for dev Postgres                           | `app_test` is used for both purposes                                   |
| No `db:dev:*` script family                                          | Dev Postgres workflow is served by `db:local:*` which names it as test |
| No clear reset path for local Postgres dev                           | `db:reset:pglite` exists, nothing equivalent for Postgres dev          |
| `drizzle.local.ts` is semantically dev-adjacent but targets test URL | Naming drift — "local" config implies dev, but targets test container  |
