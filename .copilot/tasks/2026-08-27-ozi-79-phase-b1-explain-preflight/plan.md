# OZI-79 Phase B1 — Remote Plain-EXPLAIN Preflight Core

## Objective

Build a plain-`EXPLAIN` preflight collector and versioned artifact
contract around Phase B0's `QUERY_REGISTRY`, entirely build-only and
local-test-only. No remote execution path, no remote credential, no
`cli.ts`/`readonly-db-remote.ts` changes. See `runbook.md` for the full
execution boundary and design rationale.

## Classification

- Primary workflow: narrow, additive build (new module + tests + docs),
  no existing security-reviewed code touched (`readonly-db-remote.ts`,
  `cli.ts` untouched) -- no full specialist review cycle re-run.
- Severity: N/A (tooling, not an incident)
- Linear issue: OZI-79 (child of OZI-74, blocks OZI-78)
- Branch: `feat/ozi-79-phase-b1-explain-preflight`, from `main` @
  `a19ef34a` (post Phase B0 / PR #82 merge)

## What was built

- `scripts/tenancy-inventory/explain-preflight.ts` -- see `runbook.md`
- `scripts/tenancy-inventory/explain-preflight.test.ts` (19 unit tests)
- `scripts/tenancy-inventory/explain-preflight.db.test.ts` (6 real-DB
  tests, local `test-db` only)

## Validation

typecheck clean · lint clean · 53/53 unit tests (`scripts/tenancy-inventory`
subset) · 31 files / 293 tests in the full local db-local suite · same
31/293 via `pnpm test:db:ci` (the required CI job's exact command,
confirming the new `.db.test.ts` file is picked up automatically by the
existing Phase B0 CI include) · `arch:lint` shows only the same
pre-existing unrelated `strict-rate-limit.ts` FAIL

## Artifacts

- `plan.md` (this file)
- `runbook.md` -- execution boundary, design rationale, what Phase B2
  would still need to add
