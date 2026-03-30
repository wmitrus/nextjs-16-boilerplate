# Local Database Guide

This project supports three local database profiles. Choose the one that fits your workflow.

---

## Profile A — PGlite (default, recommended)

Zero-config. No container, no Podman, no setup.

```env
DB_PROVIDER=drizzle
DB_DRIVER=pglite
DATABASE_URL=file:./data/pglite
```

Data is stored in `./data/pglite/` (gitignored).

| Task                          | Command                |
| ----------------------------- | ---------------------- |
| Start dev server              | `pnpm dev`             |
| Run migrations                | `pnpm db:migrate:dev`  |
| Seed data                     | `pnpm db:seed`         |
| Open studio                   | `pnpm db:studio`       |
| Reset (wipe + migrate + seed) | `pnpm db:reset:pglite` |

**When to use**: Daily development, offline work, CI-free local testing.

**Limitations**: Single-process only (no parallel workers). Not suitable if your feature requires Postgres-specific extensions or SQL behaviors.

---

## Profile B — Test Postgres container (test-adjacent)

A persistent Podman container for running DB integration tests locally against real Postgres. This is the **test** database — **not** a dev database.

| Property  | Value                   |
| --------- | ----------------------- |
| Port      | 5433                    |
| Database  | `app_test`              |
| Container | `nextjs16_test_db`      |
| Volume    | `nextjs16_test_db_data` |

| Task                          | Command                |
| ----------------------------- | ---------------------- |
| Start container               | `pnpm db:test:up`      |
| Stop container                | `pnpm db:test:down`    |
| Run migrations                | `pnpm db:test:migrate` |
| Seed data                     | `pnpm db:test:seed`    |
| Open studio                   | `pnpm db:test:studio`  |
| Reset (wipe + migrate + seed) | `pnpm db:test:reset`   |
| Run DB integration tests      | `pnpm test:db:local`   |

**When to use**: Running `pnpm test:db:local` (DB integration tests against real Postgres locally).

**Note**: Do not set your app's `DATABASE_URL` to this profile for `pnpm dev` — it is the test database.

---

## Profile C — Dev Postgres container (opt-in)

A separate Podman container for running `pnpm dev` against real Postgres. Use this when your feature requires Postgres-specific behavior or you need external tool access (psql, pgAdmin, TablePlus).

| Property  | Value                  |
| --------- | ---------------------- |
| Port      | 5432                   |
| Database  | `app_dev`              |
| Container | `nextjs16_dev_db`      |
| Volume    | `nextjs16_dev_db_data` |

**First-time setup:**

```bash
pnpm db:dev:up
pnpm db:dev:migrate
pnpm db:dev:seed
```

Then set your `.env.local`:

```env
DB_PROVIDER=drizzle
DB_DRIVER=postgres
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/app_dev
```

| Task                          | Command               |
| ----------------------------- | --------------------- |
| Start container               | `pnpm db:dev:up`      |
| Stop container                | `pnpm db:dev:down`    |
| Run migrations                | `pnpm db:dev:migrate` |
| Seed data                     | `pnpm db:dev:seed`    |
| Open studio                   | `pnpm db:dev:studio`  |
| Reset (wipe + migrate + seed) | `pnpm db:dev:reset`   |
| Stop all containers           | `pnpm db:all:down`    |

**When to use**: Feature requires Postgres extensions, advisory locks, or production-parity validation before deploy.

---

## Safety guards

All destructive operations (`migrate`, `seed`, `reset`) have runtime guards that verify the target URL before opening any database connection.

- `db:dev:*` operations require port **5432** and reject the `app_test` database
- `db:test:*` operations require port **5433** and require the `app_test` database
- All operations are blocked when `NODE_ENV=production`
- `reset` requires typing `yes` interactively, or pass `--force` for automation

If you run the wrong script against the wrong database, you will see a clear error with a hint pointing to the correct command.

---

## Deprecated aliases

The following scripts are deprecated and will be removed in a future release. They delegate to the canonical `db:test:*` equivalents.

| Deprecated         | Canonical         |
| ------------------ | ----------------- |
| `db:local:up`      | `db:test:up`      |
| `db:local:down`    | `db:test:down`    |
| `db:migrate:local` | `db:test:migrate` |
| `db:studio:local`  | `db:test:studio`  |

---

## CI and E2E

- **Unit/integration DB tests** (`pnpm test:db`): use PGlite in-process — no container needed
- **CI DB tests** (`pnpm test:db:ci`): use Testcontainers — ephemeral Postgres, no persistent container
- **E2E tests** (`pnpm e2e:*`): use PGlite per-scenario, isolated and wiped before each run
- None of the above require the `dev-db` or `test-db` Podman containers to be running
