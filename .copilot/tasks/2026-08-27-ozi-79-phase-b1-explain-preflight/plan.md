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
- `scripts/tenancy-inventory/explain-preflight.test.ts` (40 unit tests)
- `scripts/tenancy-inventory/explain-preflight.db.test.ts` (8 real-DB
  tests, local `test-db` only)
- `scripts/tenancy-inventory/explain-preflight.least-privilege.db.test.ts`
  (1 real-DB test, local `test-db` only) -- end-to-end least-privilege
  integration proof

## Validation

typecheck clean · lint clean · 74/74 unit tests (`scripts/tenancy-inventory`
subset) · 32 files / 296 tests in the full local db-local suite (`PUBLIC`'s
`CREATE` grant confirmed restored) · same 32/296 via `pnpm test:db:ci` (the
required CI job's exact command, confirming the new `.db.test.ts` files are
picked up automatically by the existing Phase B0 CI include) · `arch:lint`
shows only the same pre-existing unrelated `strict-rate-limit.ts` FAIL

## Update Log

### 2026-08-27 — Final Phase B1 security/integrity review, before merge

- Split the single `artifactFingerprint` concept into `scopeFingerprint`
  (stable, cross-run "what was reviewed" identity) and a redefined
  `artifactFingerprint` (exact-evidence identity covering `generatedAt`
  and all collected evidence -- raw plans, parsed facts, relation stats).
- Added `checkArtifactIntegrity()`; documented explicitly that
  `artifactFingerprint` is an integrity/identity value, not an
  authentication mechanism.
- Narrowed `ExplainPreflightTargetMetadata.environment` to the closed
  `'staging' | 'production'` domain (defined locally, not imported from
  `readonly-db-remote.ts`); added `checkTargetCompatibility()`.
- Hardened `checkRegistryCompatibility()` to always independently
  validate the artifact's own `statementFingerprints` array (exactly 16
  known unique ids, every fingerprint current) regardless of whether the
  top-level `registryFingerprint` string already matches; added four
  negative tests proving this against a *correct* top-level fingerprint
  combined with a missing/extra/duplicate/changed statement entry.
- Completed `RelationStat` with `relPages`/`indexSizeBytes`.
- Added `explain-preflight.least-privilege.db.test.ts` -- real-Postgres
  proof that a disposable role with exactly `USAGE` on `public`/`drizzle`
  + `SELECT` on `REQUIRED_SELECT_TABLES`, no memberships, no writes,
  passes `verifyReadOnlyRole` and then successfully drives
  `collectExplainPreflightFacts` inside one `READ ONLY` transaction.
- Fixed the Codacy markdown-fence-language finding in `runbook.md`.
- Still true: no remote CLI command, no remote credential, no remote
  connection, no Phase B2 work started.

## Artifacts

- `plan.md` (this file)
- `runbook.md` -- execution boundary, design rationale, what Phase B2
  would still need to add
