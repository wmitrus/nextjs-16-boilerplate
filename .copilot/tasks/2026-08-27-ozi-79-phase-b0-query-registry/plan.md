# OZI-79 Phase B0 — Canonical Query Registry

## Objective

Build a single canonical, immutable registry of every SQL statement the
tenancy-inventory tool runs, so the future plain-`EXPLAIN` preflight and
the future inventory-scan execution consume the exact same statement
definitions -- no duplicated SQL, no way for "what got reviewed" to drift
from "what actually runs." Explicitly still no remote connection, no
`staging`/`production` CLI command, no remote credential -- Phase B0 is
design/refactor/local-test only, per direct user authorization following
Phase A's approval.

## Classification

- Primary workflow: narrow, behavior-preserving refactor + additive test
  infrastructure, building directly on OZI-79 Phase A's already-reviewed
  design (not a new trust-boundary or security-policy decision) -- no full
  specialist review cycle re-run; the one security-relevant claim (that
  `REQUIRED_SELECT_TABLES`'s derivation from the registry is exactly
  equivalent to the prior hand-maintained list) is verified directly below
  and by a dedicated real-DB/unit test, not asserted.
- Severity: N/A (tooling, not an incident)
- Linear issue: OZI-79 (child of OZI-74, blocks OZI-78) -- reopened to
  In Progress after Linear auto-completed it on the Phase A merge
- Branch: `feat/ozi-79-phase-b0-query-registry`, from `main` @ `dd1127ef`
  (post Phase A / PR #81 merge)

## What was built

- `scripts/tenancy-inventory/query-registry.ts` -- `QUERY_REGISTRY`: 15
  data statements + 1 schema-metadata statement (`latest_schema_migration`),
  each a frozen `{ id, kind, description, sql, tables }` record. Exports:
  - `DATA_STATEMENTS` / `METADATA_STATEMENTS` -- filtered views
  - `getStatement(id)` -- typed lookup by the closed `StatementId` union
  - `REQUIRED_SELECT_TABLES` -- the deduplicated union of every
    statement's `tables`, replacing OZI-79 Phase A's hand-maintained
    13-entry array (verified identical below)
  - `statementFingerprint(statement)` / `allStatementFingerprints()` --
    per-statement SHA-256 over the statement's exact security-relevant
    identity: `id`, `kind`, verbatim SQL bytes (no whitespace
    normalization -- see "Fingerprint exactness" below), and its declared
    table set (canonicalized as a sorted, deduplicated list, so table
    *membership* matters but declaration order doesn't)
  - `registryFingerprint()` -- one SHA-256 over the id-sorted, colon-joined
    per-statement fingerprints; deterministic regardless of the array's
    declaration order. Meant to be recorded on a future approved plain-
    `EXPLAIN` artifact and re-checked before the later scan runs.
- `scripts/tenancy-inventory/topology-queries.ts` -- every one of the 12
  exported functions refactored to call `getStatement(id)` and run its SQL
  via `sql.raw()`, instead of owning its own `sql\`...\`` template or
  Drizzle query-builder chain. Public function signatures and return
  shapes are unchanged -- `cli.ts` (Phase A's `LocalTarget` scan command)
  needed no changes at all.
- `scripts/tenancy-inventory/readonly-db-remote.ts` -- `REQUIRED_SELECT_TABLES`
  now imported from `query-registry.ts` instead of defined locally.
- Every application relation in the canonical SQL is schema-qualified with
  `public.` (the one metadata statement keeps its existing `drizzle.`
  qualifier) -- the statement's meaning no longer depends on the
  connecting role's `search_path`, which a hardened remote role may not
  have set to include `public` at all.
- Tests:
  - `query-registry.test.ts` (unit, 20 tests) -- statement/id-count
    invariants, schema-qualification presence, full freeze-depth
    (registry array, each statement, each `tables` array, each individual
    table object) plus a real mutation-throws proof at every level,
    `REQUIRED_SELECT_TABLES` derivation correctness, fingerprint
    determinism/sensitivity to SQL/kind/table-set changes, insensitivity
    to declared-table *order*, an exact recomputation of
    `registryFingerprint()`'s hash algorithm, and two concrete whitespace-
    normalization collision regressions (see "Fingerprint exactness"
    below).
  - `query-registry.explain.db.test.ts` (real DB, 16 tests) -- plain
    `EXPLAIN` (never `EXPLAIN ANALYZE`) on every one of the 16 registry
    statements against local `test-db`, proving each is valid, plannable
    SQL against the live schema.
  - `query-registry.dependencies.db.test.ts` (real DB, 46 tests) -- proves
    `statement.tables` matches the statement's *actual* SQL dependencies,
    not just its declared intent: a disposable role granted `SELECT` on
    exactly a statement's declared tables must plain-`EXPLAIN` it
    successfully (16 cases -- nothing missing), and revoking `SELECT` on
    any one declared table must break that same `EXPLAIN` (30 cases across
    all statements -- nothing over-declared). Local `test-db` only.
  - `topology-queries.db.test.ts` (real DB, 1 test) -- behavior-
    preservation smoke test: every refactored function still runs cleanly
    against local `test-db` and returns its documented shape.
  - `readonly-db-remote.db.test.ts` -- import path updated to pull
    `REQUIRED_SELECT_TABLES` from `query-registry.ts`; all 11 existing
    tests still pass unchanged.
- No CLI wiring: `cli.ts` untouched. No `RemoteTarget` code touched beyond
  the one import swap above. No env var, no credential, no remote
  connection anywhere in this change.

## Fingerprint exactness (review-round fix)

The first draft's `statementFingerprint` normalized whitespace before
hashing (`.trim().replace(/\s+/g, ' ')`), reasoning that reformatting
alone shouldn't change a fingerprint. That reasoning was wrong: SQL
whitespace can be semantically load-bearing in ways a blind regex cannot
tell apart from incidental formatting --

- whitespace *inside a quoted string literal* is part of the literal's
  value (`'a  b'` and `'a b'` are different strings), and
- a real newline immediately before a `--` line comment ends that
  comment, while a *space* in the same position does not -- text after it
  keeps executing in one case and gets swallowed as comment in the other.

A normalizing fingerprint could therefore hash two SQL statements that
execute completely differently to the *same* value -- exactly the
collision a fingerprint meant to bind an approved `EXPLAIN` artifact to
what later actually runs must never allow. Fixed by removing
normalization entirely: the fingerprint now covers the exact SQL bytes
`sql.raw(statement.sql)` executes. `query-registry.test.ts`'s "no
whitespace normalization -- collision regressions" suite constructs both
scenarios above concretely and proves they no longer collide.

## REQUIRED_SELECT_TABLES equivalence check

Before deleting the old hand-maintained array, its 13 entries were
compared directly against the registry-derived union:

- `public`: `tenants`, `organizations`, `memberships`, `tenant_attributes`,
  `auth_organization_identities`, `users`, `auth_user_identities`,
  `feature_flags`, `audit_log_settings`, `audit_events`,
  `waitlist_entries`, `policies` (12 tables)
- `drizzle`: `__drizzle_migrations` (1 table)

Identical to the union produced by walking every registry statement's
`tables` field. `query-registry.test.ts`'s "REQUIRED_SELECT_TABLES
derivation" suite asserts this equivalence structurally (not just by this
one-time manual check) so a future statement addition/removal that
changes the required set is caught automatically, not by re-reading this
paragraph.

**Correction from the first draft**: this document previously described
`REQUIRED_SELECT_TABLES` as "computed from the SQL the checks actually
run." That overstated it -- there is no SQL parser here. Each statement's
`tables` field is metadata *declared* alongside its `sql`, by the same
author, at the same time; nothing mechanically derives one from the
other. What actually earns the trust that description implied is
`query-registry.dependencies.db.test.ts` (see above): a real-Postgres,
local-`test-db`-only test that grants a disposable role `SELECT` on
exactly each statement's declared tables and proves, via plain `EXPLAIN`,
that the declaration is neither missing a real dependency nor over-
declaring an unnecessary one. `REQUIRED_SELECT_TABLES` is correctly
described as *registry-declared dependencies, validated against the
actual SQL by least-privilege real-DB tests* -- not as something computed
from the SQL.

## Statement count verification

12 named checks compile to 15 data SQL statements:
`providerOrganizationMappingAnomalies`, `userProviderMappingAnomalies`,
and `quotaEnforcementSignal` each issue 2 statements (unmapped/duplicated,
unmapped/duplicated, max-organizations/max-users); every other check
issues 1. Plus `latestSchemaMigration`'s 1 schema-metadata statement = 16
total. `query-registry.test.ts` asserts `DATA_STATEMENTS.length === 15`
and `METADATA_STATEMENTS.length === 1` directly.

## Real bug class this refactor forecloses

Before this change, `readonly-db-remote.ts`'s required-table list and
`topology-queries.ts`'s actual SQL were two independently hand-maintained
sources of truth that happened to agree. Nothing enforced that agreement
mechanically -- a future column/table addition to one of the 12 checks
could silently update the SQL without updating the required-SELECT list
(or vice versa), and nothing would fail until a real remote credential
hit exactly that gap. `REQUIRED_SELECT_TABLES` is now declared once, in
the registry, alongside the SQL it describes, and
`query-registry.dependencies.db.test.ts` continuously validates that
declaration against the real SQL rather than trusting it by construction
-- that class of drift is no longer representable without a real-DB test
failing.

## Validation

- typecheck: clean
- lint (`pnpm lint --fix` + targeted `eslint --fix`): clean
- unit: 34/34 (`scripts/tenancy-inventory` subset: `query-registry.test.ts`
  20, `readonly-db-remote.test.ts` 4, `evidence-store.test.ts` +
  `ownership-matrix.test.ts` the remainder)
- real DB (`pnpm test:db:local`): 30 files / 287 tests, all pass, including
  the 16-statement plain-`EXPLAIN` suite, the 46-test least-privilege
  dependency-verification suite, and the topology-queries behavior-
  preservation smoke test
- `arch:lint`: only the same pre-existing, unrelated `strict-rate-limit.ts`
  FAIL as every prior OZI-75/OZI-79 validation run

## What this explicitly does NOT do

- No `scan --target=staging|production` CLI command
- No remote credential, no remote connection, no `RemoteTarget` logic
  changes beyond one import swap
- No `EXPLAIN` against anything but local `test-db`
- No use of `registryFingerprint()`/`statementFingerprint()` outside
  tests yet -- the binding-to-an-approved-artifact mechanism these exist
  for is Phase B's next step (plain-`EXPLAIN` preflight), not this one

## Update Log

### 2026-08-27 — Final Phase B0 review, before merge

- Trigger: user code review requested six fixes before merge.
- Fingerprint exactness: removed whitespace normalization (see
  "Fingerprint exactness" above); fingerprint now also covers `kind` and
  the declared table set, not just `id` + SQL.
- Deep freeze: individual `QualifiedTable` objects are now frozen too
  (previously only the registry array, each statement, and each
  statement's `tables` array were frozen, not the table objects inside
  it); `query-registry.test.ts` tests the full freeze depth and proves a
  mutation attempt actually throws at every level.
- Schema qualification: every application relation in the canonical SQL
  now reads `public.table` explicitly; `drizzle.__drizzle_migrations` was
  already qualified and is unchanged.
- Real-DB dependency verification: added
  `query-registry.dependencies.db.test.ts` (46 tests, local `test-db`
  only) proving `statement.tables` matches actual SQL dependencies via
  least-privilege plain-`EXPLAIN` checks.
- Docs correction: replaced the inaccurate "computed from SQL" claim with
  "registry-declared dependencies, validated against the actual SQL by
  least-privilege real-DB tests."
- Still true: no remote CLI command, no remote credential, no remote
  connection, no production `EXPLAIN` anywhere in this change.

## Artifacts

- `plan.md` (this file)
