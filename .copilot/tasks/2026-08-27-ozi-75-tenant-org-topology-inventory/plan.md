# OZI-75 — Read-Only Tenant/Organization Topology Inventory

## Objective

Produce a reproducible, read-only inventory of tenant/organization topology
and identifier semantics, as a Phase 0 migration-input baseline. This pass
covers only the local/schema portion: tooling design, ownership matrix,
identifier-usage inventory, and dry-run evidence against local `test-db`
and `dev-db`. Staging/production execution is explicitly out of scope and
requires a separate, later-authorized handoff.

## Classification

- Primary workflow: Safe Feature Workflow (standard path)
- Severity: N/A (audit tooling, not an incident)
- Linear issue: OZI-75
- Execution control: manual-handoff — user reviews the finished query set
  before any staging/production execution (not part of this pass)

## Specialist Sequence

- [x] Architecture Guard — tooling location/shape
- [x] Security/Auth — read-only enforcement, redaction, evidence handling
- [x] Implementation
- [x] Validation (typecheck, lint, arch:lint, unit + real-DB tests)
- [ ] User review of the finished query set (required before any
      staging/production follow-up)

## Hard Constraints (user-specified, not re-litigated)

- Authorized now: local `test-db` (5433) and `dev-db` (5432) only. Zero
  queries against staging/production this pass.
- Read-only technically enforced (not just promised): Postgres `READ ONLY`
  transaction (`accessMode: 'read only'`), engine-level rejection (error
  `25006`) of any `INSERT`/`UPDATE`/`DELETE`/DDL, no auto-repair/backfill,
  bounded queries, no PII/secrets in logs, pseudonymized/synthetic
  identifiers in any committed output.
- Repo gets only: diagnostic code, query templates, the ownership matrix,
  a synthetic/aggregated example report, and run instructions. Raw
  environment-specific output never committed — stored outside the repo at
  `~/.local/share/nextjs-16-boilerplate/ozi-75/{local,staging,production}/`.

## Artifacts

- `plan.md` (this file)
- `intake.md`
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `matrix.md` — the committed table-ownership + identifier-semantics
  inventory (human-readable mirror of `scripts/tenancy-inventory/ownership-matrix.ts`)
- `example-report.md` — synthetic example of `scan` output shape
- `validation-report.md`

## Progress

- [x] Read the complete live Drizzle schema (8 schema files, 21 tables).
- [x] Built the static table-ownership matrix + identifier-semantics
      inventory (`scripts/tenancy-inventory/ownership-matrix.ts`).
- [x] Built the read-only DB access wrapper with genuine Postgres
      `READ ONLY` transaction enforcement.
- [x] Built the bounded, aggregate-only topology queries (S1-S7).
- [x] Built the evidence-store writer (confined to outside-repo path).
- [x] Built the CLI (`matrix`, `scan --target=dev|test`).
- [x] Dry-ran against local `test-db` and `dev-db`; raw output kept outside
      the repo per the evidence-storage constraint.
- [x] Wrote and ran tests proving read-only enforcement against real
      Postgres (INSERT/UPDATE/DELETE/DDL all rejected with error `25006`).
- [x] typecheck, targeted lint, `arch:lint` all clean (one pre-existing
      unrelated `arch:lint` FAIL, confirmed present on `main` since OZI-77).
- [ ] Hand the finished query set back to the user for review before any
      staging/production follow-up.
