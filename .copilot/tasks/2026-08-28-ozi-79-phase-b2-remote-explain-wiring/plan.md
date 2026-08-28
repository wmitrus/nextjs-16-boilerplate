# OZI-79 Phase B2 — Remote Plain-EXPLAIN Wiring

## Objective

Wire the already-reviewed Phase A (`RemoteTarget`, `withReadOnlyRemoteDb`,
`describeRemoteTarget`) and Phase B1 (`collectExplainPreflightFacts`,
`buildExplainPreflightArtifact`) components together into one narrowly
scoped CLI command, build/test/review only. This states the original
objective; the review rounds went beyond pure wiring and hardened some of
those Phase A components -- see `Classification` below and `runbook.md`
for the full execution boundary and design detail.

## Classification

- Primary workflow: originally scoped as narrow, additive wiring (one new
  CLI command + one new test file). That opening classification no longer
  describes the delivered change and must not be used to under-scope a
  security read of this PR -- the review rounds materially hardened
  existing credential/connection code. Split explicitly:
  - **Unchanged existing logic:** `verifyReadOnlyRole`'s privilege
    semantics, the canonical 16-statement query registry and its SQL, and
    the Phase B1 collector's canonicalization/fingerprinting logic. The
    V1 artifact contract is likewise untouched (V2 is additive).
  - **Modified existing credential/connection logic:** `resolveRemoteUrl`
    was hardened (round 12) into the authoritative credential URL
    parse/normalization gate, and `withReadOnlyRemoteDb` now enforces
    target identity before opening a connection and connects using that
    gate's validated, normalized URL. Both are pre-existing,
    previously-security-reviewed trust-boundary functions. See
    `runbook.md`'s "Execution boundary" for the exact Changed/Unchanged
    breakdown.
- Review coverage: no full specialist workflow cycle was re-run up front
  (the original narrow-wiring classification), but the credential and
  connection boundary above received iterative security review across 15
  rounds -- Codex findings plus two user-directed hardening/self-review
  passes. Not every round carried the same class of evidence, so treat
  them separately rather than as one uniform falsification claim:
  - **Executable fix, verified by revert-and-confirm-failure** (the check
    was temporarily removed and the corresponding test confirmed to
    genuinely fail, then restored): rounds 1-6, 8, 10 (the query-string
    rejection), 12, 13. This is the load-bearing security evidence.
  - **Refactor/rename with no revertable broken state**, verified instead
    by a full passing suite plus a repository-wide sweep confirming zero
    remaining occurrences of the old shape: round 10 (the credential-
    fixture rename) and round 11 (the structural `buildTestPostgresUrl`
    extraction).
  - **Documentation only, no executable change and therefore no
    falsification testing**: rounds 7, 9, 14, 15. These corrected
    control-artifact accuracy and carry no runtime security evidence.

  Treat the first category as the security evidence for this PR, not the
  stale opening classification and not the round count on its own.
- Severity: N/A (tooling, not an incident)
- Linear issue: OZI-79 (child of OZI-74, blocks OZI-78)
- Branch: `feat/ozi-79-phase-b2-remote-explain-wiring`, from `main` @
  `62e457b2` (post PR #85 merge)

## What was built

Full, authoritative, current-state detail lives in `runbook.md`'s "What
was built" section (rewritten in full at round 12, not patched) -- this
list is a summary pointer, not a duplicate:

- `scripts/tenancy-inventory/cli.ts` -- `plan --target=staging|
  production --execute-remote-explain` command with its own strict
  `parsePlanArgs` argument contract (exactly one `--target`, only the
  acknowledgement flag, no unrecognized/duplicated/positional
  arguments, `--allow-dirty` explicitly rejected); `run()` accepts an
  optional `argv` parameter for direct unit testing
- `scripts/tenancy-inventory/cli.test.ts` -- wiring/fail-closed-boundary
  coverage, no DB, all remote/network/evidence effects mocked
- `scripts/tenancy-inventory/readonly-db-remote.ts` -- `resolveRemoteUrl`
  (the single authoritative URL parse gate),
  `assertTargetIdentityMatchesExpectation`, `computeVerifiedIdentityFingerprint`,
  `withReadOnlyRemoteDb`
- `scripts/tenancy-inventory/readonly-db-remote.test.ts` -- target-identity
  safeguard, verified-identity fingerprint, and URL-parse-gate coverage,
  including credential-redaction proof
- `scripts/tenancy-inventory/evidence-store.ts` -- doc-comment update
- `scripts/tenancy-inventory/explain-preflight.ts` -- `ExplainPreflightArtifactV2`/
  `version: 2` and its parallel `buildExplainPreflightArtifactV2`/
  `checkTargetCompatibilityV2`/`checkArtifactIntegrityV2`/
  `isCanonicalVerifiedIdentityFingerprint` (V1 unchanged); `cli.ts`'s
  `plan` command builds V2 artifacts
- `scripts/tenancy-inventory/tenancy-inventory.env.example` -- documents
  the two `*_EXPECTED_IDENTITY` env vars and their sourcing requirement,
  plus the query-string/fragment rejection
- `scripts/tenancy-inventory/test-postgres-url.ts` -- shared test-only
  helper assembling credential-shaped test URLs structurally, so no
  committed source line writes a complete `user:pass@host` literal

## Validation

See `runbook.md`'s "Validation" section for the current, exact
typecheck/lint/unit/real-DB/CI-config results -- not duplicated here to
avoid two counts drifting out of sync as the branch changes. Falsification
coverage is not uniform across rounds -- see the `Review coverage` bullet
under `Classification` above for the exact per-round breakdown (revert-
verified executable fixes vs. refactors with no revertable state vs.
documentation-only rounds); this section intentionally does not restate
that breakdown a second time.

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
  values verbatim (e.g.
  `--database-url=postgres://[username]:[REDACTED]@[host]/[database]`)
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

### 2026-08-28 — Rounds 7–11 (Codex + docs-only fixes)

Doc-drift fixes (V2 identity contract references, pipeline-diagram
order), a `safeArgumentDescription` no-`=` redaction gap, replacing
committed credential-shaped literals in docs then in test fixtures (by
content, then structurally via `test-postgres-url.ts`), and a Codacy
`S2068` identifier rename. Full detail in `runbook.md`'s "Review round
7"–"Review round 11" sections; not repeated here.

### 2026-08-28 — Round 12 (self-review invariant pass, not a Codex round)

User-directed: stop the iterative cited-line-only repair loop and review
the complete Phase B2 trust boundary as one invariant before pushing
again. Full self-review report, invariant map, and findings are in
`runbook.md`'s "Review round 12" section. Summary:

- Rewrote `runbook.md`'s "What was built" section in full (not patched)
  to exactly match the real execution order, including that
  `parsePlanArgs` validates the complete CLI contract before
  `runRemoteExplainPlan` runs at all.
- `resolveRemoteUrl` is now the single authoritative URL parse gate:
  requires a successful `new URL()` parse, the exact `postgres:`/
  `postgresql:` scheme, no query string, no fragment, and non-empty
  hostname/username/database -- and returns the parser's own normalized
  re-serialization, so `postgres()` and this tool's identity functions
  can never interpret the same configured value differently.
- `verifiedIdentityFingerprint` now has one canonical format (lowercase
  64-character SHA-256 hex), enforced by both
  `buildExplainPreflightArtifactV2` (constructor invariant) and
  `checkTargetCompatibilityV2` (format-validated independently on both
  sides before any equality check, so two malformed-but-identical values
  are never compatible) -- this caught a genuine pre-existing bug: the
  round-6 test fixtures were 63 characters, one short of canonical.
- `resolveCommitShaStrict` no longer interpolates the raw subprocess
  error's `.message` into its thrown message (preserved only as
  `cause`), closing an output-leak gap found during a full audit of
  every value this path ever echoes.
- Full repository-wide sweep for committed credential-shaped literals,
  redone from scratch rather than trusting round 11's result -- found
  and fixed a few remaining doc-prose and trivial test-literal instances
  round 11 missed.

### 2026-08-28 — Round 13 (Codex)

One finding (P2), treated as a repository commit-binding invariant, not
a one-line `git status` patch: `assume-unchanged`/`skip-worktree` Git
index flags can make `git status --porcelain` silently miss a real edit
to a tracked file, so `plan` could connect remotely and persist evidence
stamped with the unchanged HEAD SHA even though different code executed.
Added `assertNoHiddenGitIndexState` (checked before the ordinary
cleanliness check) via `git ls-files -v -z`; also made `isWorkingTreeDirty`
explicit/configuration-independent (`--porcelain=v1 --untracked-files=all`)
without weakening any existing rejection. A verifier, not a mutator --
never clears either flag, never names the affected path.

Re-reviewed every Git-based assumption in the commit-binding chain
(`REPO_ROOT` -> hidden index state -> worktree status ->
`resolveCommitShaStrict` -> `artifact.commit`) after the fix; confirmed
sparse-checkout is already covered (uses skip-worktree internally) and
this repository has no submodules/sparse-checkout configured. Full
detail in `runbook.md`'s "Review round 13" section.

Tests: mocked coverage in `cli.test.ts` plus a new `cli.git-index.test.ts`
exercising real `git update-index --assume-unchanged`/`--skip-worktree`
against a disposable temp repository (no mocking, no network/DB/remote
credential) -- proving ordinary `git status` genuinely misses the hidden
edit and the new guard genuinely catches it. Verified via
revert-and-confirm-failure.

### 2026-08-28 — Rounds 14–15 (Codex, documentation only)

Two findings of the same class, one per control artifact: a stale
current-state claim that understated how much existing, previously
security-reviewed code Phase B2 actually changed.

Round 14 fixed `runbook.md`'s "Execution boundary" section, which still
said `readonly-db-remote.ts` gained only two functions and that
"everything else" was untouched -- untrue since round 12 hardened
`resolveRemoteUrl` into the authoritative URL parse/normalization gate.
Rewritten into explicit Changed/Unchanged lists; the adjacent Phase A/B1
bullet that contradicted it by still calling `withReadOnlyRemoteDb`/
`describeRemoteTarget` "unmodified" was narrowed to match.

Round 15 fixed the same class of claim in this file's own
`Classification` section, which used a blanket "no existing
security-reviewed logic modified" to justify not re-running a full
specialist review cycle -- allowing a reviewer relying on `plan.md` to
under-scope the security read. Split into explicit unchanged
role/query/collector logic versus modified credential/connection logic,
with the actual review coverage stated rather than implied.

No executable TypeScript, test, artifact-contract, Git-guard, or
remote-DB-wiring code changed in either round.

### 2026-08-28 — Round 16 (Codex, documentation only)

Codex flagged wording introduced by round 15 itself: the new
`Review coverage` bullet above claimed all review rounds were verified by
temporary revert-and-confirm-failure, which overstated the evidence --
rounds 7, 9, 14 and 15 are documentation-only, and rounds 10 (fixture
rename) and 11 were refactors with no revertable broken state. Verified
against `runbook.md`'s per-round sections, then replaced the blanket
claim with three explicit evidence categories. The PR description carried
the same claim with a stale round count and was corrected identically.
Docs only.

### 2026-08-28 — Round 17 (Codex, documentation only)

Round 16's fix corrected the `Review coverage` bullet under
`Classification` but left an independent, third occurrence of the same
blanket falsification claim standing in this file's own `Validation`
section -- a separate under-sweep, not a new defect. Replaced it with a
pointer to the `Review coverage` breakdown instead of a second
restatement, so the claim exists in exactly one place in `plan.md` going
forward. Re-swept `plan.md`, `runbook.md`, and the PR description for any
remaining instance of the phrase; none found. Docs only.

## Artifacts

- `plan.md` (this file)
- `runbook.md` -- execution boundary, design rationale, falsification
  pass, what Phase B2 explicitly does not do
