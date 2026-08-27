# 01 - Architecture Guard - Summary

## Task Context

- Task ID: OZI-75
- Task Objective: read-only tenant/organization topology and
  identifier-integrity inventory (local/schema pass)
- Current Run Scope: tooling location, shape, and DB-access pattern
- Status: COMPLETED
- Last Updated: 2026-08-27
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- New tooling under `scripts/tenancy-inventory/`
- DB-access pattern for a standalone diagnostic script (vs. app runtime DI)
- Cross-module schema imports for a diagnostic-only tool

## Inputs Reviewed

- Existing script precedent: `scripts/neon/cli.ts` (dispatcher + subcommand
  shape), `scripts/lib/db-guard.mjs` (`DEV_DEFAULT_URL`/`TEST_DEFAULT_URL`/
  `parsePostgresUrl`/`assertNotProduction`), `scripts/db-seed.ts` (direct
  `createDb`, no DI container), `scripts/lib/fs-guards-shared.ts`
  (confinement helpers)
- `docs/ai/general/SCRIPT_IMPLEMENTATION_PATTERNS.md`
- drizzle-orm/postgres-js transaction API (`PgTransactionConfig.accessMode`)

## Current-State Findings

- Confirmed: `scripts/neon/cli.ts` establishes the repo's convention for a
  domain-named script directory with a single dispatcher `cli.ts` exposing
  subcommands, invoked via `pnpm <domain> -- <subcommand>`.
- Confirmed: every DB script in this repo (`db-seed.ts`, `neon/cli.ts`)
  connects directly (`createDb`/`postgres`+`drizzle`), never through the
  app's request-scoped DI container — scripts run outside the app request
  lifecycle.
- Confirmed: drizzle-orm's postgres-js driver natively supports
  `db.transaction(fn, { accessMode: 'read only' })`, which emits a real
  Postgres `SET TRANSACTION READ ONLY` — engine-level enforcement.

## Architectural Decisions / Constraints

- approved: `scripts/tenancy-inventory/` (domain-named, mirrors `neon/`,
  `vercel/`, `flags/`), single `cli.ts` dispatcher (`matrix`, `scan
  --target=dev|test`), direct Postgres connection (no DI/container)
- approved: cross-module schema imports (`authorization`, `auth`) directly
  from `topology-queries.ts` — a deliberate, bounded exception to normal
  app-runtime module-boundary rules, justified because this is an offline
  Phase 0 diagnostic script explicitly tasked with cross-cutting schema
  inspection, not application code serving a request
- approved: the single `withReadOnlyDb` wrapper is the only place a
  transaction handle is constructed; no other module in this tool can
  obtain a writable `db` reference, so a future query added to the tool
  cannot bypass read-only enforcement by construction
- rejected: routing through `@/core/runtime/bootstrap`'s DI container —
  inconsistent with every other DB script in the repo, and unnecessary for
  a stateless CLI invocation
- rejected: an app-level "read-only" flag/promise as the sole enforcement
  mechanism — Security/Auth required genuine engine-level enforcement (see
  `02 - Security & Auth - Summary.md`)
- architecture status: **GO**

## Risks

- None blocking. Non-blocking debt: the ownership matrix is hand-authored
  from live schema inspection (Phase 0), not derived by automated
  `information_schema` introspection. Acceptable for a first pass; revisit
  if this tool is extended/reused significantly.

## Artifact Synchronization

- `plan.md`: Architecture Guard phase marked complete
- `intake.md`: no change required

## Handoff Notes

- what the next agent should rely on: the structural shape above is
  approved; do not introduce a second connection-construction path outside
  `readonly-db.ts`
- recommended next step: Security/Auth review, then implementation

## Update Log

### 2026-08-27 — Initial Review

- Trigger: OZI-75 local/schema tooling design
- Summary of change: approved script location, dispatcher shape, direct DB
  connection pattern, and the read-only transaction mechanism
- Sections refreshed: all
