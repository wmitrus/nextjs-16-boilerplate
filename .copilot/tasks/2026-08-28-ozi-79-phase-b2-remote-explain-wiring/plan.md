# OZI-79 Phase B2 — Remote Plain-EXPLAIN Wiring

## Objective

Wire the already-reviewed Phase A (`RemoteTarget`, `withReadOnlyRemoteDb`,
`describeRemoteTarget`) and Phase B1 (`collectExplainPreflightFacts`,
`buildExplainPreflightArtifact`) components together into one narrowly
scoped CLI command, build/test/review only. See `runbook.md` for the full
execution boundary and design detail.

## Classification

- Primary workflow: narrow, additive wiring (one new CLI command + one
  new test file), no existing security-reviewed logic modified
  (`verifyReadOnlyRole`, the canonical registry, the collector/artifact
  fingerprinting logic are all untouched) -- no full specialist review
  cycle re-run.
- Severity: N/A (tooling, not an incident)
- Linear issue: OZI-79 (child of OZI-74, blocks OZI-78)
- Branch: `feat/ozi-79-phase-b2-remote-explain-wiring`, from `main` @
  `62e457b2` (post PR #85 merge)

## What was built

- `scripts/tenancy-inventory/cli.ts` -- new `plan --target=staging|
  production --execute-remote-explain` command; `run()` refactored to
  accept an optional `argv` parameter for direct unit testing
- `scripts/tenancy-inventory/cli.test.ts` (new, 15 unit tests, no DB, all
  remote/network/evidence effects mocked)
- `scripts/tenancy-inventory/readonly-db-remote.ts` -- doc-comment-only
  update (the module previously said nothing was wired into a CLI
  command; this phase makes that untrue)

## Validation

typecheck clean · lint clean · unit (`scripts/tenancy-inventory` subset)
98/98 · unit (full repo) 279 files / 2351 tests · real DB
(`pnpm test:db:local`) 32 files / 297 tests · CI config (`pnpm
test:db:ci`) 32 files / 297 tests · adversarial falsification pass
performed on every negative-path invariant before push (see runbook.md)

## Update Log

### 2026-08-28 — Initial build

- Wired `plan --target=staging|production --execute-remote-explain`,
  fail-closed on missing acknowledgement / invalid target / dirty tree /
  unresolved commit, all checked before any remote connection.
- No real remote connection made anywhere in this branch, implementation,
  or CI.
- Still true: no remote timeout tuning, no approval records, no persisted-
  artifact loading, no automated verdict, no remote `scan` support, no
  Phase B3 functionality.

## Artifacts

- `plan.md` (this file)
- `runbook.md` -- execution boundary, design rationale, falsification
  pass, what Phase B2 explicitly does not do
