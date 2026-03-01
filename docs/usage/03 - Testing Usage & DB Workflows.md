# Testing Usage & DB Workflows

## Purpose

This guide is the operational reference for running tests in this repository.
It consolidates test commands, Vitest config intent, local/CI DB workflows, and migration config paths used by the modular monolith.

## Testing Matrix

| Scope                        | Command                 | Config                         | Notes                                                            |
| ---------------------------- | ----------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Unit                         | `pnpm test`             | `vitest.unit.config.ts`        | JSDOM, setup files, coverage in `coverage/unit`                  |
| Unit watch                   | `pnpm test:watch`       | `vitest.unit.config.ts`        | Fast local feedback                                              |
| Integration                  | `pnpm test:integration` | `vitest.integration.config.ts` | JSDOM + integration includes, coverage in `coverage/integration` |
| DB (PGLite)                  | `pnpm test:db`          | `vitest.db.config.ts`          | In-memory `memory://`, migrations per test DB instance           |
| DB (CI/Testcontainers)       | `pnpm test:db:ci`       | `vitest.db.ci.config.ts`       | Postgres from Testcontainers via `globalSetup`                   |
| DB (Local external Postgres) | `pnpm test:db:local`    | `vitest.db.local.config.ts`    | Uses `TEST_DATABASE_URL`, no `globalSetup`                       |
| E2E                          | `pnpm e2e`              | `playwright.config.ts`         | Dev-server driven full browser tests                             |
| E2E CI                       | `pnpm e2e:ci`           | `playwright.config.ts`         | Build + Playwright run                                           |

## Vitest Config Roles

- `vitest.unit.config.ts`
  - Includes `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.{ts,tsx}`.
  - Excludes integration test patterns.
  - Uses `tests/setup.tsx` and `tests/polyfills.ts`.

- `vitest.integration.config.ts`
  - Includes `src/**/*.integration.test.{ts,tsx}` and `src/testing/integration/**/*.test.{ts,tsx}`.
  - Uses the same setup files and JSDOM environment.

- `vitest.db.config.ts`
  - Includes `src/**/*.db.test.ts`.
  - Uses in-process PGLite (thread pool) for fast isolated local DB tests.

- `vitest.db.ci.config.ts`
  - Includes `src/**/*.db.test.ts`.
  - Uses `tests/db/setup.postgres.ts` global setup with Testcontainers.
  - Runs in forks with `fileParallelism: false` for shared DB safety.

- `vitest.db.local.config.ts`
  - Includes `src/**/*.db.test.ts`.
  - No global setup; expects external Postgres URL from env.
  - Uses forks + `fileParallelism: false`.

## DB Test Runtime Resolution

`src/testing/db/create-test-db.ts` resolves DB backend in this order:

1. Vitest provided context `TEST_DATABASE_URL` (CI/Testcontainers path)
2. `process.env.TEST_DATABASE_URL` (local external Postgres path)
3. Default in-memory PGLite (`memory://`)

This keeps `*.db.test.ts` files driver-agnostic.

## Local Postgres Workflow (Podman-first)

### Standard flow

```bash
pnpm db:local:up
pnpm db:migrate:local
pnpm test:db:local
pnpm db:local:down
```

### Compose engine policy

- Default engine is Podman for this repository.
- Compose execution is centralized in `scripts/compose-db-local.mjs`.
- `db:local:up` / `db:local:down` scripts call this runner.

Supported overrides:

- `DB_COMPOSE_ENGINE=podman|docker|auto` (default: `podman`)
- `DB_COMPOSE_FILE=<path>` (optional explicit compose file)

Examples:

```bash
DB_COMPOSE_ENGINE=docker pnpm db:local:up
DB_COMPOSE_FILE=podman-compose.yml pnpm db:local:up
```

## Drizzle Configs (Modular Monolith Pathing)

Drizzle config files are intentionally not in the project root.

- Dev/PGLite config:
  - `src/core/db/migrations/config/drizzle.dev.ts`
- Prod/Postgres config:
  - `src/core/db/migrations/config/drizzle.prod.ts`

Schema and migration output are centralized by these configs:

- Schema glob: `./src/modules/**/infrastructure/drizzle/schema.ts`
- Migrations out: `./src/core/db/migrations/generated`

Operational commands:

- `pnpm db:generate` → uses dev config
- `pnpm db:migrate:dev` → uses dev config
- `pnpm db:migrate:prod` → uses prod config (`DATABASE_URL` required)
- `pnpm db:migrate:local` → uses prod config against local Postgres on `127.0.0.1:5433`

## CI Guidance

- DB CI tests should run with `pnpm test:db:ci` (Testcontainers).
- Local compose DB is a developer convenience and should not replace CI isolation.
- Do not run automatic runtime migrations in production app startup.

## Troubleshooting

- `podman compose` calls `docker-compose` unexpectedly
  - Set `DB_COMPOSE_ENGINE=podman` in command invocation for this repo scripts.

- `db:local:up` fails with missing compose file
  - Ensure one of `compose.yml`, `podman-compose.yml`, `docker-compose.yml` exists,
    or set `DB_COMPOSE_FILE` explicitly.

- `test:db:local` fails to connect
  - Verify Postgres is running on `127.0.0.1:5433` and run `pnpm db:migrate:local` first.
