# Testing Usage & DB Workflows

## Purpose

This guide is the operational reference for running tests in this repository.
It consolidates test commands, Vitest config intent, local/CI DB workflows, and migration config paths used by the modular monolith.

For the canonical `package.json` database command map, use [../local-db.md](../local-db.md).

## Testing Matrix

| Scope                        | Command                   | Config                         | Notes                                                            |
| ---------------------------- | ------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Unit                         | `pnpm test`               | `vitest.unit.config.ts`        | JSDOM, setup files, coverage in `coverage/unit`                  |
| Unit watch                   | `pnpm test:watch`         | `vitest.unit.config.ts`        | Fast local feedback                                              |
| Integration                  | `pnpm test:integration`   | `vitest.integration.config.ts` | JSDOM + integration includes, coverage in `coverage/integration` |
| DB (PGLite)                  | `pnpm test:db`            | `vitest.db.config.ts`          | In-memory `memory://`, migrations per test DB instance           |
| DB (CI/Testcontainers)       | `pnpm test:db:ci`         | `vitest.db.ci.config.ts`       | Postgres from Testcontainers via `globalSetup`                   |
| DB (Local external Postgres) | `pnpm test:db:local`      | `vitest.db.local.config.ts`    | Uses `TEST_DATABASE_URL`, no `globalSetup`                       |
| E2E                          | `pnpm e2e`                | `playwright.config.ts`         | Dev-server driven full browser tests                             |
| E2E Auth Matrix CI           | `pnpm e2e:auth-matrix:ci` | `playwright.config.ts`         | Build + auth/bootstrap/onboarding matrix against container DB    |
| E2E Scenario Matrix CI       | `pnpm e2e:ci`             | `playwright.config.ts`         | Build + broader scenario matrix                                  |

## Playwright E2E Command Topology

### Local / developer-facing commands

- `pnpm e2e`
  - Alias for the default single-scenario runner.
- `pnpm e2e:raw`
  - Direct Playwright entrypoint with `--reporter=line`.
  - Use only for narrow ad hoc browser checks.
  - Do not treat it as authoritative for auth/bootstrap/admin/container-backed flows because it bypasses scenario DB setup and uses the current app runtime env.
- `pnpm e2e:auth`
  - Focused auth spec run.
- `pnpm e2e:auth-matrix`
  - Full auth/bootstrap/onboarding matrix across phases 1-7.
- `pnpm e2e:scenario:single`
- `pnpm e2e:scenario:personal`
- `pnpm e2e:scenario:org-provider`
- `pnpm e2e:scenario:org-db`
  - Broader scenario matrix across supported tenancy profiles.

### CI-oriented commands

- `pnpm e2e:auth-matrix:ci`
  - Runs `pnpm build` first, then executes the auth matrix with `E2E_BACKEND_MODE=container`.
  - Intended for auth-regression evidence collection and server-log artifacts.
- `pnpm e2e:ci`
  - Runs `pnpm build` first, then executes `pnpm e2e:matrix`.
  - Intended for broader non-auth scenario coverage.

## GitHub Actions E2E Topology

- Auth-matrix workflow: [../../.github/workflows/e2e-label.yml](../../.github/workflows/e2e-label.yml)
  - Triggered by PR label `run-e2e`
  - Also supports manual dispatch
  - Runs `pnpm e2e:auth-matrix:ci`
- Broad matrix workflow: [../../.github/workflows/e2e-matrix.yml](../../.github/workflows/e2e-matrix.yml)
  - Triggered by PR label `run-e2e-matrix`
  - Also supports manual dispatch
  - Runs `pnpm e2e:ci`

This split keeps auth-evidence collection separate from the wider scenario matrix so both can run independently in CI.

## Playwright Runtime And Artifact Behavior

- Local Playwright runs start `pnpm dev`.
- CI Playwright runs start `pnpm start`, so CI entrypoints must build first.
- The authoritative E2E entrypoint is `node scripts/e2e/run-scenario.mjs ...` or package scripts that wrap it.
- `E2E_BACKEND_MODE=container` means the isolated test DB `127.0.0.1:5433/app_test`; the runner resets this DB before execution.
- Raw `playwright test` does not perform scenario DB setup and can therefore hit the current runtime DB from `.env.local`.
- Auth evidence runs can set `PLAYWRIGHT_SERVER_LOG_DIR` to capture server-side route decisions into a stable per-run artifact root.
- The repository standard path for these server logs is `logs/playwright/...`.
- For interactive local debugging and agent-driven runs, pass `--reporter=line`. Avoid the HTML reporter when console evidence matters.
- CI workflows upload:
  - `logs/playwright/`
  - `playwright-report/`
  - `test-results/`

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
pnpm db:test:up
pnpm db:test:migrate
pnpm test:db:local
pnpm db:test:down
```

### Compose engine policy

- Default engine is Podman for this repository.
- Compose execution is centralized in `scripts/compose-db-local.mjs`.
- `db:test:up` / `db:test:down` are the canonical scripts for this runner.
- `db:local:*` aliases were removed; use `db:test:*` directly.

Supported overrides:

- `DB_COMPOSE_ENGINE=podman|docker|auto` (default: `podman`)
- `DB_COMPOSE_FILE=<path>` (optional explicit compose file)

Examples:

```bash
DB_COMPOSE_ENGINE=docker pnpm db:test:up
DB_COMPOSE_FILE=podman-compose.yml pnpm db:test:up
```

## Drizzle Configs (Modular Monolith Pathing)

Drizzle config files are intentionally not in the project root.

- Dev/PGLite config:
  - `src/core/db/migrations/config/drizzle.dev.ts`
- Test Postgres config:
  - `src/core/db/migrations/config/drizzle.test.ts`
- Dev Postgres container config:
  - `src/core/db/migrations/config/drizzle.dev.postgres.ts`
- Prod/Postgres config:
  - `src/core/db/migrations/config/drizzle.prod.ts`

Schema and migration output are centralized by these configs:

- Schema glob: `./src/modules/**/infrastructure/drizzle/schema.ts`
- Migrations out: `./src/core/db/migrations/generated`

Operational commands:

- `pnpm db:generate` → uses dev config
- `pnpm db:pglite:migrate` → uses the PGlite dev config
- `pnpm db:pglite:seed` → seeds the canonical PGlite local database
- `pnpm db:pglite:studio` → opens studio for the canonical PGlite local database
- `pnpm db:dev:migrate` → uses the dev Postgres config against `127.0.0.1:5432/app_dev`
- `pnpm db:test:migrate` → uses the test Postgres config against `127.0.0.1:5433/app_test`
- `pnpm db:dev:studio` → opens studio for the dev Postgres config
- `pnpm db:test:studio` → opens studio for the test Postgres config
- `pnpm db:migrate:prod` → uses prod config (`DATABASE_URL` required)

## CI Guidance

- DB CI tests should run with `pnpm test:db:ci` (Testcontainers).
- Local compose DB is a developer convenience and should not replace CI isolation.
- Do not run automatic runtime migrations in production app startup.

## Provisioning Hardening Mandatory Suites

For release candidates after provisioning refactor, treat these suites as mandatory:

1. `pnpm test` (unit)
2. `pnpm test:integration` (API/page middleware integration)
3. `pnpm test:db` (provisioning transactional invariants)
4. targeted e2e provisioning runtime checks (including unprovisioned external-session scenario)

Manual runtime matrix must include all tenancy profiles:

- Scenario A: `TENANCY_MODE=single`
- Scenario B: `TENANCY_MODE=personal`
- Scenario C: `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=provider`
- Scenario D: `TENANCY_MODE=org` + `TENANT_CONTEXT_SOURCE=db`

Authoritative runtime probe for internal state is `/api/me/provisioning-status`.

## Troubleshooting

- `podman compose` calls `docker-compose` unexpectedly
  - Set `DB_COMPOSE_ENGINE=podman` in command invocation for this repo scripts.

- `db:test:up` fails with missing compose file
  - Ensure one of `compose.yml`, `podman-compose.yml`, `docker-compose.yml` exists,
    or set `DB_COMPOSE_FILE` explicitly.

- `test:db:local` fails to connect
  - Verify Postgres is running on `127.0.0.1:5433` and run `pnpm db:test:migrate` first.
