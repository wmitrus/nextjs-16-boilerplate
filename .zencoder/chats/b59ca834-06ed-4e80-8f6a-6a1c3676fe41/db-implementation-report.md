# Local Dev Database — Implementation Report

**Date**: 2026-03-16  
**Status**: IMPLEMENTED

---

## 1. Objective

Implemented the approved local development Postgres database redesign from `db-design.md`. Added a safe, explicit, separate local development Postgres workflow using Podman, while preserving all existing test database and PGlite workflows.

---

## 2. Affected Files / Modules

| File                                                                 | Action       | Layer                    |
| -------------------------------------------------------------------- | ------------ | ------------------------ |
| `scripts/lib/db-guard.mjs`                                           | **Created**  | Scripts / Infrastructure |
| `scripts/lib/postgres-schema-reset.ts`                               | **Created**  | Scripts / Infrastructure |
| `scripts/db-ops.mjs`                                                 | **Created**  | Scripts / Infrastructure |
| `src/core/db/migrations/config/drizzle.dev.postgres.ts`              | **Created**  | Core / DB Config         |
| `docs/local-db.md`                                                   | **Created**  | Documentation            |
| `podman-compose.yml`                                                 | **Modified** | Infrastructure           |
| `package.json`                                                       | **Modified** | Scripts                  |
| `.env.example`                                                       | **Modified** | Config                   |
| `src/core/db/migrations/config/drizzle.local.ts` → `drizzle.test.ts` | **Renamed**  | Core / DB Config         |
| `docs/usage/03 - Testing Usage & DB Workflows.md`                    | **Modified** | Documentation            |

**Touch surface**: Scripts, compose infrastructure, DB config, env docs. No app code, no DI container, no auth, no runtime placement affected.

---

## 3. Implementation Plan Followed

Implemented exactly the approved design. No deviations. Sequence:

1. Created `scripts/lib/db-guard.mjs` — pure ESM guard utility
2. Created `scripts/lib/postgres-schema-reset.ts` — schema drop/recreate helper
3. Created `scripts/db-ops.mjs` — unified dangerous-op dispatcher
4. Created `src/core/db/migrations/config/drizzle.dev.postgres.ts` — Drizzle config for dev Postgres
5. Created `docs/local-db.md` — developer guide
6. Modified `podman-compose.yml` — added `dev-db` service
7. Modified `package.json` — added all canonical scripts, remapped aliases
8. Modified `.env.example` — added Profile C, clarified Profile B
9. Renamed `drizzle.local.ts` → `drizzle.test.ts`
10. Updated `docs/usage/03 - Testing Usage & DB Workflows.md` — updated stale `drizzle.local.ts` reference

---

## 4. Changes Made

### `scripts/lib/db-guard.mjs` (new)

Pure ESM guard module. No external dependencies. Exports:

- `DEV_DEFAULT_URL` — `postgres://postgres:postgres@127.0.0.1:5432/app_dev`
- `TEST_DEFAULT_URL` — `postgres://postgres:postgres@127.0.0.1:5433/app_test`
- `parsePostgresUrl(url)` — parses and validates a postgres:// URL; exits if not postgres
- `assertNotProduction()` — exits if `NODE_ENV === 'production'`
- `assertDevTarget(url)` — exits if port ≠ 5432, database === `app_test`, or database === `postgres`
- `assertTestTarget(url)` — exits if port ≠ 5433 or database ≠ `app_test`
- `guardDevOperation(url)` — calls `assertNotProduction` then `assertDevTarget`
- `guardTestOperation(url)` — calls `assertNotProduction` then `assertTestTarget`

All errors write to `stderr` with a `Hint:` line suggesting the correct script.

### `scripts/lib/postgres-schema-reset.ts` (new)

TypeScript helper called by `db-ops.mjs reset`. Connects with the `postgres` npm package, drops public schema, recreates it with full grants, exits cleanly. Called via `pnpm exec tsx`.

### `scripts/db-ops.mjs` (new)

Unified dispatcher. Interface: `node scripts/db-ops.mjs <dev|test> <migrate|seed|reset|studio> [--force]`

- Guards run before any DB connection for `migrate`, `seed`, `reset`
- `studio` is unguarded (read-only, no data destruction risk)
- `reset` requires `--force` or interactive "yes" confirmation
- Test target ignores non-postgres `DATABASE_URL` and falls back to `TEST_DEFAULT_URL` (prevents PGlite URL confusion)
- All operations pass `DATABASE_URL` explicitly via env to subprocess

### `src/core/db/migrations/config/drizzle.dev.postgres.ts` (new)

Drizzle config for dev Postgres. Reads `DATABASE_URL`, defaults to `postgres://postgres:postgres@127.0.0.1:5432/app_dev`. Throws at config load time if URL is not `postgres://` or `postgresql://` — no silent PGlite fallback.

### `docs/local-db.md` (new)

Developer guide with full instructions for all three DB profiles (PGlite, test Postgres container, dev Postgres container). Includes quickstart commands, property tables, and use-case guidance.

### `podman-compose.yml` (modified)

Added `dev-db` service:

```yaml
dev-db:
  image: postgres:16-alpine
  container_name: nextjs16_dev_db
  restart: unless-stopped
  ports:
    - '5432:5432'
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: app_dev
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U postgres -d app_dev']
    interval: 5s
    timeout: 5s
    retries: 20
  volumes:
    - nextjs16_dev_db_data:/var/lib/postgresql/data
```

`test-db` service: **unchanged** (port 5433, `app_test`, `nextjs16_test_db`).

### `package.json` (modified)

Script matrix implemented:

| Script                                          | Maps to                                           |
| ----------------------------------------------- | ------------------------------------------------- |
| `db:dev:up`                                     | `node scripts/compose-db-local.mjs up -d dev-db`  |
| `db:dev:down`                                   | `node scripts/compose-db-local.mjs stop dev-db`   |
| `db:dev:migrate`                                | `node scripts/db-ops.mjs dev migrate`             |
| `db:dev:seed`                                   | `node scripts/db-ops.mjs dev seed`                |
| `db:dev:studio`                                 | `node scripts/db-ops.mjs dev studio`              |
| `db:dev:reset`                                  | `node scripts/db-ops.mjs dev reset`               |
| `db:test:up`                                    | `node scripts/compose-db-local.mjs up -d test-db` |
| `db:test:down`                                  | `node scripts/compose-db-local.mjs stop test-db`  |
| `db:test:migrate`                               | `node scripts/db-ops.mjs test migrate`            |
| `db:test:seed`                                  | `node scripts/db-ops.mjs test seed`               |
| `db:test:studio`                                | `node scripts/db-ops.mjs test studio`             |
| `db:test:reset`                                 | `node scripts/db-ops.mjs test reset`              |
| `db:all:down`                                   | `node scripts/compose-db-local.mjs down`          |
| `db:local:up` _(deprecated alias)_              | `pnpm db:test:up`                                 |
| `db:local:down` _(deprecated alias, bug fixed)_ | `pnpm db:test:down`                               |
| `db:migrate:local` _(deprecated alias)_         | `pnpm db:test:migrate`                            |
| `db:studio:local` _(deprecated alias)_          | `pnpm db:test:studio`                             |

**Bug fixed**: old `db:local:down` stopped ALL compose services. It now delegates to `db:test:down` which scopes to `test-db` only.

### `drizzle.local.ts` → `drizzle.test.ts` (rename)

Content updated — error messages use `[drizzle.test]` prefix instead of `[drizzle.local]`. Logic unchanged.

### `docs/usage/03 - Testing Usage & DB Workflows.md` (modified)

Updated stale reference from `drizzle.local.ts` to `drizzle.test.ts`. Added `drizzle.dev.postgres.ts` entry.

---

## 5. Validation / Verification

### Typecheck

```
pnpm typecheck → ✅ passes (exit 0)
```

### Lint

```
pnpm lint → ✅ passes (exit 0)
```

### Guard behavior verified

| Scenario                                | Result                                                  |
| --------------------------------------- | ------------------------------------------------------- |
| `dev migrate` with port 5433 URL        | **BLOCKED** — stderr + Hint: use `pnpm db:test:migrate` |
| `test migrate` with port 5432 URL       | **BLOCKED** — stderr + Hint: use `pnpm db:dev:migrate`  |
| `dev migrate` with PGlite `file://` URL | **BLOCKED** — not a postgres:// URL                     |
| `NODE_ENV=production` on any guarded op | **BLOCKED** — local development only message            |
| `dev reset` without `--force`           | Interactive "yes" prompt shown; cancelled on non-"yes"  |
| `dev reset -- --force`                  | Skips prompt, proceeds                                  |

### Script matrix verified

All `db:local:*` aliases delegate to `db:test:*` with no independent logic. `db:local:down` now correctly scopes to `test-db` only (bug fixed).

### Config rename verified

- `drizzle.local.ts`: **does not exist**
- `drizzle.test.ts`: **exists**
- `drizzle.dev.postgres.ts`: **exists**
- No remaining source/script references to `drizzle.local.ts` in code or docs

### PGlite dev flow

`pnpm dev` requires no container. No changes to PGlite bootstrap. `scripts/reset-pglite.mjs` unchanged.

---

## 6. Risks / Follow-ups

| Item                                                       | Severity      | Notes                                                                                                                           |
| ---------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/db-seed.ts` does not exist yet                    | Low           | `db:dev:seed` and `db:test:seed` will fail until a seed script is created. Guard will pass but operation will error gracefully. |
| Guards are not applied to `studio`                         | Design intent | `studio` is read-only, unguarded per design spec. Low risk.                                                                     |
| `postgres-schema-reset.ts` uses the `postgres` npm package | Assumption    | The `postgres` package (`pg` or `postgres`) must be installed. Should be verified at first use of reset.                        |
| `db:local:*` aliases remain permanently                    | Design debt   | No sunset date defined. Consider removing after team migrates to `db:test:*`.                                                   |

No architectural risks introduced. Blast radius is limited to scripts and infra config.

---

**Status**: IMPLEMENTED
