# OZI-79 Phase B1 — Remote Plain-EXPLAIN Preflight Core (build-only)

## Execution boundary — read this first

**Phase B1 is authorized as build-only, local-test-only.** This document
exists specifically to record that boundary before any Phase B2 work
starts.

- No remote execution path exists anywhere in this branch.
- Nothing in `scripts/tenancy-inventory/explain-preflight.ts` imports or
  calls `withReadOnlyRemoteDb`, `describeRemoteTarget`, or any other
  `readonly-db-remote.ts` symbol.
- Nothing calls `writeEvidence('staging' | 'production', ...)`.
- `cli.ts` is untouched. There is no `scan --target=...` command, no
  `plan --target=...` command, no command surface at all for this module.
- `readonly-db-remote.ts` itself is untouched: same timeout constants,
  same env var names, same credential-resolution logic as before this
  phase.
- Every test in this phase runs against local `test-db` only.

If you are reading this while deciding whether Phase B2 is safe to start:
it is not started by this document. Phase B2 (actually running this
preflight against a real remote transaction, wiring a CLI command, and
producing a real approved artifact for staging/production) is a
separate, not-yet-authorized decision.

## What was built

`scripts/tenancy-inventory/explain-preflight.ts` — a collector and
artifact-builder built around Phase B0's canonical `QUERY_REGISTRY`,
split into a DB-facing half and a pure half:

### `collectExplainPreflightFacts(tx)` — DB-facing, sequential

Accepts an already-open transaction/handle (the same structural `Tx`
shape `readonly-db.ts`'s `withReadOnlyDb` and `readonly-db-remote.ts`'s
`withReadOnlyRemoteDb` both already produce — this module imports
neither). Sequentially:

1. Reads the existing schema-migration metadata — reused unchanged from
   `topology-queries.ts`'s `latestSchemaMigration`, not reimplemented.
2. Reads `pg_catalog` size/row-estimate stats (`pg_class.reltuples`,
   `pg_relation_size`, `pg_total_relation_size`) for exactly
   `REQUIRED_SELECT_TABLES` — the same 13-table set the registry itself
   declares, not a caller-selected list.
3. Runs `EXPLAIN (FORMAT JSON, ANALYZE FALSE, COSTS TRUE, VERBOSE FALSE,
   SETTINGS FALSE)` for all 16 `QUERY_REGISTRY` statements, in registry
   order, one at a time — not `Promise.all`. `ANALYZE FALSE` is
   non-negotiable: `ANALYZE TRUE` would actually execute the statement,
   which is exactly what a preflight tool exists to avoid needing.

There is no parameter anywhere in this module for a caller-selected query
subset or arbitrary SQL string. The statement set is always exactly
`QUERY_REGISTRY`.

Each plan is parsed recursively into a `PlanNodeFact` tree (node/join
type, relation/schema/index name, estimated rows, startup/total cost, at
every depth) alongside the untouched raw JSON plan — the parsed facts are
for fast structural review; the raw plan is kept for full manual
inspection. `tenant_id_shape_audit_events` and `quota_exceeding_max_users`
are explicitly flagged `isPriorityManualReview: true` in their results
(the two statements a prior review round called out for extra scrutiny —
the largest/highest-churn table, and the registry's only three-table
join). No statement gets special SQL or different `EXPLAIN` treatment;
this is a review-attention flag only.

**No automatic verdict.** There is no risk score, no cost threshold, no
pass/fail logic anywhere in this file. `requiresManualReview` is a
hardcoded `true` on every artifact.

### `buildExplainPreflightArtifact(facts, caller)` — pure, no DB

Takes the collected facts plus caller-supplied `target` (environment +
descriptor — this module never resolves this itself, has no concept of
"staging" or "production") and `commit` (sha + dirty flag — mirroring
`cli.ts`'s existing `resolveCommitSha`/`isWorkingTreeDirty`, not
reimplemented here) metadata, and assembles the versioned
`ExplainPreflightArtifactV1` contract:

```
{
  version: 1,
  target, commit, generatedAt,
  schemaMigration,
  registryFingerprint, statementFingerprints,
  priorityManualReviewStatementIds,
  requiresManualReview: true,
  requiredRelationStats, statementPlans,
  artifactFingerprint,
}
```

Kept separate from collection specifically so this assembly/fingerprint
logic is unit-testable without a database.

### Artifact fingerprint — what it covers, and what it deliberately doesn't

`artifactFingerprint` is a SHA-256 over: `version`, `target`, `commit`,
`schemaMigration`, `registryFingerprint`, `statementFingerprints`,
`priorityManualReviewStatementIds`, `requiresManualReview`. It
deliberately excludes `generatedAt` (a timestamp — including it would
make the fingerprint different on every run even with zero real drift)
and the raw plans/relation stats/`statementPlans` (planner estimates and
relation sizes are expected to vary between two runs against the
*identical* schema and query set as normal data/vacuum/analyze churn —
fingerprinting them would make the fingerprint fail to reproduce for the
same review scope). What's covered is exactly "what was reviewed, against
which schema, on which target, at which commit" — what a later
compatibility check needs.

### Compatibility checks — built now, wired later

`checkRegistryCompatibility(artifact)` and
`checkSchemaCompatibility(currentSchemaMigration, artifact)` are pure,
synchronous, fail-closed functions: every branch that cannot *positively*
prove a match returns `compatible: false`, including malformed/missing
input. Nothing in this branch calls them from a command — they exist for
a **future** scan to call before trusting a stored artifact's approval.
`checkRegistryCompatibility` also diffs per-statement fingerprints on
mismatch, naming exactly which statement(s) changed/were added/were
removed, not just "something drifted."

## Tests

- `explain-preflight.test.ts` (unit, 19 tests, no DB): artifact assembly
  correctness, fingerprint determinism and exact field-sensitivity
  (target/commit/schema change it; `generatedAt`/raw-plans/relation-stats
  do not), both compatibility checks' pass path and every fail-closed
  path, and recursive plan parsing against a synthetic 3-level fixture.
- `explain-preflight.db.test.ts` (real DB, 6 tests, local `test-db`
  only): 16/16 canonical statements plain-`EXPLAIN` successfully;
  relation stats cover exactly the 13-table `REQUIRED_SELECT_TABLES` set;
  the two named priority-manual-review statements are flagged and no
  others; a real multi-join statement's plan parses into a non-trivial,
  multi-level fact tree (not just the synthetic unit fixture); an
  artifact built from real collected facts is immediately
  registry-/schema-compatible with itself; schema compatibility fails
  closed against a deliberately drifted migration.

## Validation

- typecheck: clean
- lint: clean
- unit (`scripts/tenancy-inventory` subset): 53/53
- real DB (`pnpm test:db:local`): 31 files / 293 tests, all pass
- CI config (`pnpm test:db:ci`, the same command the required "DB Tests"
  job runs): 31 files / 293 tests, all pass — the new
  `explain-preflight.db.test.ts` file is picked up automatically by the
  existing `scripts/tenancy-inventory/**/*.db.test.ts` include from the
  Phase B0 CI-coverage fix; no further CI config change was needed
- `arch:lint`: only the same pre-existing, unrelated `strict-rate-limit.ts`
  FAIL as every prior OZI-75/OZI-79 validation run

## What Phase B2 would still need to add

Explicitly not part of Phase B1, listed so the boundary stays visible:

- Actually calling `collectExplainPreflightFacts` against a
  `withReadOnlyRemoteDb` transaction (staging or production) — a
  separate, explicit execution authorization, per OZI-79's two-stage
  execution control.
- A CLI command (or equivalent) that resolves real `target`/`commit`
  metadata and wires the collector + artifact builder together for a
  human to actually run.
- A place to store/load a produced `ExplainPreflightArtifactV1` (this
  phase defines the shape; it does not persist one anywhere).
- Wiring `checkRegistryCompatibility`/`checkSchemaCompatibility` into an
  actual scan command's preflight gate.
- The human review itself: reading the raw plans (especially the two
  flagged priority statements) and deciding what production-appropriate
  `statement_timeout`/`lock_timeout` values should replace the current
  local-default placeholders in `readonly-db-remote.ts` — this document
  and Phase B1's code produce facts for that decision; they do not make it.
