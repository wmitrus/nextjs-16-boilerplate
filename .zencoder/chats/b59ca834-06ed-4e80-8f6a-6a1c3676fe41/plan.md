# Local Dev Database Setup — Workflow Plan

## Artifacts

| File                  | Purpose                                        | Status         |
| --------------------- | ---------------------------------------------- | -------------- |
| `db-current-state.md` | Repository state at time of analysis           | Reference only |
| `db-design.md`        | **Authoritative implementation specification** | Active         |
| `plan.md`             | This file                                      | Active         |

---

## Steps

### [x] Current State Analysis

Inspected all DB-related scripts, configs, containers, env files, test setups, and helpers.

Output: `db-current-state.md`

---

### [x] Design (including refinement and consolidation)

Produced a single, clean, implementation-ready design. Covers:

- dev-db container (port 5432, `app_dev`) separate from test-db (port 5433, `app_test`)
- `db:dev:*` and `db:test:*` canonical script families
- `db:local:*` deprecated aliases pointing to `db:test:*`
- Mandatory runtime guards (`scripts/lib/db-guard.mjs`)
- Unified operation runner (`scripts/db-ops.mjs`)
- `drizzle.local.ts` → `drizzle.test.ts` rename
- PGlite remains the default

Output: `db-design.md`

---

### [ ] Implementation

**Awaiting confirmation before proceeding.**

Read `db-design.md` before implementing. All decisions are there.

#### Files to CREATE

| File                                                    | Purpose                                                |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `scripts/lib/db-guard.mjs`                              | Guard utility — pure ESM, no external deps             |
| `scripts/db-ops.mjs`                                    | Unified dangerous-operation dispatcher                 |
| `src/core/db/migrations/config/drizzle.dev.postgres.ts` | Drizzle config for dev Postgres (port 5432, `app_dev`) |
| `docs/local-db.md`                                      | Developer guide for all DB profiles                    |

#### Files to MODIFY

| File                 | Change                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `podman-compose.yml` | Add `dev-db` service: port 5432, db `app_dev`, container `nextjs16_dev_db`, volume `nextjs16_dev_db_data`, healthcheck matching `test-db` pattern |
| `package.json`       | Add `db:dev:*`, `db:test:*`, `db:all:down`. Remap `db:local:*` as deprecated aliases calling `db:test:*`.                                         |
| `.env.example`       | Add Profile C (Postgres dev) comment block; clarify Profile B targets test-container workflow                                                     |

#### Files to RENAME

| From                                             | To                                              | Content change           |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------ |
| `src/core/db/migrations/config/drizzle.local.ts` | `src/core/db/migrations/config/drizzle.test.ts` | None — content unchanged |

Update all references to `drizzle.local.ts` after rename.

#### Hard constraints

1. Guards run FIRST — before any DB connection is opened
2. No standalone per-operation Postgres scripts — all dangerous ops route through `db-ops.mjs`
3. No `SKIP_GUARD` escape hatch
4. `db:local:*` aliases call `db:test:*` with no independent logic
5. `db-ops.mjs reset` requires `--force` or interactive confirmation
6. Do NOT change test container service name (`test-db`), port (5433), or database (`app_test`)
7. Do NOT modify `reset-pglite.mjs`, E2E scripts, or E2E env files
8. Do NOT apply guards to `up`, `down`, `studio`
9. Guard errors to stderr with `Hint:` suggesting the correct script

---

### [ ] Validation

After implementation:

**Container separation**

- `pnpm db:dev:up` starts only `dev-db` (port 5432)
- `pnpm db:test:up` starts only `test-db` (port 5433)
- `pnpm db:test:down` stops only `test-db`
- `pnpm db:dev:down` stops only `dev-db`
- `pnpm db:all:down` stops both

**Guard enforcement**

- `pnpm db:dev:migrate` with `DATABASE_URL` at port 5433 → BLOCKED + hint
- `pnpm db:test:migrate` with `DATABASE_URL` at port 5432 → BLOCKED + hint
- Any destructive op with `NODE_ENV=production` → BLOCKED
- `pnpm db:dev:reset` without `--force` → confirmation prompt shown
- `pnpm db:dev:reset -- --force` → skips prompt, proceeds

**Alias behavior**

- `pnpm db:local:up` = `pnpm db:test:up`
- `pnpm db:local:down` stops only `test-db` (bug fix verified)
- `pnpm db:migrate:local` = `pnpm db:test:migrate` (now guarded)

**Unaffected workflows**

- `pnpm dev` works with PGlite — no container needed
- `pnpm test:db:local` connects to 5433/app_test
- `pnpm test:db:ci` uses Testcontainers
- `pnpm e2e:scenario:single` uses PGlite at `./data/e2e/single`
- `pnpm db:reset:pglite` works unchanged
- `pnpm typecheck` passes
- `pnpm lint` passes

**Config rename**

- `drizzle.local.ts` no longer exists
- `drizzle.test.ts` exists with all references updated
- `drizzle.dev.postgres.ts` exists targeting port 5432/app_dev

---

### [ ] Final Check

- Dev and test containers fully separated
- No script cross-targets dev and test
- PGlite, E2E, and CI workflows unchanged
- `docs/local-db.md` accurately describes all three profiles
