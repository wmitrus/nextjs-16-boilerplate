# Database Commands & Local Database Guide

This document is the canonical operator reference for all `db:*` scripts defined in `package.json`.
It also explains which local database profile each command family targets.

## Command routing

- Use `db:pglite:*` for the default local development flow.
- Use `db:dev:*` for the opt-in local dev Postgres container used by `pnpm dev`.
- Use `db:test:*` for the local Postgres container used by `pnpm test:db:local`.
- Use `db:migrate:prod` in CI or deployment environments where `DATABASE_URL_UNPOOLED` is provided explicitly. It requires `DATABASE_URL_UNPOOLED` and does **not** fall back to `DATABASE_URL` (Codex P1) — `DATABASE_URL_UNPOOLED` is the operator trust boundary for Production DDL.
- Use `db:migrate:prod:local` only for intentional local operator runs against `.env.production`.

## Canonical `package.json` DB script map

| Script                        | Target                        | Purpose                                                                               |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm db:generate`            | Dev schema config             | Generate migration files from the current schema                                      |
| `pnpm db:export:sql`          | Dev schema config             | Export the current schema to `exports/sql/schema.sql`                                 |
| `pnpm db:pglite:migrate`      | Local PGlite                  | Apply migrations                                                                      |
| `pnpm db:pglite:seed`         | Local PGlite                  | Seed canonical local data                                                             |
| `pnpm db:pglite:studio`       | Local PGlite                  | Open Drizzle Studio                                                                   |
| `pnpm db:pglite:reset`        | Local PGlite                  | Wipe, migrate, and seed                                                               |
| `pnpm db:dev:up`              | Local dev Postgres container  | Start the dev container                                                               |
| `pnpm db:dev:down`            | Local dev Postgres container  | Stop the dev container                                                                |
| `pnpm db:dev:migrate`         | Local dev Postgres container  | Apply migrations                                                                      |
| `pnpm db:dev:seed`            | Local dev Postgres container  | Seed canonical local data                                                             |
| `pnpm db:dev:studio`          | Local dev Postgres container  | Open Drizzle Studio                                                                   |
| `pnpm db:dev:reset`           | Local dev Postgres container  | Wipe, migrate, and seed                                                               |
| `pnpm db:test:up`             | Local test Postgres container | Start the test container                                                              |
| `pnpm db:test:down`           | Local test Postgres container | Stop the test container                                                               |
| `pnpm db:test:migrate`        | Local test Postgres container | Apply migrations                                                                      |
| `pnpm db:test:seed`           | Local test Postgres container | Seed canonical test data                                                              |
| `pnpm db:test:studio`         | Local test Postgres container | Open Drizzle Studio                                                                   |
| `pnpm db:test:reset`          | Local test Postgres container | Wipe, migrate, and seed                                                               |
| `pnpm db:all:down`            | Local compose stack           | Stop all local DB containers                                                          |
| `pnpm db:migrate:prod`        | Production-style Postgres     | Apply migrations using `DATABASE_URL_UNPOOLED` (required; no `DATABASE_URL` fallback) |
| `pnpm db:migrate:prod:local`  | Production-style Postgres     | Apply prod migrations locally with `.env.production`                                  |
| `pnpm db:r4a:compact-indexes` | Production-style Postgres     | Operator-gated R4a compact-index inspection/execution; never automatic                |
| `pnpm db:r4a:check:prod`      | Neon Production               | Identity-verified, read-only R4a `--check` (see R4a section)                          |
| `pnpm db:r4a:check:preview`   | Neon Preview branch           | Identity-verified, read-only R4a `--check` for an explicit Preview branch             |
| `pnpm db:r4a:apply:preview`   | Neon Preview branch           | Identity-verified, operator-approved Preview schema A apply (create-only)             |

All removed shorthand aliases stay removed. Use the explicit target-specific families above.

---

## Profile A — PGlite (default, recommended)

Zero-config. No container, no Podman, no setup.

```env
DB_PROVIDER=drizzle
DB_DRIVER=pglite
DATABASE_URL=file:./data/pglite
```

Data is stored in `./data/pglite/` (gitignored).

| Task                          | Command                  |
| ----------------------------- | ------------------------ |
| Start dev server              | `pnpm dev`               |
| Run migrations                | `pnpm db:pglite:migrate` |
| Seed data                     | `pnpm db:pglite:seed`    |
| Open studio                   | `pnpm db:pglite:studio`  |
| Reset (wipe + migrate + seed) | `pnpm db:pglite:reset`   |

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

The guarded destructive local Postgres flows verify the target URL before opening any database connection. This safety contract applies to the `db:dev:*` and `db:test:*` command families; it does not claim that every ad hoc or unguarded script path in the repository is covered.

- `db:dev:*` operations require port **5432** and reject the `app_test` database
- `db:test:*` operations require port **5433** and require the `app_test` database
- These guarded flows are blocked when `NODE_ENV=production`
- `reset` in the guarded flows requires typing `yes` interactively, or pass `--force` for automation

If you run the wrong script against the wrong database, you will see a clear error with a hint pointing to the correct command.

---

## R4a compact unique indexes (operator-only)

The R4a compact indexes are intentionally managed outside Drizzle migrations:
`uq_feature_flags_key_organization_compact` on `(key, organization_id)` and
`uq_audit_log_settings_category_organization_compact` on
`(category, organization_id)`, both `UNIQUE NULLS NOT DISTINCT`.

They are absent from the Drizzle schema and snapshots on purpose. Therefore,
`pnpm db:generate` must not generate or be used to create either index. The
Production/Preview migration path (`pnpm db:migrate:prod`) never creates them.

### Schema A and the R4a-B runtime (OZI-219)

The Audit Settings UPSERTs target the compact unique
(`ON CONFLICT (category, organization_id)`). A database without it rejects
them with SQLSTATE `42P10` — a visible blocker, never retried with the old SQL.
"Schema A" is the Production state after OZI-213 + OZI-216: both R4a ownership
CHECKs validated and both compact uniques valid, ready and live, with all six
legacy/semantic uniques retained.

| Environment                                               | How it reaches schema A                                                                                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PGlite, `test:db`, `test:db:ci`, dev/test containers, E2E | Automatically after migrations (`runMigrations` R4a-A bootstrap via `db:pglite:migrate` / `db:dev:migrate` / `db:test:migrate` / reset). PGlite, or a PostgreSQL whose identity is proven (below). |
| Preview                                                   | Operator: `pnpm db:r4a:apply:preview --git-branch=<branch> --preview-approved`. The Preview build only **checks** and fails closed.                                                                |
| Production                                                | Operator only (OZI-216, already applied): `pnpm db:r4a:compact-indexes --apply --production-approved`.                                                                                             |

The non-Production bootstrap reuses the R4a specification, inspector and
executor (`CONCURRENTLY` on real PostgreSQL, a plain build on PGlite). It
first repeats the OZI-213 step for `feature_flags` and `audit_log_settings`
only (validate the ownership CHECK when the gate plans it; never
`audit_events`). It is idempotent and fails closed on any other decision
(`blocked-by-disposition`, `blocked-by-schema-drift`, INVALID index). It
never drops anything. An existing migration-only local database upgrades on
its next `db:*:migrate`.

**Target identity.** A loopback hostname is not proof that a database is
local: a tunnel or port-forward can put a remote cluster behind `127.0.0.1`.
Every real-PostgreSQL bootstrap needs the cluster's `system_identifier`
(random per `initdb`), read through a trusted channel and never through the
URL being verified:

- Testcontainers fixtures read it inside the container they started.
- `db:dev:migrate` / `db:test:migrate` / reset (and E2E container mode) read
  it with `podman|docker exec` inside `nextjs16_dev_db` / `nextjs16_test_db`;
  `test:db:local` does the same in its `globalSetup`.

`runMigrations` compares it with the server behind the URL before the
migrator runs, and again on the bootstrap session before any R4a DDL. A
mismatch, an unreadable identity, or a missing proof refuses with no DDL. A
non-loopback URL is refused outright. A bare `db:pglite:migrate` with
`DB_DRIVER=postgres` has no proof: it migrates but does not provision schema
A, and says so.

**Release order:** schema A on the target first, then the R4a-B runtime. A
Preview build (`pnpm db:migrate:prod` with `VERCEL_ENV=preview`) reads the
catalog after migrating. It stops before `pnpm build` unless both tables are
`already-converged`, and it performs no R4a DDL itself. **Rollback of B** is a
plain code revert while the six retained uniques exist (schema A keeps them).

### Decisions reported by `--check`

| Decision                          | Meaning                                                                                       | Operator action                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `eligible-to-create`              | Gate ready, retained indexes intact, compact index absent                                     | Standard `--apply` allowed                       |
| `already-converged`               | Exact compact index exists and is valid, ready and live                                       | Standard `--apply` allowed (no-op)               |
| `invalid-index-recovery-required` | Exact compact index exists but is not valid, ready and live; gate ready                       | STOP — separate `--recover-invalid` only (below) |
| `blocked-by-disposition`          | Table-specific ownership disposition gate is not ready                                        | STOP — no DDL                                    |
| `blocked-by-schema-drift`         | Wrong identity/definition, name collision, broken retained index, or missing catalog evidence | STOP — no DDL; investigate manually              |

### Identity-verified `--check` shortcuts

`pnpm db:r4a:check:prod` and
`pnpm db:r4a:check:preview --git-branch=<git-branch>` run only `--check`.
They accept no other arguments; `--apply` and `--recover-invalid` are refused.
Both refuse, before any database connection, unless the target is proven:

- `DATABASE_URL_UNPOOLED` must **not** be set in the shell. The target is read
  only from the profile file: `.env.production.local` for Production,
  `.env.preview.local` for Preview. `.env.local` is never a source.
- The URL must be direct (no pooler marker) and set
  `sslmode=require|verify-ca|verify-full`.
- `.env.neon` (see `scripts/neon/neon.env.example`) supplies `NEON_API_KEY`
  and `NEON_PROJECT_ID`. The Neon Management API must list the URL host as an
  endpoint of the expected branch, and the URL database as that branch's
  database:
  - Production: project `sparkling-sun-12905030`, branch
    `br-young-firefly-ag11fwch`, database `neondb` (all pinned in the
    launcher).
  - Preview: exactly one branch named `preview/<git-branch>`. It must not be
    the Production branch, nor a default or protected branch, and must have a
    single database.

Provision the profile files without exposing them. Copy each direct
connection string from the Neon console or the Vercel project's environment
(Production / the Preview deployment's branch) into `DATABASE_URL_UNPOOLED=`
in the matching file. Never paste it into a shell, command argument, ticket or
log. All `.env*` files are git-ignored.

On success the launcher prints the verified project, branch and database. It
then prints the `--check` JSON. Read `evidence[].decision` for **both**
`feature_flags` and `audit_log_settings` against the table above.

### Preview schema A apply (operator-gated)

`pnpm db:r4a:apply:preview --git-branch=<git-branch> --preview-approved` is the
only way to create the compact uniques on a Preview branch. It is a separate
command from `--check`, and `--check` never creates anything. It requires its
own trailing `--preview-approved`, and it runs every identity check above:
exactly one `preview/<git-branch>` branch that is not the Production, default
or protected branch. It then runs the executor's **standard** convergence:
CREATE a missing index, no-op a converged one, refuse anything else. It never
drops or recovers. There is no Production apply in this launcher; Production
keeps its own separately authorized command. The launcher calls the executor
with a typed `apply` command; it never passes the Production
`--production-approved` token.

The apply needs the R4a ownership CHECKs already validated (OZI-213). A
Preview branch forked from Production after OZI-216 inherits schema A and is
already converged. An older branch whose CHECKs are still NOT VALID reports
`blocked-by-disposition`, and this command refuses it; recreate that Preview
branch from Production instead.

1. `pnpm db:r4a:check:preview --git-branch=<branch>`: both tables must report
   `eligible-to-create` or `already-converged`.
2. `pnpm db:r4a:apply:preview --git-branch=<branch> --preview-approved`.
3. Re-run step 1: both must report `already-converged`. Then redeploy the
   Preview.

### Standard apply

1. Set only the direct `DATABASE_URL_UNPOOLED` operator target; known pooler
   URLs are rejected, and `DATABASE_URL` is never a fallback.
2. Run `pnpm db:r4a:compact-indexes --check`. It performs only catalog and
   disposition reads; retain its evidence for the change record.
3. Proceed only when **every** target reports `eligible-to-create` or
   `already-converged`. Any other decision is a STOP for the standard path.
4. Apply explicitly with
   `pnpm db:r4a:compact-indexes --apply --production-approved`.
5. The executor pins one physical connection, takes a session advisory lock,
   applies its own timeout policy, re-runs the full inspection and gate checks
   while holding that lock, verifies the lock is still held immediately before
   each DDL statement, then uses `CREATE UNIQUE INDEX CONCURRENTLY` outside a
   transaction. After any DDL it re-inspects and fails unless the index is
   `already-converged`. It keeps legacy/partial indexes and `tenant_id`
   unchanged.

A `--check` result is evidence, not a standing authorization. `--apply
--production-approved` never trusts an earlier `--check`: it re-inspects and
re-evaluates every condition at execution time and acts only on that fresh
result. The database can change between the two runs, so take `--check`
immediately before `--apply` and re-run it if anything may have changed.

Standard `--apply` authorizes only `CREATE` of a missing index and no-ops. It
never drops: if the fresh in-lock inspection finds
`invalid-index-recovery-required` (for example, the table became INVALID after
an earlier `--check`), it stops before any DDL and requires the separate
recovery authorization below. Any other non-eligible decision also stops with
no DDL.

### Exceptional INVALID-index recovery

`invalid-index-recovery-required` is never part of the standard path. It needs
a separate, recorded operator decision based on fresh `--check` evidence for
the affected table showing **all** of:

- exact index identity: name, `public` schema and table, unique btree, the
  expected key columns/opclasses/collations, `NULLS NOT DISTINCT`, no
  predicate, no `INCLUDE` columns, matching `pg_get_indexdef`;
- index state `INVALID` (`indisvalid = false`), not ready
  (`indisready = false`) and live (`indislive = true`);
- every retained legacy and semantic index intact (exact, valid, ready, live);
- the table-specific ownership disposition gate ready (no unresolved or
  quarantined rows, no invalid combinations, ownership `CHECK` exact and
  validated).

With that decision recorded, run recovery for exactly the approved table(s):

```bash
pnpm db:r4a:compact-indexes --recover-invalid --table feature_flags --production-approved
# both tables, only when both were separately approved:
pnpm db:r4a:compact-indexes --recover-invalid --table feature_flags --table audit_log_settings --production-approved
```

The recovery approval is scoped to the named tables; standard `--apply` approval
never extends to it. Arguments are parsed strictly: at least one distinct
`--table` (`feature_flags` or `audit_log_settings`) and a trailing
`--production-approved` are required, and anything else is rejected before a
connection opens.

Under its lock the executor first re-qualifies **every** named table and stops
with no DDL if any of them fails; then, per table, it re-inspects again, checks
the lock, issues `DROP INDEX CONCURRENTLY`, checks the lock again, and issues
`CREATE UNIQUE INDEX CONCURRENTLY` for that single verified relation. If the
lock or session is lost after the `DROP`, it refuses the `CREATE`; the index is
then absent and the table reports `eligible-to-create` for a fresh standard
`--apply`. Recovery never creates an absent index and never touches a table
that was not named.

STOP — no DDL — for any other state, including an `INVALID` but ready index,
a wrong definition, a name collision, incomplete catalog evidence, or a
disposition failure. Investigate manually and never use a name-only `DROP`.

Rollback to older application code needs no index removal: the two indexes are
additive and legacy uniqueness remains in place. If an operational rollback
must remove an R4a index, take fresh `--check` evidence, verify its complete
identity in `pg_catalog`, then have an approved operator issue a targeted
`DROP INDEX CONCURRENTLY` outside a transaction. This executor deliberately
does not implement ordinary rollback deletion.

---

## Canonical command families

- Use `db:pglite:*` for the default local PGlite workflow.
- Use `db:dev:*` for the local dev Postgres container.
- Use `db:test:*` for the local test Postgres container.
- Use `db:migrate:prod` and `db:migrate:prod:local` only for production-style migration paths.

For local Postgres app development, use the `db:dev:*` commands directly.

---

## CI and E2E

- **Unit/integration DB tests** (`pnpm test:db`): use PGlite in-process — no container needed
- **CI DB tests** (`pnpm test:db:ci`): use Testcontainers — ephemeral Postgres, no persistent container
- **E2E tests** (`pnpm e2e:*`): use PGlite per-scenario, isolated and wiped before each run
- None of the above require the `dev-db` or `test-db` Podman containers to be running
