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

- Superseded below: the ownership-matrix hand-authoring risk noted in the
  initial review is now closed by an automated completeness check, not
  merely accepted as debt.

## Formal Post-Implementation Review — 2026-08-27

User-requested, alongside the Security/Auth formal review. Architecture
scope of the same five criteria: matrix completeness mechanism, and the
structural shape of a future production read-only-role layer.

- **Matrix completeness** (criterion 3): the previously-accepted debt
  ("hand-authored, not automatically derived") is now closed —
  `ownership-matrix.completeness.db.test.ts` derives the live table list
  from `pg_catalog.pg_tables` and diffs it against `TABLE_OWNERSHIP` in a
  real-DB test, independent of the schema files the matrix itself was
  built by reading. This is exactly the kind of drift-detection mechanism
  this debt entry called for; no further follow-up needed on this point.
- **Query hardening** (criterion 1, structural angle): the fix that moved
  3 of 8 queries from an app-side `GROUP BY`-then-count to a pure Postgres
  aggregate is architecture-neutral — no boundary, DI, or dependency-
  direction change; it only removes a now-unneeded `MAX_ROWS`/`.limit()`
  pattern from `topology-queries.ts`. Re-verified: `withReadOnlyDb` is
  still the only transaction-construction path used by every query.
- **Future production read-only role** (criterion 5, structural angle):
  agrees with Security/Auth's design note. Structurally, this only
  requires a new `RemoteTarget` type and URL-resolution function parallel
  to (not replacing) `LocalTarget`/`resolveLocalUrl`, keeping the
  `withReadOnlyDb` wrapper and every query function completely unchanged
  — the DB-access layer already isolates "how a connection is obtained"
  from "what runs against it" cleanly enough that this is an additive
  change, not a redesign. No DI/container involvement needed for that
  future path either, consistent with this pass's decision to keep this
  tool outside the app's request-scoped composition root.
- architecture status: **GO** (unchanged)

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

### 2026-08-27 — Formal Post-Implementation Review

- Trigger: user-requested formal Architecture review alongside
  Security/Auth, against 5 specific criteria
- Summary of change: confirmed the ownership-matrix hand-authoring debt is
  now closed by an automated completeness test; confirmed the query
  hardening fix is architecture-neutral; gave the structural design note
  for a future production read-only-role layer (additive, no redesign)
- Sections refreshed: Risks, Formal Post-Implementation Review (new)

### 2026-08-27 — Second Hardening Pass (User Code Review)

- Trigger: user reviewed the pushed checkpoint directly; 6 items found,
  see `02 - Security & Auth - Summary.md` for full detail (this pass was
  predominantly query-correctness and evidence-security, not structural)
- Summary of change: architecture-neutral confirmation — new functions
  (`usersInMultipleTenantsCount`, `userProviderMappingAnomalies`,
  `latestSchemaMigration`) follow the same `Tx`-parameter, no-DI shape as
  every existing query function; connection-timeout additions and
  evidence-confinement hardening stay inside `readonly-db.ts`/
  `evidence-store.ts` respectively, no new module boundary crossed
- Sections refreshed: Update Log only
