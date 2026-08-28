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
  production --execute-remote-explain` command with its own strict
  `parsePlanArgs` argument contract (exactly one `--target`, only the
  acknowledgement flag, no unrecognized/duplicated/positional
  arguments); `run()` refactored to accept an optional `argv` parameter
  for direct unit testing
- `scripts/tenancy-inventory/cli.test.ts` (new, 24 unit tests, no DB, all
  remote/network/evidence effects mocked)
- `scripts/tenancy-inventory/readonly-db-remote.ts` -- gained
  `assertTargetIdentityMatchesExpectation` (renamed in round 6 from
  `assertTargetDescriptorMatchesExpectation`), baked into
  `withReadOnlyRemoteDb` (a real part of this phase's final design, not
  an incidental patch), plus `computeVerifiedIdentityFingerprint` (round
  6, a non-secret SHA-256 of the same verified identity), plus a
  doc-comment update (the module previously said nothing was wired into
  a CLI command; this phase makes that untrue)
- `scripts/tenancy-inventory/readonly-db-remote.test.ts` -- 19 tests for
  the target-identity safeguard and the verified-identity fingerprint,
  including credential-redaction proof
- `scripts/tenancy-inventory/evidence-store.ts` -- doc-comment update
- `scripts/tenancy-inventory/explain-preflight.ts` -- round 6 added
  `ExplainPreflightArtifactV2`/`version: 2` and its parallel
  `buildExplainPreflightArtifactV2`/`checkTargetCompatibilityV2`/
  `checkArtifactIntegrityV2` (V1 unchanged); `cli.ts`'s `plan` command now
  builds V2 artifacts
- `scripts/tenancy-inventory/tenancy-inventory.env.example` -- documents
  the two `*_EXPECTED_IDENTITY` env vars (renamed in round 6 from
  `*_EXPECTED_DESCRIPTOR`) and their sourcing requirement (must come from
  authoritative environment/provider metadata, never derived from the
  corresponding `*_READONLY_DATABASE_URL`)

## Validation

typecheck clean · lint clean · unit (`scripts/tenancy-inventory` subset)
136/136 · unit (full repo) 279 files / 2389 tests · real DB
(`pnpm test:db:local`) 32 files / 297 tests · CI config (`pnpm
test:db:ci`) 32 files / 297 tests · adversarial falsification pass
performed on every negative-path invariant across all six review rounds'
fixes, before push (see runbook.md)

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

### 2026-08-28 — Review round 1 (Codex)

- Fixed a real P2 gap: neither the closed `RemoteTarget` domain nor
  `resolveRemoteUrl` verified that a target's credential env var actually
  pointed at that environment, so a swapped/misconfigured credential
  could let `plan --target=staging` silently connect to production.
  Added `assertTargetDescriptorMatchesExpectation`, baked into
  `withReadOnlyRemoteDb` itself (matching `verifyReadOnlyRole`'s
  placement) plus an explicit early check in `cli.ts`.
- Fixed doc drift in `evidence-store.ts` and
  `tenancy-inventory.env.example` that the new wiring made inaccurate.
- Fixed the runbook's own missing code-fence language (Codacy).
- Found and fixed a test-isolation gap in `cli.test.ts` while falsifying
  the round-1 fix (`clearAllMocks` doesn't reset implementations,
  letting one test's mock behavior leak into another) -- see runbook.

### 2026-08-28 — Review round 2 (Codex)

- Fixed a real P2 gap: the round-1 mismatch error echoed the raw
  `*_EXPECTED_DESCRIPTOR` env var value verbatim, which could leak a
  credential if an operator mistakenly pasted a connection URL into it.
  Redacted; added a regression test with a secret-looking value,
  verified via revert.

### 2026-08-28 — Review round 3 (user-directed hardening pass)

- Strengthened the round-2 redaction tests to the exact named scenario
  (a credential-shaped `postgres://[username]:[REDACTED]@[host]/[database]`
  URL), checking the full value, the password, and the username
  individually never reach the thrown message, at both the unit and
  `withReadOnlyRemoteDb` level.
- Added `parsePlanArgs`: `plan` now rejects a duplicated `--target`,
  any unrecognized flag (including `--allow-dirty`, now explicitly
  rejected rather than merely ignored), and positional garbage --
  before any git call or remote wiring. `scan`'s contract is untouched.
- Fixed three tests that relied on an env var merely not being exported
  in the real shell, instead of explicitly stubbing it to `''`.
- Reconciled documentation drift (the "only changed a doc comment"
  claim, stale test counts, the target-identity safeguard now described
  as part of the final design) and added the explicit sourcing
  requirement for `*_EXPECTED_DESCRIPTOR` (never derived from
  `*_READONLY_DATABASE_URL`) to both the runbook and the env template.
- Added one more regression test (a `writeEvidence` rejection
  propagating instead of being swallowed) to close the last named gap
  without an existing test.
- Full systematic falsification pass across every named negative case;
  every check verified via temporary revert.

### 2026-08-28 — Review round 4 (Codex)

- Fixed a real P2 gap: a raw Postgres/Drizzle failure (connection,
  auth, TLS, or query error) propagated unchanged to the top-level
  handler's `console.error`, which could leak a hostname/username from
  the underlying infrastructure error. `runRemoteExplainPlan` now
  catches it, re-throws `RemoteRoleNotReadOnlyError` as-is (already
  safe), and sanitizes everything else, keeping the original only as
  `cause`. Added a regression test with a realistic credential-shaped
  auth-failure message, verified via revert.
- Fixed stale "a future Phase B2 would..." phase-boundary language in
  `explain-preflight.ts` (module doc comment,
  `ExplainPreflightEnvironment`, `checkTargetCompatibility`,
  `checkArtifactIntegrity`) now that Phase B2 is the current, completed
  phase and did something narrower than originally drafted.

### 2026-08-28 — Review round 5 (Codex)

- Fixed a real gap in round 1's own fix, not a new adjacent issue:
  `assertTargetDescriptorMatchesExpectation` compared host:port/database
  only, which this repo's own documented Supabase pooler URL shape
  shares identically across every project in a region -- only the
  username differs. Reproduced the silent-swap-acceptance bug in
  isolation against the pre-fix code, then confirmed the fix rejects it,
  before trusting either. Fixed by including the username in the
  comparison (never in anything printed) and simplifying the function to
  resolve everything itself from `target`, removing the
  caller-supplied-descriptor parameter both callers had to keep in sync.
- Fixed a second real gap: `parsePlanArgs` echoed rejected CLI argument
  values verbatim (e.g. `--database-url=postgres://user:pass@host/db`)
  into the thrown error the top-level handler prints. Fixed with
  `safeArgumentDescription` (flag name only, or argument position for a
  bare positional). Swept the rest of the diff for the same pattern;
  found nothing else.

### 2026-08-28 — Review round 6 (user-directed hardening pass)

- Persisted a non-secret `verifiedIdentityFingerprint` (domain-separated
  SHA-256 of the same identity `assertTargetIdentityMatchesExpectation`
  verifies) on the artifact itself, not just checked at connection time --
  a produced artifact must already carry every identity component a
  later approval gate will need. Introduced `ExplainPreflightArtifactV2`/
  `version: 2` rather than mutating V1's meaning (no real V1 artifacts or
  loader to migrate yet); V1 untouched. `checkTargetCompatibilityV2`
  fails closed on a missing/malformed fingerprint, not just a mismatch.
  Renamed `OZI79_*_EXPECTED_DESCRIPTOR` → `OZI79_*_EXPECTED_IDENTITY` and
  `assertTargetDescriptorMatchesExpectation` →
  `assertTargetIdentityMatchesExpectation` (the value was already
  username-inclusive identity since round 5; the name was wrong).
- Fixed a second real gap: `resolveCommitSha`/`resolveCommitShaStrict`/
  `isWorkingTreeDirty` ran `git` with no explicit `cwd`, so launching the
  script from a different working directory would report that
  directory's git state while still querying this repository's schema.
  Fixed by computing `REPO_ROOT` from `import.meta.url` and passing it
  explicitly.
- Both fixes verified via temporary revert-and-confirm-failure (the
  cwd fix specifically required launching the test process from a real
  different OS-level working directory to exercise the gap, since a
  same-process test run cannot otherwise differ from `process.cwd()`).
  See runbook.md for the full falsification detail and the adversarial
  matrix covered.

## Artifacts

- `plan.md` (this file)
- `runbook.md` -- execution boundary, design rationale, falsification
  pass, what Phase B2 explicitly does not do
