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
  (`collectExplainPreflightFacts`, the canonical 16-statement
  `QUERY_REGISTRY`) components are wired together **unmodified** — this
  phase adds no new SQL, no new registry statements, no changes to
  `verifyReadOnlyRole`'s privilege checks, and no changes to the
  collector's canonicalization/fingerprinting logic. `buildExplainPreflightArtifact`
  (V1) itself is also unmodified, but round 6 added a parallel
  `buildExplainPreflightArtifactV2` that `cli.ts` actually calls now —
  see "What was built" and "Verified-identity fingerprint (V2, round 6)"
  below.
- `readonly-db-remote.ts` gained two functions as part of this phase's
  final implementation, `assertTargetIdentityMatchesExpectation` (see
  "Target-identity safeguard" below; renamed from
  `assertTargetDescriptorMatchesExpectation` in round 6 — the required
  value has been username-inclusive identity, not a safe descriptor,
  since round 5) and `computeVerifiedIdentityFingerprint` (round 6, a
  non-secret SHA-256 of that same identity, persisted on the artifact —
  see "Verified-identity fingerprint (V2)" below) — its stale doc
  comment (it previously said "nothing wired into a CLI command yet")
  was also updated to match. Everything else — TLS (`ssl: 'verify-full'`),
  least-privilege verification, `READ ONLY` + `REPEATABLE READ`
  transaction, and timeout constants — is untouched.
- `explain-preflight.ts`'s canonical 16-statement collector and
  fingerprinting logic are untouched. Round 6 added a parallel V2
  artifact contract (`ExplainPreflightArtifactV2`) alongside it — see
  below — without modifying V1.
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
  -> assertTargetIdentityMatchesExpectation(target) -- fail closed BEFORE descriptor/fingerprint resolution or any connection (see precondition 5 below)
  -> describeRemoteTarget(target)          -- safe host:port/database descriptor
  -> computeVerifiedIdentityFingerprint(target) -- round 6: non-secret SHA-256 of the verified identity
  -> withReadOnlyRemoteDb(target, async (tx) => {
       -- re-asserts assertTargetIdentityMatchesExpectation(target) internally too (defense-in-depth, see precondition 5)
       collectExplainPreflightFacts(tx)     -- Phase B1, unmodified
         -> buildExplainPreflightArtifactV2(facts, { target: { environment, descriptor, verifiedIdentityFingerprint }, commit })
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
4. **`plan`'s argument contract is strict, not permissive.** Unlike
   `scan`/`matrix` (which use the tolerant `readOption`/`args.includes()`
   style that silently ignores an unrecognized or duplicated flag), a
   dedicated `parsePlanArgs` requires exactly one `--target=staging|
   production`, allows only the `--execute-remote-explain` flag alongside
   it, and rejects everything else before `runRemoteExplainPlan` is ever
   called: a duplicated `--target` (including one `staging` value plus
   one `production` value), any unrecognized flag (`--dry-run`,
   `--force`, `--no-execute`, ...), and positional garbage after `plan`.
   A command whose only job is deciding whether to open a real remote
   connection does not get to guess what an unrecognized argument was
   supposed to mean.
5. **The resolved target's identity matches a separately, independently
   declared expectation** (`assertTargetIdentityMatchesExpectation`,
   renamed in round 6 from `assertTargetDescriptorMatchesExpectation`) --
   this is part of Phase B2's final implementation, not an optional
   add-on: `resolveRemoteUrl` only validates that the target's env var is
   *set* and looks like a postgres URL, which has no way to know whether
   `OZI79_STAGING_READONLY_DATABASE_URL` actually points at staging
   rather than production. A swapped or misconfigured credential would
   otherwise let `plan --target=staging` silently connect to production
   while the persisted artifact is stamped `environment: staging`. Closed
   by requiring a SECOND, independently-set env var per target
   (`OZI79_STAGING_EXPECTED_IDENTITY`/`OZI79_PRODUCTION_EXPECTED_IDENTITY`
   -- renamed in round 6 from `*_EXPECTED_DESCRIPTOR`, since the required
   value is username-inclusive identity, not `describeRemoteTarget`'s
   safe descriptor) declaring the exact expected
   `username@host:port/database` identity, and failing closed if it is
   unset or does not match. Baked into `withReadOnlyRemoteDb` itself (the
   same placement reasoning as `verifyReadOnlyRole`), not left to
   `cli.ts` to remember to call -- `cli.ts` also calls it explicitly
   beforehand so a mismatch fails before the "connecting to..." log line
   is even printed, but the authoritative enforcement point is inside the
   connection function, for any future caller. **The mismatch/missing-value
   error never interpolates the configured expected value, the resolved
   username, or the full URL** -- it names the target and the env var,
   and may include the already-sanitized resolved descriptor, but the raw
   `*_EXPECTED_IDENTITY` contents are never echoed, since an operator
   could have pasted a real credential into that variable by mistake.

   **Sourcing requirement:** each `*_EXPECTED_IDENTITY` value must come
   from authoritative environment/provider metadata (e.g. the hosting
   provider's own record of that environment's host/database/username, or
   a value an operator independently transcribes from it) -- **never**
   generated, derived, or copied from the corresponding
   `*_READONLY_DATABASE_URL` itself. Deriving one from the other would
   make the safeguard tautological: a swapped or mistyped credential
   would silently satisfy an expectation computed from that same mistake
   instead of catching it.

Only once all five hold does `withReadOnlyRemoteDb` get called — exactly
once, with `collectExplainPreflightFacts(tx)` invoked exactly once inside
it.

### Verified-identity fingerprint (V2, round 6)

`runRemoteExplainPlan` also computes
`computeVerifiedIdentityFingerprint(target)` -- a non-secret,
domain-separated SHA-256 of the exact same username-inclusive identity
`assertTargetIdentityMatchesExpectation` verifies (fixed prefix
`ozi79:remote-target-verified-identity:v1:`, so it can never be confused
with a hash of some unrelated identity-shaped string computed elsewhere).
It is persisted as `target.verifiedIdentityFingerprint` on the produced
`ExplainPreflightArtifactV2` and printed (hash-only, safe) in the
terminal summary. This closes a gap `describeRemoteTarget`'s descriptor
alone leaves open: two different database instances behind the same
provider connection pooler (e.g. Supabase, documented in this
repository's own root `.env.example`) can share an identical
`host:port/database`, so an artifact recording only the descriptor could
not later prove which of them was actually reviewed.

### Evidence and terminal output

The full `ExplainPreflightArtifactV2` (every raw `EXPLAIN` plan, every
relation stat, plus `target.verifiedIdentityFingerprint` -- round 6) is
persisted via the existing `writeEvidence(target, ...)` mechanism, under
the `staging`/`production` evidence directory
(`~/.local/share/nextjs-16-boilerplate/ozi-75/<target>/`) — never
committed to the repo. The filename is
`<target>-explain-preflight-<generatedAt>-<artifactFingerprint prefix>.json`:
timestamp- and fingerprint-based only, containing no hostname, database
name, URL, or credential.

Terminal output is a **safe, concise summary only** — target, safe target
descriptor, commit SHA, schema migration id/hash,
registry/scope/artifact/verified-identity fingerprints (round 6 added the
last one — safe, since a SHA-256 hash does not reveal the username it was
computed from), statement count, the two priority-manual-review statement
ids, `requiresManualReview`, and the evidence file path. It deliberately
never dumps the full artifact or any raw `EXPLAIN` plan to the terminal,
unlike `scan` (which does print its full local report — that report holds
only aggregate counts, never a raw plan). A remote artifact's raw plans
are safe to persist as evidence a reviewer opens deliberately, but not to
print into logs that may be captured far more casually than a file
someone has to go and read.

## Tests

This section describes the test file's original (build-time) shape and
scenario coverage; it has grown across review rounds since -- see each
round's section below for what each round added, and the "Validation"
section at the end of this document for current, exact per-file totals.

`cli.test.ts` (no DB, every remote/network/evidence effect
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
- a `writeEvidence` rejection propagates instead of being swallowed;
- the expected-identity safeguard being unset, or a resolved target
  mismatching it (the swapped-credential case), rejects without ever
  calling `withReadOnlyRemoteDb`;
- `plan`'s strict argument contract: a duplicated `--target` (same value
  twice, or one `staging` plus one `production`), any unrecognized flag
  (`--dry-run`, `--force`, `--no-execute`, `--allow-dirty`), and
  positional garbage after `plan` all reject before any git call,
  `describeRemoteTarget` call, or remote wiring;
- exact wiring, parameterized over both `staging` and `production`:
  exactly one `withReadOnlyRemoteDb` call with the correct target,
  exactly one `collectExplainPreflightFacts` call, the persisted
  artifact's `target`/`commit` fields bound to the real values, evidence
  written under the matching environment with a hostname-free filename,
  and terminal output that includes the safe summary fields but never the
  raw plan or the full artifact JSON;
- `scan --target=staging` and `scan --target=production` still fail with
  the pre-existing validation error, without reaching any remote wiring.

`readonly-db-remote.test.ts` gained tests for
`assertTargetIdentityMatchesExpectation` (renamed in round 6) and the
connection-level safeguard: unset/mismatched/matching/never-mixed-up
expectation env vars, a dedicated proof that `withReadOnlyRemoteDb`
refuses to open a connection (`postgres()` never called) when the
safeguard fails, and two tests proving a credential-bearing expected-
identity value (a full
`postgres://[username]:[REDACTED]@[host]/[database]`-shaped URL,
at both the unit level and through `withReadOnlyRemoteDb`) never reaches
the thrown error message -- not the full value, not the password, not
the username, individually. Round 6 added `computeVerifiedIdentityFingerprint`
coverage in the same file (deterministic, differs on a same-descriptor/
different-username pooler swap, differs staging vs. production, never
contains the raw identity, well-formed even for an unparseable URL).

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

## Review round 2 (Codex)

One finding: **redact the expected descriptor from mismatch errors
(P2, real gap).** `assertTargetDescriptorMatchesExpectation`'s mismatch
error interpolated the raw `*_EXPECTED_DESCRIPTOR` env var value
verbatim (`` `... declared in ${envVar} ("${expected}"). ...` ``). If an
operator accidentally pasted a connection URL or other credential-
bearing value into that variable instead of a plain descriptor, this
error -- printed to stderr by `cli.ts`'s top-level handler -- would leak
it into terminal/CI logs. This is exactly the "never echo an untrusted
env var value" contract `resolveRemoteUrl` already follows elsewhere in
this same file; the new function missed applying it.

Fixed by naming the env var and noting the mismatch without ever
including its value. Added a regression test (`readonly-db-remote.test.ts`)
using a secret-looking value in the expectation variable, asserting the
thrown message names the env var but never contains the value -- verified
via temporary revert to genuinely fail against the pre-fix code before
being restored. Grepped the rest of the file for the same interpolation
pattern (`${expected}`/`${raw}`) afterward; no other instance exists.

## Review round 3 (user-directed hardening pass)

Not a Codex finding this round -- a directed final invariant-oriented
pass before the next review, covering four areas:

1. **Strengthened the round-2 redaction regression tests** with the
   exact scenario named: `OZI79_STAGING_EXPECTED_DESCRIPTOR` set to a
   credential-shaped `postgres://[username]:[REDACTED]@[host]/[database]`
   URL, asserting the thrown message contains neither the full value nor
   the password nor the username individually, at both the
   `assertTargetDescriptorMatchesExpectation` unit level and through
   `withReadOnlyRemoteDb` (also proving `postgres()` is never called).
   Both re-verified via temporary revert.
2. **Hardened `plan`'s argument contract.** `scan`/`matrix` use a
   permissive `readOption`/`args.includes()` style that silently ignores
   an unrecognized or duplicated flag; `plan` now has its own strict
   `parsePlanArgs`, requiring exactly one `--target=staging|production`
   plus only the `--execute-remote-explain` flag, rejecting before any
   git call or remote wiring: a duplicated `--target` (same value twice,
   or one `staging` plus one `production`), any unrecognized flag
   (`--dry-run`, `--force`, `--no-execute`, and -- now explicitly
   rejected rather than merely ignored -- `--allow-dirty`), and
   positional garbage after `plan`. `scan`'s own contract is untouched.
   6 new tests, all verified via temporary revert of the relevant check.
3. **Made env-var-unset tests independent of the real shell
   environment.** Three tests (one in `readonly-db-remote.test.ts`'s
   unit-level check, one in its `withReadOnlyRemoteDb`-level check, one
   in `cli.test.ts`) asserted "unset" behavior by relying on the
   variable simply not being exported in whatever shell runs the suite,
   rather than explicitly stubbing it to `''`. Fixed by adding an
   explicit `vi.stubEnv(VAR, '')` to each.
4. **Reconciled documentation** that had drifted after round 1/2:
   this runbook's execution-boundary section no longer claims
   `readonly-db-remote.ts` "only changed a doc comment" (it also gained
   `assertTargetDescriptorMatchesExpectation`); the fail-closed
   precondition list now documents the target-identity safeguard and the
   strict argument contract as part of the final design, not an
   afterthought; both this runbook and `tenancy-inventory.env.example`
   now explicitly state that `*_EXPECTED_DESCRIPTOR` must be sourced from
   authoritative environment/provider metadata, never derived or copied
   from the corresponding `*_READONLY_DATABASE_URL`.

Added one more regression test this round for a case the review list
named but which had no dedicated test yet: a `writeEvidence` rejection
propagating instead of being silently swallowed.

Full systematic falsification pass performed across every negative case
named for this round (expected descriptor contains credentials, expected
descriptor unset, target mismatch, duplicate target, unknown flag, dirty
tree, unresolved commit, role verification failure, evidence write
failure) -- each already had, or received, a regression test verified by
temporary revert.

## Review round 4 (Codex)

Two findings, both fixed:

- **Sanitize remote database failures before logging (P2, real gap).**
  A raw Postgres/Drizzle failure (connection refused, TLS/authentication
  error, or a preflight query error) propagated unchanged from
  `withReadOnlyRemoteDb` up through `run()`'s top-level `catch`, which
  prints `error.message` to stderr. Infrastructure errors from those
  layers can contain a hostname, username, or other connection-string
  fragment, unlike this tool's own deliberately-sanitized errors.
  Fixed: the `withReadOnlyRemoteDb` call in `runRemoteExplainPlan` is now
  wrapped in a `try`/`catch` that re-throws `RemoteRoleNotReadOnlyError`
  as-is (already safe, deliberately-crafted) but translates everything
  else to a stable, safe message naming only the target and the
  already-sanitized `descriptor`, attaching the original error as
  `cause` (reachable for a caller that deliberately inspects it, never
  printed by the default top-level handler). Added a regression test
  using a realistic credential-shaped Postgres auth-failure message,
  asserting the username/hostname/full message never reach the thrown
  error while `cause` still holds the original -- verified via temporary
  revert. Also had to convert the existing "misconfigured role" test to
  construct a real `RemoteRoleNotReadOnlyError` (it previously used a
  generic `Error`, which the new sanitization would have incorrectly
  swallowed).
- **Update the preflight module's stale phase boundary (P2, doc drift).**
  `explain-preflight.ts`'s module doc comment, `ExplainPreflightEnvironment`'s
  doc comment, `checkTargetCompatibility`'s doc comment, and
  `checkArtifactIntegrity`'s doc comment all still framed remote wiring
  as "a future Phase B2 would..." -- exactly the phase this PR is. Fixed
  each to describe the current state accurately: `cli.ts`'s `plan`
  command is the real `RemoteTarget`/`describeRemoteTarget` wiring that
  now exists, while the four compatibility/integrity check functions
  remain genuinely unwired into any command (that really is still a
  later phase's work, so those specific claims were left correctly
  future-facing, just without the stale "Phase B2" label since Phase B2
  turned out to mean something narrower than originally drafted).

## Review round 5 (Codex)

Two findings. This round is the clearest evidence that round 1's original
fix was itself incomplete, not just adjacent -- see the honest note at
the end of this section.

- **Bind target identity to provider-specific destinations (P2, real
  gap in round 1's own fix).** `assertTargetDescriptorMatchesExpectation`
  compared `describeUrl()` output (host:port/database, username
  deliberately stripped for safe display). This repository's own
  `.env.example` documents Supabase's connection-pooler URL shape,
  `postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
  -- every project sharing a region's pooler has an IDENTICAL
  host:port/database; only the username distinguishes one project from
  another. A check built on `describeUrl`'s output alone would treat
  every project sharing that pooler as identical, silently accepting a
  staging/production credential swap for exactly this provider shape --
  reproduced and confirmed empirically (see below) before fixing.
  Fixed by adding `resolveVerificationIdentity`, which includes the
  username, used only for the internal comparison and never printed
  (the safe, printable `descriptor` is unchanged and still
  username-free). `*_EXPECTED_DESCRIPTOR`'s required format changed to
  `username@host:port/database` accordingly (documented in
  `tenancy-inventory.env.example`). Also simplified
  `assertTargetDescriptorMatchesExpectation`'s signature to resolve
  everything itself from `target` alone (no caller-supplied descriptor
  parameter), so `cli.ts` and `withReadOnlyRemoteDb` share one
  computation instead of each assembling and needing to keep in sync
  its own version.
- **Stop echoing rejected CLI arguments (P2, real gap).** `parsePlanArgs`
  interpolated the full rejected argument(s) verbatim into the thrown
  message for both a duplicated `--target` and any unrecognized
  argument -- an operator mistake such as
  `--database-url=postgres://user:password@host/db` would put that
  entire string into an `Error` the top-level handler prints to stderr.
  Fixed with `safeArgumentDescription`: a `--flag=value` argument is
  described by its flag name only (never what follows `=`); anything
  else (a bare flag, a positional token) is described only by its
  1-based position in the argument list. Also swept the rest of `cli.ts`
  and the new `readonly-db-remote.ts` code for the same interpolation
  pattern (`` `${...}` `` inside a thrown `Error` with anything other
  than a closed-domain value, a hash, a filesystem path under the
  evidence root, or an already-sanitized descriptor) -- no other
  instance found.

**On why this round happened**: round 1 already asked "does the closed
`RemoteTarget` domain actually bind to the real destination", and the
answer built then (`describeUrl`-based comparison) was incomplete for a
provider shape this exact repository already documents. This is exactly
the kind of gap that should have been caught by asking "what does a real
provider's URL actually look like" during round 1, not five rounds
later. Both round-5 fixes were verified two ways before restoring: the
automated regression tests (verified via temporary revert, as in every
prior round), and -- for the Supabase-pooler case specifically, since
the test file's stubbed values made the revert's failure mode partly
mask itself in one test run -- a standalone script directly reproducing
the exact swap scenario against the reverted code (confirmed the swap
was silently accepted) and then against the restored fix (confirmed it
was correctly rejected).

## Review round 6 (user-directed hardening pass)

Two findings, both implemented in the same pass per the user's explicit
instruction not to defer Finding #1 to a later phase: this is the first
phase that produces real remote `EXPLAIN` evidence, and that evidence
must already carry every identity component a later approval gate will
need, or a production artifact collected now could never be proven later
to belong to the same verified database identity without rerunning the
preflight.

- **Persist a non-secret verified-identity fingerprint on the artifact
  itself, not just check it at connection time (security-semantic gap,
  not a P2 style bug).** Round 5's `assertTargetDescriptorMatchesExpectation`
  (now `assertTargetIdentityMatchesExpectation`) closed the *connection-time*
  identity-binding gap, but nothing about the identity it verified was
  ever recorded on the produced artifact -- `target.descriptor` alone
  cannot distinguish two database instances sharing one connection-pooler
  host:port/database (the same Supabase example round 5 used). Fixed by
  adding `computeVerifiedIdentityFingerprint(target)` to
  `readonly-db-remote.ts`: a domain-separated SHA-256
  (`ozi79:remote-target-verified-identity:v1:<identity>`) of the exact
  same username-inclusive identity `assertTargetIdentityMatchesExpectation`
  already verifies -- non-secret (a hash cannot be reversed to the
  username it was computed from), safe to persist and print, unlike the
  raw identity it is computed from.

  Because this adds a required security-semantic field to a versioned
  artifact contract, introduced `ExplainPreflightArtifactV2`/`version: 2`
  in `explain-preflight.ts` rather than silently mutating V1's meaning --
  there are no real remote V1 artifacts or a persisted-artifact loader to
  migrate yet, so this is the correct boundary for the bump. V1
  (`ExplainPreflightArtifactV1`, `buildExplainPreflightArtifact`,
  `checkTargetCompatibility`, `checkArtifactIntegrity`) is completely
  unchanged. V2 adds, in parallel: `ExplainPreflightTargetMetadataV2`
  (V1's target metadata plus `verifiedIdentityFingerprint`),
  `computeScopeFingerprintV2`/`computeArtifactFingerprintV2` (identical
  canonicalization algorithm, over the V2 shape),
  `buildExplainPreflightArtifactV2`, `checkArtifactIntegrityV2`, and
  `checkTargetCompatibilityV2` -- the last of which fails closed not just
  on a mismatched `verifiedIdentityFingerprint` but also when it is
  missing or empty on either side, exactly like the existing
  environment/descriptor checks. `cli.ts`'s `plan` command now calls
  `computeVerifiedIdentityFingerprint`/`buildExplainPreflightArtifactV2`;
  the terminal summary gained one more safe (hash-only) line,
  `verifiedIdentityFingerprint`, alongside the existing fingerprint
  lines.

  Renamed the now-misleading operator contract before first real use:
  `OZI79_*_EXPECTED_DESCRIPTOR` → `OZI79_*_EXPECTED_IDENTITY` and
  `assertTargetDescriptorMatchesExpectation` →
  `assertTargetIdentityMatchesExpectation` (the required value was
  already username-inclusive identity since round 5, not a safe
  descriptor -- the name was wrong from round 5 onward). Updated every
  call site, `tenancy-inventory.env.example`, and this runbook.

- **Resolve Git metadata from the script's own repository, never
  `process.cwd()` (P2, real gap).** `resolveCommitSha`/
  `resolveCommitShaStrict`/`isWorkingTreeDirty` called `execFileSync('git',
  ...)` with no explicit `cwd`, so launching the script by path from a
  different working directory (`cd /elsewhere && tsx
  /path/to/this/repo/scripts/tenancy-inventory/cli.ts plan ...`) would
  silently report *that* directory's commit/dirty-state while still
  querying this repository's schema -- defeating the exact
  commit-to-evidence binding `resolveCommitShaStrict` exists to
  guarantee, and separately making the dirty-tree check observe the
  wrong repository's state entirely. Fixed by computing `REPO_ROOT` from
  `import.meta.url` (`path.resolve(SCRIPT_DIR, '..', '..')` --
  `scripts/tenancy-inventory/cli.ts` is always exactly two directories
  below the repository root) and passing it as `cwd` to all three call
  sites.

Both fixes were verified via temporary revert-and-confirm-failure before
being restored (per this session's standing practice), not trusted from
static inspection or a single test pass/fail alone:

- Reverted `checkTargetCompatibilityV2`'s `verifiedIdentityFingerprint`
  comparison and reran `explain-preflight.test.ts`: exactly the two
  tests built to prove the gap this closes (same-descriptor/
  different-identity, and stale-identity-artifact) failed; everything
  else still passed. Restored, reran clean (60/60).
- Reverted `REPO_ROOT` to `process.cwd()` and ran `cli.test.ts` launched
  from a directory outside this repository (via a direct `vitest`
  invocation with `--root` pointed at this repo but the OS-level process
  `cwd` elsewhere, since a normal same-process test run cannot otherwise
  exercise a real ambient-`cwd` difference): both new cwd-pinning
  regression tests failed with the expected mismatch. Restored, reran
  the same way: clean (28/28).

Also added focused adversarial coverage per the user's explicit matrix:
same host/db with a different username/project, missing/malformed
`verifiedIdentityFingerprint` (both empty-string and absent), an artifact
recorded under a previous/rotated identity, staging vs. production
identity, execution from an unrelated `cwd`, and the pinned-repo-root
`cwd` producing the correct clean/dirty result independent of whatever
the ambient launching process's own `cwd` git state looks like.

## Review round 7 (Codex) — documentation only

One finding, docs only, no code change: the "What was built" current-
state section above still named the removed V1 builder and
`*_EXPECTED_DESCRIPTOR` env vars after round 6's `c96daf6a` introduced
the V2 builder and the identity rename -- only the dated round-6 history
entry had been updated, not the current-state description an operator
would actually follow. Fixed in `31f505e0` (pipeline diagram, precondition
5, the new "Verified-identity fingerprint (V2, round 6)" subsection, the
evidence/terminal-output section, and the Tests section's stale
references). No code changed.

## Review round 8 (Codex)

Two findings.

- **Redact rejected options that omit an equals sign (P2, real gap).**
  `safeArgumentDescription`'s doc comment already claimed a bare
  `--flag` (no `=`) is described only by position -- but the code
  actually returned the whole raw token whenever it started with `--`
  and had no `=`. A credential pasted with a leading `--` and no `=` at
  all (e.g. a `--postgres://[username]:[REDACTED]@[host]/[database]`-shaped
  token) would reach the thrown error unredacted. Fixed with
  `SAFE_FLAG_NAME_PATTERN` (`/^--[A-Za-z0-9][A-Za-z0-9-]*$/`): the
  candidate flag-name portion (everything before `=`, or the whole token
  if there is none) is only ever echoed when it matches that pattern --
  letters/digits/hyphens only. This deliberately keeps genuinely bare
  flags like `--allow-dirty`/`--dry-run` nameable (useful for an
  operator) while refusing to name anything containing `:`, `/`, `@`,
  `.`, or other URL/connection-string separators, whether or not an `=`
  is present. Verified via revert: reverting to the pre-fix logic left
  exactly the new regression test failing (28/29 still passed, including
  every existing bare-flag-name test -- proving the fix does not
  regress those).
- **Include the identity assertion in the exact-order diagram (P2, doc
  accuracy).** The "What was built" pipeline diagram omitted
  `assertTargetIdentityMatchesExpectation(target)` entirely and placed
  descriptor/fingerprint resolution as if they ran first, when live
  `cli.ts` runs the identity assertion before both. Since this runbook
  is the security checkpoint reviewed before any real execution is
  authorized, an inaccurate enforcement-order diagram could mislead that
  review. Fixed by adding the assertion in its real position (before
  `describeRemoteTarget`/`computeVerifiedIdentityFingerprint`) and noting
  `withReadOnlyRemoteDb`'s own internal re-assertion (defense-in-depth).

## Review round 9 (Codex) — documentation only

One finding (P1), docs only, no code change: this runbook and `plan.md`
committed a complete, realistic-looking PostgreSQL credential shape
(`postgres://oops-user:VERY-SECRET-PASSWORD@production.example/db`) in
four places, describing test scenarios -- despite the repository's own
"do not commit secrets or credential-shaped values" invariant applying to
credential-*shaped* literals regardless of whether they are real, since a
realistic-looking one still creates secret-scanner noise and normalizes
the pattern in committed artifacts. (The equivalent literal string
genuinely does appear in `cli.test.ts`/`readonly-db-remote.test.ts` as a
deliberate, explicitly user-directed test fixture proving redaction --
that is unaffected by this finding, which is scoped to prose in these
two documentation files, not test code.)

Replaced every occurrence in `runbook.md`/`plan.md` with the neutral
placeholder shape `postgres://[username]:[REDACTED]@[host]/[database]`,
which still documents exactly the same redaction scenario without
committing anything credential-shaped.

## Validation

- typecheck: clean
- lint: clean
- unit (`scripts/tenancy-inventory` subset): 137/137 (29 in
  `cli.test.ts`, 19 in `readonly-db-remote.test.ts`, 89 across the other
  four files, including the new V2 coverage in `explain-preflight.test.ts`)
- unit (full repo, `pnpm test`): 279 files / 2390 tests, all pass
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
  `checkTargetCompatibility`/`checkArtifactIntegrity` (Phase B1) and their
  V2 counterparts `checkTargetCompatibilityV2`/`checkArtifactIntegrityV2`
  (round 6, added specifically so that machinery has the identity data it
  will need) remain unwired into any command. `verifiedIdentityFingerprint`
  is recorded on every V2 artifact now so a future approval gate has it
  available -- persisting the field is in scope for this phase; building
  the approval/persistence mechanism that reads it back is not.
- No persisted-artifact loading or runtime artifact parsing — `plan` only
  ever writes an artifact, never reads one back.
- No automated plan verdict, no risk score, no pass/fail logic —
  `requiresManualReview` is still a hardcoded `true`.
- No retries, no batching, no multi-target orchestration.
- Building this wiring is not, by itself, authorization to run it against
  a real target. That is a separate, explicit decision, and a separate
  security checkpoint, per OZI-79's two-stage execution control.
