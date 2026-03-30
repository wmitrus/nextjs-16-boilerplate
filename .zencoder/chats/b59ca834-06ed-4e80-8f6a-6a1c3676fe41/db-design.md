# Local Development Database Design

**Date**: 2026-03-16
**Status**: Final — authoritative implementation specification

---

## Overview

Adds a stable local development Postgres workflow using Podman, while preserving the existing testing-oriented Podman setup and keeping dev and test clearly separated.

**Key decisions:**

- PGlite remains the zero-config default for `pnpm dev`
- Local Postgres dev container is opt-in
- Dev and test containers are fully separated by name, port, volume, and database
- All dangerous DB operations (migrate, seed, reset) are guarded at runtime
- Script names express intent unambiguously: `db:dev:*` = dev, `db:test:*` = test

---

## 1. Infrastructure Separation

### Data paths

| Path                    | Used by    | Purpose                             |
| ----------------------- | ---------- | ----------------------------------- |
| `./data/pglite`         | Dev PGlite | Default dev, file-based             |
| `./data/e2e/{scenario}` | E2E PGlite | Per-scenario, wiped before each run |

### Podman containers

| Property             | Dev container          | Test container                      |
| -------------------- | ---------------------- | ----------------------------------- |
| Compose service name | `dev-db`               | `test-db` (unchanged)               |
| Container name       | `nextjs16_dev_db`      | `nextjs16_test_db` (unchanged)      |
| Host port            | **5432**               | **5433** (unchanged)                |
| Database name        | `app_dev`              | `app_test` (unchanged)              |
| Named volume         | `nextjs16_dev_db_data` | `nextjs16_test_db_data` (unchanged) |
| Postgres image       | `postgres:16-alpine`   | `postgres:16-alpine` (unchanged)    |

The `dev-db` service is added to the existing `podman-compose.yml` (single compose file, Option A).

---

## 2. Drizzle Config Set

| Config file               | Targets                               | Status                          |
| ------------------------- | ------------------------------------- | ------------------------------- |
| `drizzle.dev.ts`          | PGlite dev (`./data/pglite`)          | Unchanged                       |
| `drizzle.local.ts`        | _(deleted — renamed)_                 | **Rename to `drizzle.test.ts`** |
| `drizzle.test.ts`         | Test Postgres (port 5433, `app_test`) | New name for `drizzle.local.ts` |
| `drizzle.dev.postgres.ts` | Dev Postgres (port 5432, `app_dev`)   | New                             |
| `drizzle.prod.ts`         | Prod Postgres                         | Unchanged                       |

`drizzle.dev.postgres.ts` behavior:

- Reads `DATABASE_URL` from env
- Defaults to `postgres://postgres:postgres@127.0.0.1:5432/app_dev` if not set
- Validates URL is `postgres://` — throws if it is not
- No silent fallback to PGlite

---

## 3. Env Profiles

### Profile A — PGlite dev (default, zero-config)

```env
DB_PROVIDER=drizzle
DB_DRIVER=pglite
DATABASE_URL=file:./data/pglite
```

### Profile B — Test Postgres container (test-adjacent)

```env
# Used by db:test:* scripts and test:db:local
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/app_test
```

### Profile C — Dev Postgres container (opt-in)

```env
DB_PROVIDER=drizzle
DB_DRIVER=postgres
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/app_dev
```

`.env.example` must:

- Add Profile C comment block
- Clarify that Profile B targets the test container workflow, not a dev workflow

---

## 4. Script Naming Policy

### Naming tiers

| Prefix                | Means                              | Backend           |
| --------------------- | ---------------------------------- | ----------------- |
| `db:dev:*`            | Dev Postgres container operations  | `app_dev` @ 5432  |
| `db:test:*`           | Test Postgres container operations | `app_test` @ 5433 |
| `db:*` (no qualifier) | PGlite dev operations              | `./data/pglite`   |

### Canonical script set — dev Postgres (`db:dev:*`)

| Script           | Implementation                                   | Guard             |
| ---------------- | ------------------------------------------------ | ----------------- |
| `db:dev:up`      | `node scripts/compose-db-local.mjs up -d dev-db` | No                |
| `db:dev:down`    | `node scripts/compose-db-local.mjs stop dev-db`  | No                |
| `db:dev:migrate` | `node scripts/db-ops.mjs dev migrate`            | **Yes**           |
| `db:dev:seed`    | `node scripts/db-ops.mjs dev seed`               | **Yes**           |
| `db:dev:studio`  | `node scripts/db-ops.mjs dev studio`             | No                |
| `db:dev:reset`   | `node scripts/db-ops.mjs dev reset`              | **Yes** + confirm |

### Canonical script set — test Postgres container (`db:test:*`)

| Script            | Implementation                                    | Guard             | Replaces           |
| ----------------- | ------------------------------------------------- | ----------------- | ------------------ |
| `db:test:up`      | `node scripts/compose-db-local.mjs up -d test-db` | No                | `db:local:up`      |
| `db:test:down`    | `node scripts/compose-db-local.mjs stop test-db`  | No                | `db:local:down`    |
| `db:test:migrate` | `node scripts/db-ops.mjs test migrate`            | **Yes**           | `db:migrate:local` |
| `db:test:seed`    | `node scripts/db-ops.mjs test seed`               | **Yes**           | _(new)_            |
| `db:test:studio`  | `node scripts/db-ops.mjs test studio`             | No                | `db:studio:local`  |
| `db:test:reset`   | `node scripts/db-ops.mjs test reset`              | **Yes** + confirm | _(new)_            |

### Full teardown

| Script        | Implementation                           |
| ------------- | ---------------------------------------- |
| `db:all:down` | `node scripts/compose-db-local.mjs down` |

---

## 5. Legacy Alias Policy (`db:local:*`)

The existing `db:local:*` scripts targeted the test container but were misleadingly named as "local dev". They are converted to deprecated aliases.

### Alias mapping

| Deprecated alias   | Delegates to      | Behavior change                                                  |
| ------------------ | ----------------- | ---------------------------------------------------------------- |
| `db:local:up`      | `db:test:up`      | None                                                             |
| `db:local:down`    | `db:test:down`    | **Bug fix**: was stopping ALL services, now stops only `test-db` |
| `db:migrate:local` | `db:test:migrate` | Now guarded (was unguarded)                                      |
| `db:studio:local`  | `db:test:studio`  | None                                                             |

### Alias implementation rule

Each alias calls its canonical equivalent with no independent logic:

```json
"db:local:up": "pnpm db:test:up",
"db:local:down": "pnpm db:test:down",
"db:migrate:local": "pnpm db:test:migrate",
"db:studio:local": "pnpm db:test:studio"
```

Any fix or guard applied to the canonical command is automatically inherited by the alias.

### Deprecation lifecycle

| Phase                    | Action                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Phase 2 (implementation) | Add `db:test:*` canonical commands. Keep `db:local:*` as aliases. Add deprecation comment in `package.json`. |
| Phase 3 (future PR)      | Remove `db:local:*` aliases. Update docs.                                                                    |

---

## 6. Runtime Safety Guards

### Guard classification

| Operation              | Guard required         | Reason                                 |
| ---------------------- | ---------------------- | -------------------------------------- |
| `up`, `down`, `studio` | No                     | Non-destructive / read-only            |
| `migrate`              | **Yes**                | Irreversible schema changes            |
| `seed`                 | **Yes**                | May overwrite or corrupt existing data |
| `reset`                | **Yes** + confirmation | Destroys all data                      |

### Guard architecture

```
scripts/
  lib/
    db-guard.mjs   ← shared guard utility (pure ESM, no external deps)
  db-ops.mjs       ← unified dangerous-operation dispatcher
  reset-pglite.mjs ← existing (unchanged — has its own guards)
```

All dangerous Postgres operations route through `db-ops.mjs`. No standalone per-operation scripts.

### Guard utility contract (`scripts/lib/db-guard.mjs`)

```javascript
// Parses a postgres URL. Throws if not a valid postgres:// or postgresql:// URL.
export function parsePostgresUrl(url)
// Returns: { host, port, database, user, password }

// Asserts URL targets the dev container profile.
export function assertDevTarget(url)

// Asserts URL targets the test container profile.
export function assertTestTarget(url)

// Refuses to run in production (NODE_ENV !== 'production').
export function assertNotProduction()

// Calls assertNotProduction() + assertDevTarget(url).
export function guardDevOperation(url)

// Calls assertNotProduction() + assertTestTarget(url).
export function guardTestOperation(url)
```

### Dev target validation (`assertDevTarget`)

| Property   | Rule                             | Error message                                                             |
| ---------- | -------------------------------- | ------------------------------------------------------------------------- |
| URL prefix | `postgres://` or `postgresql://` | "DATABASE_URL must be a postgres:// URL for dev operations"               |
| Port       | `=== 5432`                       | "Dev operations require port 5432. Got: {port}. Did you mean db:test:\*?" |
| Database   | `!== 'app_test'`                 | "Refusing dev operation against 'app_test'. Did you mean db:test:\*?"     |
| Database   | `!== 'postgres'`                 | "Refusing dev operation against system database 'postgres'."              |
| NODE_ENV   | `!== 'production'`               | "Refusing: NODE_ENV=production"                                           |

Note: `app_dev` is the expected default but is **not strictly enforced** — negative checks are the safety boundary, not a positive match. A developer may use a custom database name.

### Test target validation (`assertTestTarget`)

| Property   | Rule                             | Error message                                                             |
| ---------- | -------------------------------- | ------------------------------------------------------------------------- |
| URL prefix | `postgres://` or `postgresql://` | "DATABASE_URL must be a postgres:// URL for test operations"              |
| Port       | `=== 5433`                       | "Test operations require port 5433. Got: {port}. Did you mean db:dev:\*?" |
| Database   | `=== 'app_test'`                 | "Test operations require database 'app_test'. Got: {database}."           |
| NODE_ENV   | `!== 'production'`               | "Refusing: NODE_ENV=production"                                           |

Note: test target enforces an exact database name match because `app_test` is a fixed contract.

### URL source per target

| Target | URL read from      | Default if unset                                       |
| ------ | ------------------ | ------------------------------------------------------ |
| `dev`  | `DATABASE_URL` env | `postgres://postgres:postgres@127.0.0.1:5432/app_dev`  |
| `test` | `DATABASE_URL` env | `postgres://postgres:postgres@127.0.0.1:5433/app_test` |

### Guard error message format

All errors go to **stderr**. Format:

```
[db-guard] BLOCKED: dev operation target check failed.
  Found   : postgres://postgres:postgres@127.0.0.1:5433/app_test
  Expected: port 5432, database ≠ app_test
  Hint    : You may be targeting the test database. Run `pnpm db:test:migrate` instead.
```

Guards run **before any DB connection is opened**. A blocked guard must not open any connection.

---

## 7. Unified Operation Runner (`scripts/db-ops.mjs`)

### Interface

```
node scripts/db-ops.mjs <target> <operation> [--force]
  target:    dev | test
  operation: migrate | seed | reset | studio
  --force:   skip confirmation prompt (reset only)
```

### Internal execution flow

1. Parse `target` and `operation` from args
2. Resolve URL for target (env or default)
3. For destructive operations: call `guardDevOperation(url)` or `guardTestOperation(url)`
4. For `reset`: prompt for confirmation unless `--force` is passed
5. Log resolved host, port, database (no password) before proceeding
6. Execute the operation (drizzle-kit CLI call or tsx call)

### Confirmation prompt (reset only)

```
⚠️  You are about to RESET the dev database (app_dev @ 127.0.0.1:5432).
    This will destroy all data.
    Type "yes" to continue or Ctrl+C to abort: _
```

`--force` skips the prompt — required for automation without a TTY.

---

## 8. Complete Post-Implementation Script Map

### PGlite dev (default — all existing, unchanged)

| Script            | Target                                      |
| ----------------- | ------------------------------------------- |
| `db:generate`     | `./data/pglite`                             |
| `db:migrate:dev`  | `./data/pglite`                             |
| `db:seed`         | PGlite (reads `DB_DRIVER`, defaults pglite) |
| `db:studio`       | `./data/pglite`                             |
| `db:reset:pglite` | `./data/pglite`                             |
| `db:export:sql`   | `./data/pglite`                             |

### Dev Postgres container (new)

| Script           | Target           | Guard             |
| ---------------- | ---------------- | ----------------- |
| `db:dev:up`      | `dev-db` service | No                |
| `db:dev:down`    | `dev-db` service | No                |
| `db:dev:migrate` | `app_dev` @ 5432 | **Yes**           |
| `db:dev:seed`    | `app_dev` @ 5432 | **Yes**           |
| `db:dev:studio`  | `app_dev` @ 5432 | No                |
| `db:dev:reset`   | `app_dev` @ 5432 | **Yes** + confirm |

### Test Postgres container (new canonical)

| Script            | Target            | Guard             |
| ----------------- | ----------------- | ----------------- |
| `db:test:up`      | `test-db` service | No                |
| `db:test:down`    | `test-db` service | No                |
| `db:test:migrate` | `app_test` @ 5433 | **Yes**           |
| `db:test:seed`    | `app_test` @ 5433 | **Yes**           |
| `db:test:studio`  | `app_test` @ 5433 | No                |
| `db:test:reset`   | `app_test` @ 5433 | **Yes** + confirm |

### Full teardown

| Script        | Action                     |
| ------------- | -------------------------- |
| `db:all:down` | Stops all compose services |

### Deprecated aliases (Phase 2, removed in Phase 3)

| Alias              | Maps to           |
| ------------------ | ----------------- |
| `db:local:up`      | `db:test:up`      |
| `db:local:down`    | `db:test:down`    |
| `db:migrate:local` | `db:test:migrate` |
| `db:studio:local`  | `db:test:studio`  |

### Prod (unchanged)

| Script            | Target                      |
| ----------------- | --------------------------- |
| `db:migrate:prod` | Postgres via `DATABASE_URL` |
| `db:migrate:cli`  | Reads env                   |

### Test suites (unchanged)

| Script          | Backend                    |
| --------------- | -------------------------- |
| `test:db`       | PGlite in-process          |
| `test:db:ci`    | Testcontainers (ephemeral) |
| `test:db:local` | Podman test-db @ 5433      |

---

## 9. Hard Implementation Constraints

### Files to create

| File                                                    | Purpose                                |
| ------------------------------------------------------- | -------------------------------------- |
| `scripts/lib/db-guard.mjs`                              | Guard utility — pure ESM               |
| `scripts/db-ops.mjs`                                    | Unified dangerous-operation dispatcher |
| `src/core/db/migrations/config/drizzle.dev.postgres.ts` | Drizzle config for dev Postgres        |
| `docs/local-db.md`                                      | Developer guide for all DB profiles    |

### Files to modify

| File                 | Change                                                                                |
| -------------------- | ------------------------------------------------------------------------------------- |
| `podman-compose.yml` | Add `dev-db` service                                                                  |
| `package.json`       | Add `db:dev:*`, `db:test:*`, `db:all:down`. Remap `db:local:*` as deprecated aliases. |
| `.env.example`       | Add Profile C block; clarify Profile B is test-container workflow                     |

### Files to rename

| From                                             | To                                              | Content change |
| ------------------------------------------------ | ----------------------------------------------- | -------------- |
| `src/core/db/migrations/config/drizzle.local.ts` | `src/core/db/migrations/config/drizzle.test.ts` | None           |

Update all references to `drizzle.local.ts` after rename.

### Must NOT be violated

- Guards run FIRST — before any DB connection is opened
- No standalone per-operation Postgres scripts
- No `SKIP_GUARD` or any guard escape hatch
- `db:local:*` aliases call `db:test:*` with no independent logic
- Do NOT change test container service name, port, or database
- Do NOT modify `reset-pglite.mjs` or any E2E scripts or E2E env files
- Do NOT apply guards to `up`, `down`, `studio` operations
- Guard errors go to stderr with a `Hint:` suggesting the correct script

---

## 10. PGlite Policy

PGlite remains the default indefinitely.

| Reason              | Detail                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Zero-infrastructure | `pnpm dev` works with no container                                |
| Offline capable     | No Docker/Podman required                                         |
| E2E isolation       | Each scenario gets its own clean DB, wiped before each run        |
| CI simplicity       | Unit/integration DB tests use in-process PGlite or Testcontainers |

**Use Postgres dev container when**: a feature requires Postgres-specific extensions, external tool inspection (pgAdmin, psql), or production-parity validation.

**PGlite known limitations**: single-process only; WASM abort can corrupt `./data/pglite` (recoverable via `db:reset:pglite`); not 100% Postgres-compatible for advanced extensions.
