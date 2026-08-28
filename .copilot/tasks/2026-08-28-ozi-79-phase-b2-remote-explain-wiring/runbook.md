# OZI-79 Phase B2 — Remote Plain-EXPLAIN Wiring (build/test/review only)

## Execution boundary — read this first

**Phase B2 is authorized as build/test/review only. It does NOT authorize
connecting to staging or production, during implementation, testing, or
this PR's CI.** This document exists specifically to record that boundary
before any real remote execution is separately authorized.

- No command in this branch was ever run against a real staging or
  production database. Every test that exercises `plan`'s wiring mocks
  `withReadOnlyRemoteDb`, `describeRemoteTarget`, `collectExplainPreflightFacts`,
  and `writeEvidence` — no real remote connection, DNS lookup, or TLS
  handshake happens anywhere in this test suite.
- `plan --target=staging|production` requires the explicit
  `--execute-remote-explain` acknowledgement before it opens any
  connection. `plan --target=production` alone, with no other flag, is a
  pure validation error — it never reaches git or network code.
- The already-reviewed Phase A (`RemoteTarget`, `withReadOnlyRemoteDb`,
  `describeRemoteTarget`, `verifyReadOnlyRole`) and Phase B1
  (`collectExplainPreflightFacts`, `buildExplainPreflightArtifact`,
  the canonical 16-statement `QUERY_REGISTRY`) components are wired
  together **unmodified** — this phase adds no new SQL, no new registry
  statements, no changes to `verifyReadOnlyRole`'s privilege checks, and
  no changes to the collector's canonicalization/fingerprinting logic.
- `readonly-db-remote.ts`'s only change is a stale doc-comment update
  (it previously said "nothing wired into a CLI command yet," which this
  phase makes untrue) — its TLS (`ssl: 'verify-full'`), least-privilege
  verification, `READ ONLY` + `REPEATABLE READ` transaction, and timeout
  constants are all untouched.
- `explain-preflight.ts`'s canonical 16-statement collector and
  fingerprinting logic are untouched.
- No remote timeout constant was tuned. No approval-record concept, no
  persisted-artifact loading, no automated plan verdict, no retry logic,
  and no Phase B3 functionality exists anywhere in this branch.
- `scan --target=dev|test` behavior is byte-for-byte unchanged.
  `scan --target=staging|production` still fails with the same
  pre-existing validation error it always has — no remote scan support
  was added.

If you are reading this while deciding whether real execution is safe:
it is not authorized by this document or this branch. Actually running
`plan --target=staging|production --execute-remote-explain` against a
real target is a separate, explicit, not-yet-given authorization, and is
its own security checkpoint per OZI-79's two-stage execution control —
building this wiring is not that authorization.

## What was built

### `cli.ts`'s `plan --target=staging|production --execute-remote-explain`

Wires the already-reviewed components together, in this exact order,
end to end:

```text
RemoteTarget (--target=staging|production)
  -> describeRemoteTarget(target)          -- safe host:port/database descriptor
  -> withReadOnlyRemoteDb(target, async (tx) => {
       collectExplainPreflightFacts(tx)     -- Phase B1, unmodified
         -> buildExplainPreflightArtifact(facts, { target, commit })
     })
  -> writeEvidence(target, fileName, JSON.stringify(artifact))
  -> safe terminal summary (never the full artifact)
```

`target`/`descriptor` are the only two things this command ever learns
about "where": `target` comes only from the closed `--target=staging|
production` check, `descriptor` only from `describeRemoteTarget(target)`.
There is no flag, parameter, or code path anywhere in `runRemoteExplainPlan`
that accepts a caller-supplied connection URL, descriptor string,
arbitrary SQL, a query id/subset, or an environment string outside that
closed domain — `collectExplainPreflightFacts` always runs the full,
frozen `QUERY_REGISTRY`.

### Fail-closed preconditions, checked in this order, before any connection

1. **`--execute-remote-explain` is present.** `plan --target=staging|
   production` with no other flag is a hard error before any git call or
   network I/O. This is the acknowledgement gate: the whole point is that
   typing the target alone is never sufficient.
2. **The working tree is clean.** Unlike `scan`, there is **no
   `--allow-dirty` escape hatch** for `plan` — the flag is never even
   read by `runRemoteExplainPlan`, so passing it has no effect on this
   check. A remote target's artifact is exactly the kind of evidence a
   human might later approve; an ambiguous "which commit does this
   describe" is not acceptable for that, the way it is for `scan`'s
   local, low-stakes iteration.
3. **The commit SHA resolves.** `resolveCommitShaStrict` — a new function,
   distinct from `scan`'s existing `resolveCommitSha` — throws on any
   `git rev-parse HEAD` failure or empty output, instead of silently
   falling back to the string `'unknown'`. A remote artifact makes a much
   stronger claim ("this exact commit was reviewed against this exact
   remote database") than `scan`'s local report, so an unresolvable
   commit must be a hard failure here, not a placeholder baked into
   evidence a human might approve.
4. **The resolved target's descriptor matches a separately, independently
   declared expectation** (`assertTargetDescriptorMatchesExpectation`,
   added in review round 1 below). Added after review correctly pointed
   out that `resolveRemoteUrl` only validates that the target's env var
   is *set* and looks like a postgres URL -- it has no way to know
   whether `OZI79_STAGING_READONLY_DATABASE_URL` actually points at
   staging rather than production. A swapped or misconfigured credential
   would otherwise let `plan --target=staging` silently connect to
   production while the persisted artifact is stamped
   `environment: staging`. Fixed by requiring a SECOND, independently-set
   env var per target (`OZI79_STAGING_EXPECTED_DESCRIPTOR`/
   `OZI79_PRODUCTION_EXPECTED_DESCRIPTOR`) declaring the exact expected
   `describeRemoteTarget` output, and failing closed if it is unset or
   does not match. Baked into `withReadOnlyRemoteDb` itself (the same
   placement reasoning as `verifyReadOnlyRole`), not left to `cli.ts` to
   remember to call -- `cli.ts` also calls it explicitly beforehand so a
   mismatch fails before the "connecting to..." log line is even printed,
   but the authoritative enforcement point is inside the connection
   function, for any future caller.

Only once all four hold does `withReadOnlyRemoteDb` get called — exactly
once, with `collectExplainPreflightFacts(tx)` invoked exactly once inside
it.

### Evidence and terminal output

The full `ExplainPreflightArtifactV1` (every raw `EXPLAIN` plan, every
relation stat) is persisted via the existing `writeEvidence(target, ...)`
mechanism, under the `staging`/`production` evidence directory
(`~/.local/share/nextjs-16-boilerplate/ozi-75/<target>/`) — never
committed to the repo. The filename is
`<target>-explain-preflight-<generatedAt>-<artifactFingerprint prefix>.json`:
timestamp- and fingerprint-based only, containing no hostname, database
name, URL, or credential.

Terminal output is a **safe, concise summary only** — target, safe target
descriptor, commit SHA, schema migration id/hash, registry/scope/artifact
fingerprints, statement count, the two priority-manual-review statement
ids, `requiresManualReview`, and the evidence file path. It deliberately
never dumps the full artifact or any raw `EXPLAIN` plan to the terminal,
unlike `scan` (which does print its full local report — that report holds
only aggregate counts, never a raw plan). A remote artifact's raw plans
are safe to persist as evidence a reviewer opens deliberately, but not to
print into logs that may be captured far more casually than a file
someone has to go and read.

## Tests

`cli.test.ts` (new, 15 tests, no DB, every remote/network/evidence effect
mocked — this is a wiring/fail-closed-boundary test file, not a real
Postgres/EXPLAIN test; that remains `explain-preflight.db.test.ts`'s job):

- missing `--execute-remote-explain` rejects for both `staging` and
  `production`, before any git call or `withReadOnlyRemoteDb` call
  (`plan --target=production` alone never connects);
- an invalid target (`dev`, missing, or an unrecognized string like
  `Staging`/`all`) rejects before any git call, even with the
  acknowledgement present;
- a dirty working tree rejects before resolving a commit or connecting,
  and **does not support `--allow-dirty`** — a dirty tree still fails
  even when that flag is passed;
- an unresolvable commit SHA rejects, both for a throwing `git rev-parse`
  and for one that succeeds but returns an empty value;
- a `describeRemoteTarget` failure (e.g. the real env var being unset)
  propagates without ever calling `withReadOnlyRemoteDb`;
- a `withReadOnlyRemoteDb` rejection (e.g. a misconfigured role) does not
  write evidence;
- exact wiring, parameterized over both `staging` and `production`:
  exactly one `withReadOnlyRemoteDb` call with the correct target,
  exactly one `collectExplainPreflightFacts` call, the persisted
  artifact's `target`/`commit` fields bound to the real values, evidence
  written under the matching environment with a hostname-free filename,
  and terminal output that includes the safe summary fields but never the
  raw plan or the full artifact JSON;
- `scan --target=staging` and `scan --target=production` still fail with
  the pre-existing validation error, without reaching any remote wiring.

### Adversarial falsification pass (performed before push)

Every negative-path test above was verified, by temporarily reverting
its corresponding check in `cli.ts` and re-running the suite, to
genuinely fail against the broken code before being restored:

- removing the `--execute-remote-explain` check entirely → exactly the
  two acknowledgement tests failed;
- making `plan` honor `--allow-dirty` (mirroring `scan`) → exactly the
  "does not support `--allow-dirty`" test failed;
- switching back to the lenient `resolveCommitSha` (falls back to
  `'unknown'`) instead of `resolveCommitShaStrict` → exactly the two
  unresolved-commit tests failed;
- writing evidence under the hardcoded `'local'` environment instead of
  the real `target` → exactly the two exact-wiring tests failed (this
  one typechecks cleanly, since `'local'` is a valid `EvidenceEnvironment`
  literal — confirming the test, not the type system, is what actually
  guards this binding).

Each revert was restored immediately after confirming the failure, and
the full suite was re-run green before continuing.

### A genuine Vitest/Node-builtin mocking gotcha, found and fixed before relying on the tests

Mocking `node:child_process`'s `execFileSync` for this test file initially
appeared to work (no error, mock applied) but silently ran the **real**
`git status`/`git rev-parse` against this actual checkout instead of the
mock, because `cli.ts`'s `import { execFileSync } from 'node:child_process'`
resolves through the mock's `default.execFileSync` under this repo's
Vite/Vitest CJS-interop for this Node builtin, while the test file's own
identical-looking import resolves through the top-level named property
instead. Confirmed empirically with an isolated minimal repro (two
distinctly-named mock functions, logged which one each side actually
called) before fixing it — the fix sets both `execFileSync` and
`default.execFileSync` to the exact same function reference.

## Review round 1 (Codex)

Three findings, all fixed on the same branch:

- **Add a language identifier to the runbook fence (P1, cosmetic).**
  This document's wiring diagram opened with an untyped fence. Fixed by
  labeling it `text`.
- **Bind each remote target to its configured destination (P2, real
  gap).** See the new fourth fail-closed precondition above
  (`assertTargetDescriptorMatchesExpectation`) — this is the substantive
  fix. Also added: 5 new tests in `readonly-db-remote.test.ts` (unset/
  mismatched/matching/never-mixed-up expectation env vars, plus a
  dedicated proof that `withReadOnlyRemoteDb` itself refuses to open a
  connection -- `postgres()` never called -- when the safeguard fails)
  and 2 new tests in `cli.test.ts` (the same two failure modes through
  the full `plan` command). Both fail-closed checks (the one baked into
  `withReadOnlyRemoteDb` and the one `cli.ts` calls explicitly
  beforehand) were verified via temporary revert to genuinely catch a
  removed check before being restored -- see below.
- **Refresh the live remote-wiring documentation (P2, doc drift).**
  `evidence-store.ts`'s module doc comment and
  `tenancy-inventory.env.example` both still said nothing/no command was
  wired to staging/production evidence, which `plan` now makes untrue.
  Both updated; `tenancy-inventory.env.example` also documents the two
  new `*_EXPECTED_DESCRIPTOR` variables the round-1 fix requires.

### A test-isolation gap found while falsifying the round-1 fix

While reverting `cli.ts`'s explicit `assertTargetDescriptorMatchesExpectation`
call to confirm its two new tests genuinely fail without it, they instead
failed with an unrelated *leaked* error from a different, earlier test
(`mockRejectedValue('Connected role has elevated attribute(s)...')`)
still active on the `withReadOnlyRemoteDb` mock. `cli.test.ts`'s
`afterEach` was calling `vi.clearAllMocks()`, which resets call history
but **not** mock implementations set via `mockImplementation`/
`mockReturnValue`/`mockRejectedValue` -- so an implementation set by one
test can silently persist into a later test that never expected that
mock to be invoked at all. Every mock in this file has no factory-level
default implementation (each test sets exactly what it needs), so
switching to `vi.resetAllMocks()` is safe and closes the gap. Confirmed
the fix doesn't break anything: full suite re-run green after the
switch, and the round-1 tests were re-verified to still correctly fail
against the reverted code afterward.

## Validation

- typecheck: clean
- lint: clean
- unit (`scripts/tenancy-inventory` subset): 105/105 (83 pre-existing +
  17 in `cli.test.ts` + 5 new in `readonly-db-remote.test.ts`)
- unit (full repo, `pnpm test`): 279 files / 2358 tests, all pass
- real DB (`pnpm test:db:local`): 32 files / 297 tests, all pass
- CI config (`pnpm test:db:ci`, the same command the required "DB Tests"
  job runs): 32 files / 297 tests, all pass

## What Phase B2 explicitly does NOT do

Listed so the boundary stays visible for whoever scopes the next phase:

- No real connection to staging or production, anywhere, at any point —
  not in implementation, not in tests, not in CI.
- No tuning of `readonly-db-remote.ts`'s `STATEMENT_TIMEOUT_MS`/
  `LOCK_TIMEOUT_MS`/`IDLE_IN_TRANSACTION_TIMEOUT_MS` — still the local
  placeholder values, still explicitly documented as not production-
  reviewed.
- No remote `scan` command, and no change to `scan --target=dev|test`'s
  existing behavior.
- No approval-record concept: nothing stores or checks an *approved*
  `scopeFingerprint`/`artifactFingerprint` separately from the artifact
  itself. `checkRegistryCompatibility`/`checkSchemaCompatibility`/
  `checkTargetCompatibility`/`checkArtifactIntegrity` (built in Phase B1)
  remain unwired into any command.
- No persisted-artifact loading or runtime artifact parsing — `plan` only
  ever writes an artifact, never reads one back.
- No automated plan verdict, no risk score, no pass/fail logic —
  `requiresManualReview` is still a hardcoded `true`.
- No retries, no batching, no multi-target orchestration.
- Building this wiring is not, by itself, authorization to run it against
  a real target. That is a separate, explicit decision, and a separate
  security checkpoint, per OZI-79's two-stage execution control.
