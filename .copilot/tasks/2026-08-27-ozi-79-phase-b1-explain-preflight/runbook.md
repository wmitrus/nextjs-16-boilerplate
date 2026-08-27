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
   `pg_class.relpages`, `pg_relation_size`, `pg_total_relation_size`,
   `pg_indexes_size`) for exactly `REQUIRED_SELECT_TABLES` — the same
   13-table set the registry itself declares, not a caller-selected list.
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

Takes the collected facts plus caller-supplied `target` (a closed
`'staging' | 'production'` environment plus a safe `host:port/database`
descriptor — this module never resolves either itself; see "Target
domain and compatibility" below) and `commit` (sha + dirty flag —
mirroring `cli.ts`'s existing `resolveCommitSha`/`isWorkingTreeDirty`,
not reimplemented here) metadata, and assembles the versioned
`ExplainPreflightArtifactV1` contract:

```json
{
  "version": 1,
  "target": {},
  "commit": {},
  "generatedAt": "",
  "schemaMigration": {},
  "registryFingerprint": "",
  "statementFingerprints": [],
  "priorityManualReviewStatementIds": [],
  "requiresManualReview": true,
  "requiredRelationStats": [],
  "statementPlans": [],
  "scopeFingerprint": "",
  "artifactFingerprint": ""
}
```

Kept separate from collection specifically so this assembly/fingerprint
logic is unit-testable without a database.

### Two fingerprints, two different jobs (review-round redesign)

An earlier draft had one `artifactFingerprint` that deliberately excluded
`generatedAt` and all collected evidence (raw plans, relation stats).
Review correctly flagged that as a real gap: once Phase B2 persists and
approves these artifacts, replacing `statementPlans`/
`requiredRelationStats` would leave that single fingerprint unchanged, so
an approved fingerprint could end up identifying evidence materially
different from what a human actually reviewed. Fixed by splitting the
concept in two:

- **`scopeFingerprint`** — the stable, cross-run "what was reviewed"
  identity. SHA-256 over `version`, `target`, `commit`,
  `schemaMigration`, `registryFingerprint`, `statementFingerprints`,
  `priorityManualReviewStatementIds`, `requiresManualReview`. Two
  preflight runs against the identical schema and query set produce the
  *same* `scopeFingerprint`, even though their `EXPLAIN` plans and
  relation stats will normally differ run to run (ordinary data/vacuum/
  analyze churn). This is what a human approval can realistically
  reference across re-runs.
- **`artifactFingerprint`** — the exact-evidence identity. Covers
  everything `scopeFingerprint` does, *plus* `generatedAt` and the full
  collected evidence: `requiredRelationStats` and all 16 complete
  `statementPlans` entries (raw plan, parsed facts, planning metadata).
  This is deliberately **not** expected to reproduce across two different
  collection runs, even against the identical schema — that
  reproducibility property belongs to `scopeFingerprint`. Its job is
  narrower and stricter: prove *this specific artifact instance* was not
  mutated after it was produced (`checkArtifactIntegrity`).

**`artifactFingerprint` is an integrity/identity value, not an
authentication mechanism.** Passing `checkArtifactIntegrity` only proves
an artifact is internally self-consistent — it says nothing about
whether a human ever actually approved it. A future scan must compare an
artifact's fingerprint against a separately, externally recorded
*approved* fingerprint (e.g. an approval record kept outside the
artifact itself) before trusting it — never accept an artifact merely
because it passes its own integrity check.

### Canonicalization

Both fingerprint functions build a canonical representation before
hashing: `statementPlans`/`statementFingerprints` sorted by `id`,
`requiredRelationStats` sorted by `schema`+`table`, then every object's
keys recursively sorted at every depth (`canonicalizeDeep`) so property
insertion order never changes a hash. Array **element** order is
preserved everywhere else deliberately — a plan node's `children`/`Plans`
is the real left-to-right structure of the query plan tree, a
semantically ordered sequence, not a sortable set; reordering it would
silently change what the fingerprint claims to represent.

### Integrity and compatibility checks — built now, wired later

All four are pure, synchronous, fail-closed: every branch that cannot
*positively* prove a match returns `compatible: false`, including
malformed/missing input. Nothing in this branch calls any of them from a
command — they exist for a **future** scan to call before trusting a
stored artifact's approval.

- **`checkArtifactIntegrity(artifact)`** — recomputes
  `artifactFingerprint` from the artifact's own contents and rejects any
  mismatch. See the integrity-vs-authentication note above.
- **`checkRegistryCompatibility(artifact)`** — independently of whether
  the top-level `registryFingerprint` string already matches, always
  structurally validates the artifact's own `statementFingerprints`
  array against the current registry: exactly 16 entries, every id known
  and unique, no id missing, no extra/unknown id, and every fingerprint
  value equal to the current one for that id. This catches an artifact
  whose top-level string happens to be correct while its embedded
  per-statement list was independently tampered (missing, duplicated, or
  swapped in an unrelated entry) — a scenario the top-level string alone
  cannot detect. On any mismatch, `details` names exactly which
  statement(s) are `changed`/`missing`/`extra`/`duplicated`.
- **`checkSchemaCompatibility(currentSchemaMigration, artifact)`** —
  exact `id` + `hash` match only; a missing current or approved migration
  is never treated as compatible.
- **`checkTargetCompatibility(currentTarget, artifact)`** — exact
  `environment` + `descriptor` match only. An artifact approved against
  staging must never be treated as compatible with a production target
  (or vice versa) merely because the registry and schema migration
  happen to agree — two environments can share both while holding
  materially different data distributions.

### Target domain and compatibility

`ExplainPreflightTargetMetadata.environment` is narrowed to the closed
`'staging' | 'production'` domain (`ExplainPreflightEnvironment`) —
defined locally in this module, deliberately **not** imported from
`readonly-db-remote.ts`'s `RemoteTarget`, keeping this module
structurally independent of it the same way `LocalTarget` and
`RemoteTarget` already stay independent of each other. `currentTarget`
must be resolved by the caller; Phase B2 would derive it from the real
`RemoteTarget`/`describeRemoteTarget` wiring — nothing here implements
that.

## Least-privilege integration proof

`explain-preflight.least-privilege.db.test.ts` proves the mechanism end
to end against a real, disposable local role scoped to exactly what a
real `RemoteTarget` credential is required to be: `USAGE` on
`public`/`drizzle`, `SELECT` on exactly `REQUIRED_SELECT_TABLES`, no
memberships, no write privilege anywhere. It proves, inside one real
Postgres `READ ONLY` transaction: (a) `verifyReadOnlyRole` — the same
live least-privilege check `withReadOnlyRemoteDb` runs before any query —
accepts this role, and (b) `collectExplainPreflightFacts` then succeeds
using that same role and transaction, returning all 13 relation stats and
all 16 statement plans. This test imports `verifyReadOnlyRole` from
`readonly-db-remote.ts` (a pure privilege-check function, not a
connection) but never `withReadOnlyRemoteDb`/`describeRemoteTarget`, and
never connects to anything but local `test-db`. `PUBLIC`'s `CREATE`
grant on `public` is captured before the suite runs and restored exactly
afterward, matching the established pattern from
`readonly-db-remote.db.test.ts`.

## Tests

- `explain-preflight.test.ts` (unit, 40 tests, no DB): artifact assembly
  correctness; `scopeFingerprint` determinism and field-sensitivity
  (target/commit/schema change it; `generatedAt`/raw-plans/relation-stats
  do not); `artifactFingerprint` determinism and field-sensitivity (all
  of the above change it, including a raw plan or relation stat alone);
  insensitivity to `statementPlans`/`requiredRelationStats` array order
  but sensitivity to a plan node's `children` order; `checkArtifactIntegrity`
  pass path and mutation-detection for raw plans/`generatedAt`/relation
  stats/blank fingerprint; `checkRegistryCompatibility`'s pass path and
  every fail-closed path, including four dedicated negative cases proving
  the hardening (a *correct* top-level `registryFingerprint` combined
  with a missing, extra, duplicated, or changed statement entry); both
  `checkSchemaCompatibility` and `checkTargetCompatibility`'s pass paths
  and fail-closed paths; recursive plan parsing against a synthetic
  3-level fixture.
- `explain-preflight.db.test.ts` (real DB, 8 tests, local `test-db`
  only): 16/16 canonical statements plain-`EXPLAIN` successfully;
  relation stats (including `relPages`/`indexSizeBytes`) cover exactly
  the 13-table `REQUIRED_SELECT_TABLES` set; the two named
  priority-manual-review statements are flagged and no others; a real
  multi-join statement's plan parses into a non-trivial, multi-level fact
  tree; an artifact built from real collected facts is immediately
  registry-/schema-/target-compatible and passes its own integrity check;
  schema/target compatibility and integrity all fail closed against
  deliberate drift/mutation.
- `explain-preflight.least-privilege.db.test.ts` (real DB, 1 test, local
  `test-db` only): the end-to-end least-privilege integration proof above.

## Validation

- typecheck: clean
- lint: clean
- unit (`scripts/tenancy-inventory` subset): 74/74
- real DB (`pnpm test:db:local`): 32 files / 296 tests, all pass;
  `PUBLIC`'s `CREATE` grant on `public` confirmed restored after the run
- CI config (`pnpm test:db:ci`, the same command the required "DB Tests"
  job runs): 32 files / 296 tests, all pass — the new `.db.test.ts` files
  are picked up automatically by the existing
  `scripts/tenancy-inventory/**/*.db.test.ts` include from the Phase B0
  CI-coverage fix; no further CI config change was needed
- `arch:lint`: only the same pre-existing, unrelated `strict-rate-limit.ts`
  FAIL as every prior OZI-75/OZI-79 validation run

## What Phase B2 would still need to add

Explicitly not part of Phase B1, listed so the boundary stays visible:

- Actually calling `collectExplainPreflightFacts` against a
  `withReadOnlyRemoteDb` transaction (staging or production) — a
  separate, explicit execution authorization, per OZI-79's two-stage
  execution control.
- A CLI command (or equivalent) that resolves real `target`/`commit`
  metadata (deriving `target.environment`/`descriptor` from the real
  `RemoteTarget`/`describeRemoteTarget` wiring) and wires the collector +
  artifact builder together for a human to actually run.
- A place to store/load a produced `ExplainPreflightArtifactV1`, and a
  place to record an *approved* `scopeFingerprint`/`artifactFingerprint`
  separately from the artifact itself — `checkArtifactIntegrity` proves
  self-consistency, not approval; a scan needs both.
- Wiring `checkRegistryCompatibility`/`checkSchemaCompatibility`/
  `checkTargetCompatibility`/`checkArtifactIntegrity` into an actual scan
  command's preflight gate.
- The human review itself: reading the raw plans (especially the two
  flagged priority statements) and deciding what production-appropriate
  `statement_timeout`/`lock_timeout` values should replace the current
  local-default placeholders in `readonly-db-remote.ts` — this document
  and Phase B1's code produce facts for that decision; they do not make it.
