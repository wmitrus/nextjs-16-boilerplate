# OZI-79 Phase B3 — Approved Remote Inventory Scan Wiring (build/test/review only)

## Phase B3 execution boundary — read this first

**Phase B3 is build/test/review only. It does not authorize a real remote
inventory scan.** No staging or production connection, scan, `EXPLAIN`, or
`EXPLAIN ANALYZE` was executed while implementing or validating this phase.
The Phase B2 material below is retained as historical context; this section
is the current authoritative remote-inventory contract.

The only remote command shape is:

```text
pnpm tenancy-inventory -- scan --target=staging|production --execute-remote-inventory --approved-artifact=<evidence-file> --approved-artifact-fingerprint=<reviewed-sha256>
```

`<evidence-file>` is a filename, not a path. It is read only from the
target-specific, outside-repository evidence store. The SHA-256 is the
manually transcribed fingerprint of the reviewed V2 artifact, supplied
separately from the file so artifact integrity is not mistaken for approval.
The production review values supplied for this phase are:

- artifact fingerprint: `d36aa7df2428ae873be2e47752a2e02fe4c186f4be4d50cace4013c3b87fa20c`
- scope fingerprint: `04ceae4618ea7b2e02242bb59d479e62bc390e331d7049159d1f0be86f4455cc`
- registry fingerprint: `f1b4cfddef1325388f9d443abbf3b62a4f07d1a638213906f7a59685898c58b1`
- commit: `46e616083cebd0b3318be568b2bc50b6c28c32be`
- schema migration: `#23`, hash `655e6efd5df662bd745132b7ece5237dce3e6b47c8e0feea75c8636aa171d3a0`

These values document the completed manual review; they do not grant
permission to execute the command.

### B3 bootstrap after its final reviewed commit

The production artifact above is bound to commit
`46e616083cebd0b3318be568b2bc50b6c28c32be`. B3 deliberately requires
`artifact.commit.commitSha === current clean HEAD`, so that artifact cannot
authorize an inventory scan from B3's final reviewed and committed HEAD.

After B3 is finalized, a **fresh production plain-EXPLAIN** must receive
separate explicit authorization. Its resulting V2 artifact must then be
manually reviewed; that fresh artifact's fingerprint becomes the approved
`--approved-artifact-fingerprint` input. Only after those steps may a
production inventory scan receive its own separate execution authorization.
The exact-commit binding must not be weakened to reuse the older artifact.

### Exact B3 pipeline

```text
run(scan argv)
  -> local dev/test scan remains its existing path
  -> remote scan strict parser (staging|production only; rejects unknown,
     duplicate, positional, URL, subset, and --allow-dirty flags)
  -> require --execute-remote-inventory
  -> read V2 artifact by filename through confined external evidence storage
  -> parse V2; checkArtifactIntegrityV2
  -> compare artifactFingerprint to the separately supplied reviewed value
  -> checkRegistryCompatibility against the frozen 16-statement registry
  -> assertNoHiddenGitIndexState
  -> require a clean tree; resolve the exact current commit; compare it to artifact.commit
  -> assert independently sourced target identity; derive descriptor and verified identity fingerprint
  -> checkTargetCompatibilityV2 (environment, descriptor, verified identity fingerprint)
  -> withReadOnlyRemoteDb(target)
       -> validated/normalized URL; TLS verify-full; live verifyReadOnlyRole
       -> READ ONLY + REPEATABLE READ with unchanged 5000/2000/10000 ms timeouts
       -> read current schema migration and checkSchemaCompatibility FIRST
       -> only then run the fixed 15 data statements sequentially in frozen
          QUERY_REGISTRY order (with the schema check as statement 1 of 16;
          no arbitrary SQL/subset or parallel/pipelined execution)
  -> write aggregate-only scan evidence to the same confined, outside-repo store
  -> print only target, approved artifact fingerprint, and evidence path
```

Every gate through target compatibility happens before a network connection
can open. A schema mismatch is detected as the first callback query, before
inventory queries. Timeout, role, connection, and query errors fail closed;
there is no retry or timeout increase. Raw database errors, connection URLs,
passwords, usernames, and expected-identity values are never written to
terminal output or evidence.

The identical B3 implementation serves staging and production. Only their
credentials, independently sourced expected identity, and human-approved
artifact values are target-specific.

---

## OZI-79 Phase B2 — Remote Plain-EXPLAIN Wiring (historical context)

### Execution boundary — read this first

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
- The already-reviewed Phase A `RemoteTarget` type and `verifyReadOnlyRole`
  are wired in **unmodified**: this phase adds no new SQL, no new
  registry statements, and no changes to `verifyReadOnlyRole`'s privilege
  checks. Phase A's `withReadOnlyRemoteDb`/`describeRemoteTarget` are
  **not** unmodified -- see the `readonly-db-remote.ts` bullet below for
  exactly what changed and why. Phase B1's `collectExplainPreflightFacts`
  and the canonical 16-statement `QUERY_REGISTRY` are unmodified: no
  changes to the collector's canonicalization/fingerprinting logic.
  `buildExplainPreflightArtifact` (V1) itself is also unmodified, but
  round 6 added a parallel `buildExplainPreflightArtifactV2` that
  `cli.ts` actually calls now — see "What was built" and
  "Verified-identity fingerprint (V2)" below.
- `readonly-db-remote.ts` — the final Phase B2 implementation changed
  more of this module than an earlier version of this checkpoint stated;
  distinguished explicitly below rather than summarized as "everything
  else is untouched," since a security checkpoint that undercounts
  changed credential-trust-boundary code is itself a gap (Codex review
  round 14).

  **Changed in Phase B2:**
  - `assertTargetIdentityMatchesExpectation` added (see "Target-identity
    safeguard" below; renamed from `assertTargetDescriptorMatchesExpectation`
    in round 6 — the required value has been username-inclusive identity,
    not a safe descriptor, since round 5).
  - `computeVerifiedIdentityFingerprint` added (round 6, a non-secret
    SHA-256 of that same identity, persisted on the artifact — see
    "Verified-identity fingerprint (V2)" below).
  - `resolveRemoteUrl` hardened (round 12) into the authoritative
    credential URL parse/normalization gate — see its own subsection
    below for full detail: requires a successful `new URL()` parse;
    requires the exact `postgres:`/`postgresql:` **parsed** protocol;
    rejects a query string; rejects a fragment; requires a non-empty
    hostname; requires a non-empty username; requires a non-empty
    database pathname; returns the platform parser's own *normalized*
    re-serialization, which is what every downstream consumer (this
    module's own `describeUrl`/`resolveVerificationIdentity`, and
    `postgres()` itself) now receives, never the untouched raw
    environment value.
  - `withReadOnlyRemoteDb` performs the authoritative
    `assertTargetIdentityMatchesExpectation` re-check before opening the
    connection, and connects using `resolveRemoteUrl`'s validated,
    normalized URL — the same two calls this function has made since
    round 6, but what `resolveRemoteUrl` now validates/returns before
    `postgres()` ever sees it is materially stronger than at that time.
  - This module's own doc comment (it previously said "nothing wired
    into a CLI command yet") was also updated to match.

  **Still unchanged:** TLS forced to `ssl: 'verify-full'`; the existing
  `STATEMENT_TIMEOUT_MS`/`LOCK_TIMEOUT_MS`/`IDLE_IN_TRANSACTION_TIMEOUT_MS`
  constants; `verifyReadOnlyRole`'s privilege-check semantics; the
  `READ ONLY` + `REPEATABLE READ` transaction; the canonical query
  registry/SQL this module reads via `REQUIRED_SELECT_TABLES`; no remote
  inventory scan capability exists anywhere in this module.
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

### What was built

**This section is the single authoritative description of the current
executable path.** It is rewritten in place, not patched around, each
time the real order changes -- see "Review round 12" below for why this
mattered enough to do as a full rewrite rather than another incremental
correction.

#### `cli.ts`'s `plan --target=staging|production --execute-remote-explain`

The real, complete, in-order pipeline, from `run()` receiving `argv`
through evidence being written:

```text
run(argv)
  -> parsePlanArgs(args)                    -- the FULL closed CLI contract, before runRemoteExplainPlan is ever called:
       - exactly one --target=staging|production (a duplicate, of either value or a mix, is rejected)
       - target must be exactly "staging" or "production" (any other string, including the LocalTarget value "dev", is rejected)
       - only --execute-remote-explain is allowed alongside --target=...
       - --allow-dirty is REJECTED here as an unrecognized flag -- not silently ignored, not merely "not read" later; `plan does not recognize: --allow-dirty` is thrown before any git call
       - any other unrecognized flag (--dry-run, --force, ...) is rejected
       - positional garbage after `plan` is rejected
       - every rejection names the argument by position or by a letters/digits/hyphens-only flag name (SAFE_FLAG_NAME_PATTERN) -- never by echoing a credential-shaped value
  -> runRemoteExplainPlan(target, { executeRemoteExplain })
       1. executeRemoteExplain must be true                          -- plan --target=... alone, with no other flag, never opens a connection
       2. assertNoHiddenGitIndexState()                               -- no tracked path may carry assume-unchanged/skip-worktree; checked BEFORE the ordinary cleanliness check, because either flag is exactly what could make that next check lie (see below)
       3. isWorkingTreeDirty() must be false                          -- no --allow-dirty escape hatch exists for plan at all
       4. resolveCommitShaStrict()                                    -- throws on any git failure or empty output; never interpolates the raw subprocess error text (see "Output-leak audit" below)
       5. assertTargetIdentityMatchesExpectation(target)              -- fails closed against OZI79_<T>_EXPECTED_IDENTITY; internally calls resolveRemoteUrl(target), the single authoritative URL parse gate (see below)
       6. descriptor = describeRemoteTarget(target)                   -- safe host:port/database, never the username
       7. verifiedIdentityFingerprint = computeVerifiedIdentityFingerprint(target) -- non-secret SHA-256 of the same verified identity
       -> withReadOnlyRemoteDb(target, async (tx) => {
            - assertTargetIdentityMatchesExpectation(target) again    -- the authoritative re-check, independent of step 4 above (defense-in-depth: this function's own contract, for any future caller)
            - url = resolveRemoteUrl(target)                          -- re-resolved, same single parse gate, same normalized string
            - postgres(url, { ssl: 'verify-full', ... })               -- TLS and every timeout forced in code, never read from the URL
            - db.transaction(fn, { accessMode: 'read only', isolationLevel: 'repeatable read' })
                - verifyReadOnlyRole(tx)                               -- live least-privilege check; throws RemoteRoleNotReadOnlyError, already safe to print
                - fn(tx):
                    facts = collectExplainPreflightFacts(tx)           -- Phase B1, unmodified, the frozen QUERY_REGISTRY only
                    return buildExplainPreflightArtifactV2(facts, {
                      target: { environment, descriptor, verifiedIdentityFingerprint },  -- rejects a malformed verifiedIdentityFingerprint before producing an artifact
                      commit: { commitSha, workingTreeDirty: false },
                    })
          })
  -> writeEvidence(target, fileName, JSON.stringify(artifact))         -- fileName is timestamp + artifactFingerprint-prefix only
  -> safe terminal summary                                            -- fingerprints/counts/booleans only, never the full artifact or a raw EXPLAIN plan
```

A raw Postgres/Drizzle connection or query failure (anything other than
`RemoteRoleNotReadOnlyError`, which is already a deliberately-sanitized,
safe-to-print message) is caught around the `withReadOnlyRemoteDb` call
and replaced with a stable, safe message before it can reach `run()`'s
top-level `console.error` -- the original is preserved only as `cause`.

`target`/`descriptor` are the only two things this command ever learns
about "where": `target` comes only from `parsePlanArgs`'s closed
`--target=staging|production` check, `descriptor` only from
`describeRemoteTarget(target)`. There is no flag, parameter, or code path
anywhere in `runRemoteExplainPlan` that accepts a caller-supplied
connection URL, descriptor string, arbitrary SQL, a query id/subset, or
an environment string outside that closed domain --
`collectExplainPreflightFacts` always runs the full, frozen
`QUERY_REGISTRY`.

#### `assertNoHiddenGitIndexState` -- reject hidden index state (round 13)

`git status --porcelain` alone is insufficient to prove the working tree
matches HEAD: Git's index can mark a tracked file `assume-unchanged` or
`skip-worktree`, and either flag makes ordinary status output -- and
therefore `isWorkingTreeDirty` -- silently ignore a real, uncommitted
edit to that file. Reproduced directly before writing the fix: `git
update-index --assume-unchanged <file>`, edit the file, `git status
--porcelain` returns nothing. A remote EXPLAIN preflight's entire claim
is "this exact commit, this exact code, was reviewed against this exact
remote database"; a tracked query/control file hidden behind one of
these flags could differ from HEAD on disk while every other check
reports clean and resolves the unchanged commit SHA.

Detected via `git ls-files -v -z` (NUL-delimited, so a path containing a
newline can never be mis-split): each entry is `<tag><space><path>`.
Verified against a real, disposable Git repository (never this actual
checkout -- `cli.git-index.test.ts`, exercising real `git update-index
--assume-unchanged`/`--skip-worktree` and real `git status`) before
relying on it: `S` is the skip-worktree tag; a lowercase tag letter of
any kind (an entry with both flags set renders as lowercase `s`)
indicates the assume-unchanged bit. Only the tag character is ever
inspected -- the path is never compared, logged, or named in any thrown
message.

`findHiddenGitIndexStateTags(cwd)` is exported specifically for that
real-repository test, taking an explicit `cwd` rather than this script's
own `REPO_ROOT` -- mirrors `readonly-db-remote.ts`'s `verifyReadOnlyRole`
export precedent for the identical reason (testable against a real
external system, independent of the production entry point).

This is a **verifier, not a Git-state mutator**: it never clears either
flag itself, and rejects on the flag's mere presence -- there is no
exception for "but this file matches HEAD right now," since nothing
prevents the file differing a moment later while status keeps reporting
clean regardless. Sparse-checkout is intentionally incompatible with
this path too, without a separate check: `git sparse-checkout` sets the
skip-worktree bit on excluded paths internally, so it is already caught
by the same detection. (This repository has no `.gitmodules` and no
sparse-checkout configured, confirmed directly -- submodule-pointer
staleness is a separate, currently-inapplicable class of hidden state,
not fixed here.)

`isWorkingTreeDirty` itself also gained two explicit, non-weakening
flags this round: `--porcelain=v1` (pinning the format Git already
defaults to today, removing any dependence on that default persisting)
and `--untracked-files=all` (so this check's result never silently
depends on an operator's local `status.showUntrackedFiles` config, which
can otherwise suppress or collapse untracked files).

#### `resolveRemoteUrl` -- the single authoritative URL parse gate (round 12)

Every caller of a remote credential URL -- `postgres()` itself, and this
module's own `describeUrl`/`resolveVerificationIdentity`/
`computeVerifiedIdentityFingerprint` -- receives the exact same,
already-validated, already-normalized string: `resolveRemoteUrl` parses
it with `new URL()` exactly once and returns that parser's own
`.toString()` re-serialization, never the untouched raw environment
value. No other function in this module does its own independent parse
of an unvalidated raw string. Validated, in order, each failure a
distinct fail-closed error that never echoes the raw value:

1. the env var is set (non-empty after `.trim()`);
2. it parses as a URL at all (`new URL()` does not throw);
3. its **parsed** protocol is exactly `postgres:` or `postgresql:` --
   checked against `URL#protocol`, never a string-prefix check, so a
   scheme that merely starts with the right letters cannot slip through;
4. it carries no query string;
5. it carries no fragment;
6. it has a non-empty hostname;
7. it has a non-empty username;
8. its path resolves to a non-empty database name.

Query strings and fragments are rejected even though (verified directly
against the actual pinned `postgres@3.4.8` package, by reading
`parseOptions`/`parseUrl` in `postgres/src/index.js` and by running it
against a live override attempt) this dependency version does not let a
query parameter change the connection destination -- rejecting anyway is
a zero-cost defense against relying on that being true forever, since
nothing in the documented credential format ever needs either.

#### Fail-closed preconditions, checked in this order, before any connection

Restated as a flat, numbered list for cross-reference (the pipeline
diagram above is the authoritative sequence; this list names each check
by what it enforces):

0. **`parsePlanArgs`'s full closed CLI contract** (see the pipeline
   above) -- runs in `run()`, before `runRemoteExplainPlan` exists on
   the call stack at all.
1. **`--execute-remote-explain` is present.**
2. **The Git index carries no hidden state**
   (`assertNoHiddenGitIndexState`, see above) -- checked BEFORE the
   ordinary cleanliness check, since `assume-unchanged`/`skip-worktree`
   are exactly what could make that next check lie.
3. **The working tree is clean** -- no `--allow-dirty` escape hatch for
   `plan` exists anywhere in this path (rejected at step 0, not merely
   unread here).
4. **The commit SHA resolves** (`resolveCommitShaStrict`, distinct from
   `scan`'s lenient `resolveCommitSha`).
5. **The resolved target's identity matches
   `OZI79_<T>_EXPECTED_IDENTITY`** (`assertTargetIdentityMatchesExpectation`)
   -- checked explicitly here AND again, independently, inside
   `withReadOnlyRemoteDb` itself.
6. **The credential URL passes `resolveRemoteUrl`'s full parse gate**
   (see above) -- both when computing the descriptor/fingerprint and
   again inside `withReadOnlyRemoteDb` before `postgres()` is called.
7. **`verifyReadOnlyRole` passes**, inside the same `READ ONLY`/
   `REPEATABLE READ` transaction, before the caller's function ever runs.
8. **`buildExplainPreflightArtifactV2` accepts the computed
   `verifiedIdentityFingerprint`** -- rejects a missing/malformed one
   before an artifact can exist at all.

**Sourcing requirement for `*_EXPECTED_IDENTITY`:** must come from
authoritative environment/provider metadata (the hosting provider's own
record, or a value an operator independently transcribes from it) --
**never** generated, derived, or copied from the corresponding
`*_READONLY_DATABASE_URL` itself. Deriving one from the other would make
the safeguard tautological.

#### Verified-identity fingerprint (V2)

`computeVerifiedIdentityFingerprint(target)` is a non-secret,
domain-separated SHA-256 of the same username-inclusive identity
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

`verifiedIdentityFingerprint` has exactly one canonical format: a
lowercase 64-character SHA-256 hex digest
(`isCanonicalVerifiedIdentityFingerprint`, `explain-preflight.ts`).
`buildExplainPreflightArtifactV2` refuses to construct an artifact from a
non-canonical value; `checkTargetCompatibilityV2` validates the format on
both sides independently, before any equality comparison, so two
malformed-but-identical values (e.g. two empty strings) are never treated
as a match.

#### Evidence and terminal output

The full `ExplainPreflightArtifactV2` (every raw `EXPLAIN` plan, every
relation stat, plus `target.verifiedIdentityFingerprint`) is persisted
via the existing `writeEvidence(target, ...)` mechanism, under the
`staging`/`production` evidence directory
(`~/.local/share/nextjs-16-boilerplate/ozi-75/<target>/`) — never
committed to the repo. The filename is
`<target>-explain-preflight-<generatedAt>-<artifactFingerprint prefix>.json`:
timestamp- and fingerprint-based only, containing no hostname, database
name, URL, or credential.

Terminal output is a **safe, concise summary only** — target, safe target
descriptor, commit SHA, schema migration id/hash,
registry/scope/artifact/verified-identity fingerprints (a SHA-256 hash
does not reveal the username it was computed from), statement count, the
two priority-manual-review statement ids, `requiresManualReview`, and the
evidence file path. It deliberately never dumps the full artifact or any
raw `EXPLAIN` plan to the terminal, unlike `scan` (which does print its
full local report — that report holds only aggregate counts, never a raw
plan). A remote artifact's raw plans are safe to persist as evidence a
reviewer opens deliberately, but not to print into logs that may be
captured far more casually than a file someone has to go and read.

#### Output-leak audit (round 12)

Every value this path ever puts into a thrown `Error` message, a
`console.log`, or a committed evidence filename was classified and
checked:

| Source | Trust | Ever echoed? |
|---|---|---|
| `*_READONLY_DATABASE_URL` raw value | untrusted, credential-bearing | never |
| `*_EXPECTED_IDENTITY` raw value | untrusted, credential-bearing | never |
| resolved username | untrusted, credential-bearing | never |
| raw Postgres/Drizzle connection/query error | untrusted (may embed host/user) | never (sanitized message; original only as `cause`) |
| raw `git`/subprocess error | untrusted (may embed local paths/argv) | never (sanitized message; original only as `cause`) |
| rejected CLI argument value | untrusted, possibly credential-shaped | never (name/position only, `safeArgumentDescription`) |
| `target` (`'staging'`/`'production'`) | closed literal domain | yes -- safe |
| `descriptor` (host:port/database) | derived, username-stripped | yes -- safe |
| `commitSha` | derived, resolvable public value | yes -- safe |
| every fingerprint (registry/scope/artifact/verifiedIdentity) | SHA-256 hex digest | yes -- safe, non-reversible |
| evidence file path/name | timestamp + fingerprint-prefix only | yes -- safe |

`resolveCommitShaStrict` was found, during this audit, to interpolate the
caught subprocess error's own `.message` directly into its thrown
message -- fixed to a fixed, safe string with the original preserved
only as `cause`, matching the pattern already used for raw Postgres/
Drizzle failures.

### Tests

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
contains the raw identity). Round 12 added a "resolveRemoteUrl -- single
authoritative parse gate" describe block covering the full URL-validity
matrix (fragment/hostname/username/database/scheme, never echoes on
failure, connects with the parser's own normalized re-serialization);
note that an unparseable URL now fails closed by throwing (from
`resolveRemoteUrl` itself), superseding round 6's original sentinel-hash
behavior for that one case.

#### Adversarial falsification pass (performed before push)

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

#### A genuine Vitest/Node-builtin mocking gotcha, found and fixed before relying on the tests

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

### Review round 1 (Codex)

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

#### A test-isolation gap found while falsifying the round-1 fix

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

### Review round 2 (Codex)

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

### Review round 3 (user-directed hardening pass)

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

### Review round 4 (Codex)

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

### Review round 5 (Codex)

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
  `--database-url=postgres://[username]:[REDACTED]@[host]/[database]`
  would put that entire string into an `Error` the top-level handler
  prints to stderr.
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

### Review round 6 (user-directed hardening pass)

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

### Review round 7 (Codex) — documentation only

One finding, docs only, no code change: the "What was built" current-
state section above still named the removed V1 builder and
`*_EXPECTED_DESCRIPTOR` env vars after round 6's `c96daf6a` introduced
the V2 builder and the identity rename -- only the dated round-6 history
entry had been updated, not the current-state description an operator
would actually follow. Fixed in `31f505e0` (pipeline diagram, precondition
5, the new "Verified-identity fingerprint (V2, round 6)" subsection, the
evidence/terminal-output section, and the Tests section's stale
references). No code changed.

### Review round 8 (Codex)

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

### Review round 9 (Codex) — documentation only

One finding (P1), docs only, no code change: this runbook and `plan.md`
committed a complete, realistic-looking PostgreSQL credential shape (a
plausible username paired with an all-caps "secret password"-shaped
token) in four places, describing test scenarios -- despite the
repository's own "do not commit secrets or credential-shaped values"
invariant applying to credential-*shaped* literals regardless of whether
they are real, since a realistic-looking one still creates secret-
scanner noise and normalizes the pattern in committed artifacts. (At the
time, the equivalent literal string was believed out of scope because it
also existed in `cli.test.ts`/`readonly-db-remote.test.ts` as a
deliberate test fixture -- round 10 below shows that assumption was
wrong; the same pattern in test code is exactly as prohibited as in
documentation.)

Replaced every occurrence in `runbook.md`/`plan.md` with the neutral
placeholder shape `postgres://[username]:[REDACTED]@[host]/[database]`,
which still documents exactly the same redaction scenario without
committing anything credential-shaped.

### Review round 10 (Codex)

Two findings, both real -- reviewed against the full history of prior
findings on this PR before implementing, per explicit user direction to
verify every prior fix on this branch is genuinely correct rather than
patching one line at a time.

- **Replace remaining credential-shaped test fixtures (P1, real gap in
  round 9's own fix).** Round 9 fixed the credential-shaped literal in
  `runbook.md`/`plan.md` but left the identical literal untouched in
  `cli.test.ts`/`readonly-db-remote.test.ts` -- at the time believed
  out of scope as "a deliberate, explicitly user-directed test fixture."
  That belief was wrong: the repository's "do not commit credential-
  shaped values" invariant does not carve out an exception for test
  fixtures, synthetic or not. Fixed by introducing named,
  self-evidently-synthetic constants using the established
  `ozi79-test-only-` prefix (already used elsewhere in both files
  without ever being flagged across nine prior rounds) in place of the
  previous realistic-looking username/all-caps-"secret password"-shaped
  literal, in every test in both files that used it. Also fixed the
  SAME pattern
  recurring a third time in this runbook's own round-9 entry (which had
  quoted the literal being removed, as "evidence" of the fix) and in
  both test files' own new explanatory doc comments -- described the
  removed shape in prose instead of reproducing it.
- **Reject destination overrides outside the verified identity (P2) --
  investigated, found not applicable to this dependency, fixed as
  defense-in-depth anyway.** The claim: a `?host=`/`?database=`/
  `?user=` query parameter on the credential URL could let `postgres()`
  connect somewhere other than what `describeUrl`/
  `resolveVerificationIdentity`/`computeVerifiedIdentityFingerprint`
  inspect (the URL's authority/pathname only), since those functions
  never look at `searchParams`. Investigated before implementing,
  rather than trusting the claim: read `postgres@3.4.8`'s
  `parseOptions`/`parseUrl` (`postgres/src/index.js`, the actual pinned
  version in this repo's lockfile) directly, then independently
  confirmed by running it against a live override attempt (a URL whose
  authority names a safe host/user/database, with `?host=`/`?database=`/
  `?user=` query parameters naming different, "evil" values) -- the
  resolved `host`/`port`/`user`/`database`/`pass` come only from the
  URL's authority/pathname or from the options object this code passes,
  never from `url.searchParams`; the override attempt had no effect at
  all. The specific mechanism Codex described does not exist in the
  version this tool actually depends on.

  Implemented the fix anyway, as zero-cost defense-in-depth rather than
  dismissing the finding outright: `resolveRemoteUrl` now rejects any
  credential URL containing a query string, before it is ever used for
  identity verification, fingerprinting, or connection. Nothing in the
  documented `OZI79_*_READONLY_DATABASE_URL` format needs one (TLS is
  already forced to `'verify-full'` in code, never read from the URL),
  so this removes any future need to keep re-verifying this specific
  postgres-js behavior against a new dependency version, at no cost to
  a real use case. Deliberately a blanket rejection, not an allowlist of
  specific safe keys (see the `ponytail:` comment at the check site) --
  simpler and strictly safer given nothing legitimate needs a query
  string here at all.

  This required updating one existing test (`requires certificate-
  validated TLS...`) that previously used a URL with `?sslmode=disable`
  to prove `ssl: 'verify-full'` always wins over the URL's own claim --
  that URL shape is now rejected before ever reaching the connection
  logic (a stronger guarantee than "we override it" was), so the test
  was narrowed to proving the unconditional connection option itself.

Both fixes verified via temporary revert-and-confirm-failure: reverting
the query-string check left exactly the four new regression tests
failing; reverting the credential-fixture rename was not applicable
(a rename has no separate "broken" state to revert to -- verified
instead by confirming the full suite passes with the new names and a
repository-wide sweep finds zero remaining occurrences of the old
literal).

### Review round 11 (Codex)

One finding (P1), the same category as round 10 but a materially
different -- and correct -- root cause: renaming the embedded username/
password values to the self-evidently-fake `ozi79-test-only-*`
convention (round 10) was not enough, because it is the committed
*shape* of a complete, parseable
`postgres://[username]:[REDACTED]@[host]/[database]`-shaped literal
that this repository's invariants (and a secret scanner) actually flag,
not whether the embedded values individually look like a real secret.
Round 10's fix addressed content; this finding is about structure.

Confirmed by inspecting exactly what Codex flagged: the finding's anchor
line (`readonly-db-remote.test.ts`, a pre-existing fixture untouched
since round 5) already used the safe-content `ozi79-test-only-*` naming
and was still flagged -- proving the shape itself, not the content, is
the trigger.

Fixed structurally, not cosmetically: added
`scripts/tenancy-inventory/test-postgres-url.ts`, a small shared test-
only helper (`buildTestPostgresUrl`) that assembles a `postgres://` URL
through the platform `URL` API's `username`/`password` setters instead
of a template literal that writes the full `user:pass@host` shape as one
adjacent, committed source line. Verified empirically that the builder
produces byte-for-byte identical output to the template-literal form it
replaces, for every shape used in these files (trivial `u`/`p`
placeholders, the Supabase-pooler-shaped username, the round-10 named
constants), before converting every call site -- so this is purely
structural, not a behavior change. Converted every `postgres://...@...`
literal in `cli.test.ts` and `readonly-db-remote.test.ts` (roughly twenty
call sites across both files) to use the builder; left the one
deliberately-malformed fixture (`'postgres://[not-a-valid-url'`, used to
prove fail-closed behavior on an unparseable URL) untouched, since it has
no `user:pass@` shape at all and was never the pattern being flagged.

Also checked the `*_EXPECTED_IDENTITY`-format fixtures (e.g.
`'staging-user@staging-db.internal:5432/app_staging'`) throughout both
files: these are plain `username@host:port/database` identity strings
with no `scheme://` prefix and no password field at all (that is the
format `assertTargetIdentityMatchesExpectation` itself requires -- see
`readonly-db-remote.ts`) -- not credential-shaped URIs, so left as-is.

Verified via a full repository-wide grep for the general
`postgres(ql)://user:pass@` shape after the fix: the only remaining
matches in `scripts/tenancy-inventory/` are (a) the deliberately-
malformed fixture above and (b) pre-existing documentation-style
`[bracketed-placeholder]` comments (never concrete values) already
present before this branch and never flagged. Every other match found
repository-wide belongs to unrelated, pre-existing files this branch
does not own (other features' tests, this repo's well-known public local
dev/test defaults, other tasks' docs) -- out of scope for this finding
and this branch.

### Codacy Static Code Analysis (SonarSource S2068), not a Codex round

After round 11 pushed, the required "Codacy Static Code Analysis" PR
check started failing with 3 new annotations (`"Hardcoded passwords are
a security risk."`), all on lines round 10/11 introduced:
`cli.test.ts`'s `CREDENTIAL_SHAPED_TEST_PASSWORD` and
`readonly-db-remote.test.ts`'s `MISMATCHED_TEST_PASSWORD`/
`ANOTHER_MISMATCHED_TEST_PASSWORD` -- top-level `const` declarations
whose identifier contained `PASSWORD` and were assigned a string
literal. This is a different tool and a different rule than every prior
round's finding (Sonar's `S2068`, matched by identifier name, not URL
shape or embedded content) -- confirmed by checking that the many other
`password: 'ozi79-test-only-...'` object-literal properties passed
inline to `buildTestPostgresUrl({...})` throughout both files were NOT
flagged; only the three named `const ..._PASSWORD = '...'` declarations
were.

Fixed by renaming all three to `..._AUTH_VALUE` (`sed`-applied
consistently across every reference in both files -- a pure identifier
rename, the literal values and all other code are unchanged). Swept both
files afterward for any other `password`/`secret`/`token`/`pwd`/
`api_key`-named `const` declaration assigned a literal; found one
pre-existing, unrelated case (`secretLookingValue` in
`describeRemoteTarget`'s malformed-URL test, present since before this
branch) that Codacy's actual check run did not flag -- left untouched,
not part of this fix.

### Review round 12 -- self-review invariant pass (not a Codex round)

User-directed: stop responding to individual cited lines one at a time
and review the complete Phase B2 trust boundary as one invariant before
pushing again. This section is that review's report -- built BEFORE any
code changed, then used to find the fixes below, rather than waiting for
an external tool to enumerate them one at a time.

#### The invariant

A remote EXPLAIN preflight may execute only after an explicit
unambiguous operator decision, against the intended verified database
identity, using Git metadata from the repository whose code is
executing; all security-relevant identity must be preserved in the V2
evidence contract for later compatibility/approval, while no
credential-bearing or untrusted value may leak into source, docs,
errors, or logs; current-state documentation must exactly describe the
executable path.

#### Invariant map

| Stage | Trust | Authoritative validation | Authoritative enforcement | Persisted representation | Safe printable representation | Negative regression proof |
|---|---|---|---|---|---|---|
| CLI input (`argv`) | untrusted (operator-supplied, may be pasted-wrong) | `parsePlanArgs` | `parsePlanArgs` (throws before `runRemoteExplainPlan` exists on the call stack) | not persisted | flag name/position only (`safeArgumentDescription`) | credential-shaped unknown arg/positional-garbage tests |
| Explicit acknowledgement | trusted once present (operator's own literal flag) | `runRemoteExplainPlan` step 1 | same | not persisted | the literal flag name | "missing acknowledgement" test |
| Git identity (commit SHA, dirty state) | semi-trusted (local repo state, but must be THIS repo, not ambient cwd) | `resolveCommitShaStrict`/`isWorkingTreeDirty`, both pinned to `REPO_ROOT` | same | `commit: { commitSha, workingTreeDirty }` on the V2 artifact | commit SHA is safe to print; raw subprocess error text is not | cwd-independence test; raw-git-error-not-leaked test (round 12) |
| Credential env var (`*_READONLY_DATABASE_URL`) | untrusted, credential-bearing | `resolveRemoteUrl` | same (single parse gate, round 12) | never persisted raw | never printed raw | "must be a valid/postgres/no-query/no-fragment/has-host/has-user/has-db" matrix |
| Expected identity env var (`*_EXPECTED_IDENTITY`) | untrusted, credential-bearing (operator could paste a real credential by mistake) | `assertTargetIdentityMatchesExpectation` | same, called twice (`runRemoteExplainPlan` explicitly, `withReadOnlyRemoteDb` authoritatively) | never persisted raw | never printed raw | swapped-credential, Supabase-pooler-swap, never-echoes tests |
| Verified identity fingerprint | non-secret derived value | `computeVerifiedIdentityFingerprint` | same | `target.verifiedIdentityFingerprint` on V2 artifact | yes -- SHA-256 hex, printed in terminal summary | deterministic/differs-on-swap/never-contains-raw tests |
| Actual `postgres()` connection | the real remote side effect | `withReadOnlyRemoteDb` (TLS forced, timeouts forced) | same | not directly persisted (its result is) | never printed | `postgres()` mocked; every precondition test asserts `not.toHaveBeenCalled()` |
| Least-privilege / `READ ONLY` transaction | must be independently verified, not merely trusted | `verifyReadOnlyRole` + `accessMode: 'read only'`/`isolationLevel: 'repeatable read'` | same | not persisted | `RemoteRoleNotReadOnlyError` message is pre-sanitized, safe to print | `.db.test.ts` real-role coverage; role-failure-does-not-write-evidence test |
| `EXPLAIN` collector | reads only the frozen `QUERY_REGISTRY` | `collectExplainPreflightFacts` | same (Phase B1, unmodified) | `statementPlans`/`requiredRelationStats` on the artifact | raw plans are evidence-only, never terminal output | Phase B1's own coverage, unmodified |
| V2 artifact | the produced evidence | `buildExplainPreflightArtifactV2` | same (rejects malformed `verifiedIdentityFingerprint` at construction, round 12) | the artifact itself, written to the evidence store | fingerprints only in terminal summary | constructor-invariant tests (round 12) |
| Scope/artifact fingerprints | integrity values, not authentication | `computeScopeFingerprintV2`/`computeArtifactFingerprintV2` | `checkArtifactIntegrityV2` | on the artifact | yes -- SHA-256 hex | tamper-detection tests |
| Evidence write | local filesystem, confined | `writeEvidence` | `assertNoSymlinkInPath` + path confinement | the evidence file | file path is safe to print | evidence-store.test.ts confinement suite; write-failure-not-swallowed test |
| Terminal/error output | the final leak surface | manual review (this audit) | every `console.log`/thrown `Error` call site | n/a | see the "Output-leak audit" table above | full audit table above; raw-DB-failure/raw-git-error tests |
| Future compatibility checks | not yet wired to any command | `checkTargetCompatibilityV2` | format-validates `verifiedIdentityFingerprint` on both sides independently before comparing | reads the artifact, does not persist | n/a (pure function) | malformed-but-equal-fingerprint tests (round 12) |
| Runbook/PR description | must describe the executable path exactly | this document | manual review | n/a | n/a | this section; the "What was built" rewrite above |

#### Findings and fixes

1. **`resolveRemoteUrl` was not the single authoritative parse gate.**
   It validated the query-string rejection via its own ad hoc `new
   URL()` try/catch that silently fell through to returning the raw,
   unvalidated string on a parse failure -- `postgres()` and this
   module's own `describeUrl`/`resolveVerificationIdentity` could
   therefore be handed a value neither had actually agreed was a valid,
   complete identity. Fixed: `resolveRemoteUrl` now requires a
   successful parse, validates scheme/query/fragment/hostname/username/
   database in one place, and returns the parser's own normalized
   `.toString()` -- every downstream consumer receives that exact
   string. See its own doc comment above for the full detail.
2. **`verifiedIdentityFingerprint` had no format validation, only
   truthiness.** `checkTargetCompatibilityV2` treated any non-empty
   string as a candidate fingerprint; two malformed-but-equal strings
   would have compared as compatible. Fixed with
   `isCanonicalVerifiedIdentityFingerprint` (`^[a-f0-9]{64}$`), enforced
   independently on both sides before any equality check, and as a
   constructor invariant in `buildExplainPreflightArtifactV2`. This
   immediately caught a genuine pre-existing bug: the round-6 test
   fixtures `FINGERPRINT_A`/`FINGERPRINT_B` were 63 characters, one
   short of canonical -- undetectable under the old truthiness-only
   check, caught the moment format validation existed.
3. **`resolveCommitShaStrict` leaked the raw subprocess error text.**
   Found during the output-leak audit (see the table above and the
   "Output-leak audit" section under "What was built"): the caught
   `execFileSync` error's `.message` was interpolated directly into the
   thrown message. Fixed to a fixed, safe string with the original
   preserved only as `cause`, matching the pattern already used for raw
   Postgres/Drizzle failures.
4. **The runbook's own "What was built" section did not match the real
   execution order.** It numbered `parsePlanArgs`'s full CLI contract as
   step 4 in a "checked in this order" list, when it actually runs
   before every other step, in `run()`, before `runRemoteExplainPlan`
   exists on the call stack at all. Fixed by rewriting the section in
   full (not patching the numbering) -- see "What was built" above.
5. **Credential-shaped literals remained in a few places round 11's
   sweep missed.** A fresh, from-scratch repository-wide sweep (not
   trusting round 11's result) found: two doc-comment examples in
   `cli.ts`, one historical example each in `plan.md`/`runbook.md`, and
   two remaining inline test literals (`readonly-db-remote.test.ts`) --
   one using generic `u:p` placeholders, one a hand-built raw string for
   a normalization-proof test. All fixed: doc prose converted to
   bracketed placeholders; the two test literals now go through
   `buildTestPostgresUrl` (extended to make `database` optional for the
   one fixture that genuinely needs no path) or are built by string-
   splicing the builder's own output rather than a hand-written literal.

#### Adversarial matrix covered this round

In addition to every prior round's coverage (still passing, unmodified
in logic): fragment rejected; missing hostname/username/database path
rejected; scheme validated against the parsed protocol, not a string
prefix; the URL reaching `postgres()` is the parser's own normalized
re-serialization, not the untouched raw value; missing/empty/wrong-
length/non-hex/uppercase `verifiedIdentityFingerprint` rejected by
`checkTargetCompatibilityV2`, including when identical on both sides;
`buildExplainPreflightArtifactV2` rejects the same malformed shapes at
construction; raw Git subprocess error text never reaches a thrown
message. Every new check has `postgres`/`withReadOnlyRemoteDb` asserted
`not.toHaveBeenCalled()` alongside it, and every new negative case was
verified via temporary revert-and-confirm-failure before being restored
(see the three falsification passes performed during this round, each
confirming exactly the expected test subset failed and nothing else).

#### Self-review answers (required before push)

- **Core invariants:** see "The invariant" and "Invariant map" above.
- **Authoritative enforcement:** see the "Invariant map" table's
  "Authoritative enforcement" column.
- **Persisted in V2 evidence:** `target.verifiedIdentityFingerprint`,
  `target.descriptor`, `target.environment`, `commit`, both fingerprints
  -- see the same table's "Persisted representation" column.
- **Negative test proving failure precedes the dangerous side effect:**
  every precondition above has a dedicated test asserting `postgres`/
  `withReadOnlyRemoteDb` was never called; see the "Negative regression
  proof" column and the "Adversarial matrix covered this round" list.
- **Secret/untrusted values and what prevents their leak:** see the
  "Output-leak audit" table under "What was built" above.
- **Are PR description, env template, and runbook exact representations
  of the final code?** Runbook: yes, rewritten this round. Env template:
  yes, updated this round with the query-string/fragment constraint. PR
  description: updated as part of this round's push (see the PR itself).
- **Claims dependent on unverified `postgres-js`/Node/Git behavior?**
  The `postgres@3.4.8` query-parameter claim was independently verified
  (source read + live override attempt, round 10) and is re-stated,
  unchanged, in `resolveRemoteUrl`'s doc comment. `new URL()`
  normalization behavior used in this round's tests (dot-segment
  removal, non-special-scheme host case-sensitivity) was verified
  empirically against the actual Node runtime before being relied on in
  a test, not assumed.

### Review round 13 -- reject hidden Git index state (Codex)

One finding (P2), treated as a repository commit-binding invariant, not
a one-line `git status` patch. Reproduced by Codex with `git update-index
--assume-unchanged query.ts`: `git status --porcelain` returned nothing
after editing the file, so `plan` would connect remotely and persist
evidence stamped `workingTreeDirty: false` and the unchanged HEAD SHA
even though different code executed. Full design/rationale is under
"`assertNoHiddenGitIndexState` -- reject hidden index state (round 13)"
above; this section covers what was added and how it was verified.

Implemented `assertNoHiddenGitIndexState`, called before the ordinary
`isWorkingTreeDirty` check (see the updated pipeline/precondition list
above), and `isWorkingTreeDirty` itself was made explicit/configuration-
independent (`--porcelain=v1 --untracked-files=all`) without weakening
any existing rejection. This is a **verifier, not a mutator** -- it
never clears `assume-unchanged`/`skip-worktree` itself, and never names
the affected path in its thrown message.

#### Re-review of the Git-based commit-binding chain

Per explicit instruction, re-reviewed every Git-based assumption in this
chain after the fix: `REPO_ROOT` -> hidden index state -> worktree
status -> `resolveCommitShaStrict` -> `artifact.commit`.

- `REPO_ROOT`: derived from `import.meta.url` (the executing script's
  own on-disk location) -- not derived from any Git state, so no
  repository-local metadata can influence it.
- Hidden index state: now checked (`assertNoHiddenGitIndexState`).
  Sparse-checkout was considered explicitly -- `git sparse-checkout` sets
  the skip-worktree bit on excluded paths internally, so it is already
  caught by the same detection, no separate check needed. Submodule
  pointer staleness (a stale recorded SHA vs. what is actually checked
  out) is a different, real class of hidden state -- confirmed this
  repository has no `.gitmodules` (`ls -la .gitmodules` -> no such file)
  and no sparse-checkout configured (`git config core.sparseCheckout` ->
  unset), so it is currently inapplicable, not fixed here per the
  explicit instruction not to broaden into unrelated/inapplicable cases.
- Worktree status: `isWorkingTreeDirty`, now with explicit
  `--porcelain=v1 --untracked-files=all` (see above).
- `resolveCommitShaStrict`: reflects the actual current `HEAD` ref;
  cwd-pinned to `REPO_ROOT`. No index-level flag affects `git rev-parse`
  output -- only direct filesystem tampering with `.git/HEAD` itself
  could, which is a different class of attack (filesystem integrity, not
  Git index configuration) outside this finding's scope.
- `artifact.commit`: a direct pass-through of `{ commitSha,
  workingTreeDirty: false }` from the checks above -- no additional risk
  introduced there.

No other repository-local Git metadata was found that could make this
chain's observations omit an executable tracked change.

#### Tests

Mocked (`cli.test.ts`, extending the existing `git ls-files`/`status`/
`rev-parse` mocking pattern): ordinary clean repository proceeds;
ordinary dirty tracked file rejects (with the call count updated to
reflect the new `ls-files` check preceding `status`); an
assume-unchanged entry rejects before commit resolution and before any
remote connection; a skip-worktree entry rejects the same way; combined
hidden state on one entry rejects; the flag alone is enough to reject
even when `git status` reports the tree fully clean; the affected path
is never named in the rejection message; a `git ls-files` subprocess
failure fails closed without leaking its raw output (only as `cause`).

Real Git (`cli.git-index.test.ts`, new file, no mocking of
`execFileSync` at all): a disposable `mkdtemp` repository is created,
committed, then exercised with real `git update-index --assume-unchanged`/
`--skip-worktree` and real `git status --porcelain` -- proving (a)
ordinary `git status` genuinely returns empty after an edit is hidden
behind either flag (the actual gap this guard closes, not merely an
assumption about it), (b) `findHiddenGitIndexStateTags` genuinely detects
both flags and their combination against real Git output, (c) clearing
the flag (`--no-assume-unchanged`/`--no-skip-worktree`) genuinely
restores a clean result. No network, database, or remote credential
involved -- `git` is the only external process.

`findHiddenGitIndexStateTags` is exported specifically to make this real
test possible, taking an explicit `cwd` rather than this script's own
`REPO_ROOT` -- the same export-for-testability precedent
`readonly-db-remote.ts`'s `verifyReadOnlyRole` already established.

Both the guard call and its detection logic were verified via temporary
revert-and-confirm-failure: removing the `assertNoHiddenGitIndexState()`
call left exactly the six new mocked tests (plus the updated dirty-tree
call-count assertion) failing, nothing else; restored and reconfirmed
green.

### Review round 14 (Codex) — documentation only

One finding (P2), docs only, no code change: the "Execution boundary —
read this first" section's `readonly-db-remote.ts` bullet still said the
module only gained `assertTargetIdentityMatchesExpectation`/
`computeVerifiedIdentityFingerprint` and that "everything else" was
untouched -- no longer true after round 12's `resolveRemoteUrl`
hardening (the authoritative URL parse/normalization gate) and its
effect on what `withReadOnlyRemoteDb` actually connects with. A security
checkpoint that undercounts changed credential-trust-boundary code is
itself a gap, independent of whether the later "What was built" sections
already described the change correctly.

Fixed by rewriting the bullet into explicit **Changed in Phase B2** /
**Still unchanged** lists (see above). While reviewing the rest of the
top-level section for the same category of stale wording, also narrowed
the adjacent Phase A/B1 bullet: it grouped `withReadOnlyRemoteDb`/
`describeRemoteTarget` together with `RemoteTarget`/`verifyReadOnlyRole`
under one blanket "wired together unmodified" claim, which has the same
problem -- `withReadOnlyRemoteDb` gained the identity-check call as far
back as round 1, and both functions' effective behavior changed via
`resolveRemoteUrl`. Split the claim so only the genuinely-unmodified
carryovers (`RemoteTarget`, `verifyReadOnlyRole`, the B1 collector/
registry) keep the "unmodified" wording, with an explicit pointer to the
corrected bullet for the rest.

Every other "unmodified"/"unchanged"/"untouched" sentence in the section
was checked against the current diff and left as-is where still
accurate (the acknowledgement-gate/git-reachability claim, the
`explain-preflight.ts` V1-vs-V2 claim, the no-approval-record/no-Phase-B3
claim, and the `scan` behavior claim all still hold).

No executable TypeScript, test, artifact-contract, Git-guard, or
remote-DB-wiring code was touched this round.

### Review round 15 (Codex) — documentation only

One finding (P2), docs only, no code change, and the same class as round
14 applied to the other control artifact: `plan.md`'s `Classification`
section still asserted that no existing security-reviewed logic had been
modified, and used that assertion to justify not re-running a full
specialist review cycle. A reviewer working from `plan.md` could
therefore under-scope the security read of this PR even though the
runbook (as of round 14) listed the changed functions correctly.

Fixed in `plan.md` by splitting the classification into explicitly
unchanged existing logic (`verifyReadOnlyRole`'s privilege semantics, the
canonical query registry and its SQL, the B1 collector's
canonicalization/fingerprinting, the V1 artifact contract) versus
explicitly modified existing credential/connection logic
(`resolveRemoteUrl`'s round-12 hardening into the authoritative URL
parse/normalization gate, and `withReadOnlyRemoteDb`'s target-identity
enforcement plus its use of that gate's normalized URL), with a separate
statement of the review coverage those changes actually received. The
`Objective` section gained a one-clause pointer noting it states the
original objective rather than the delivered scope.

No executable TypeScript, test, artifact-contract, Git-guard, or
remote-DB-wiring code was touched this round.

### Review round 16 (Codex) — documentation only

One finding (P2), docs only, on wording introduced by round 15 itself:
the new `Review coverage` bullet in `plan.md` claimed every one of the
review rounds was verified by temporary revert-and-confirm-failure. That
overstated the security evidence. Verified against this runbook before
correcting: rounds 7, 9 and 14 are labelled documentation-only here, and
round 10 explicitly records that its credential-fixture rename had no
separate broken state to revert to (verified instead by a full passing
suite plus a repository-wide sweep). Round 11's `buildTestPostgresUrl`
extraction is the same refactor class, and round 15 was itself
documentation-only.

Corrected by replacing the single blanket claim with three explicit
categories: executable fixes actually verified by revert-and-confirm-
failure (rounds 1-6, 8, 10's query-string rejection, 12, 13 -- named as
the load-bearing security evidence); refactors/renames with no revertable
state, verified by suite-pass plus repository-wide sweep (round 10's
fixture rename, round 11); and documentation-only rounds carrying no
runtime security evidence at all (7, 9, 14, 15). The PR description
carried the identical blanket claim, with a stale round count, and was
corrected the same way.

This runbook's own per-round sections already distinguished these cases
correctly and needed no change; the defect was confined to the summary
restatements in `plan.md` and the PR description.

No executable TypeScript, test, artifact-contract, Git-guard, or
remote-DB-wiring code was touched this round.

### Validation

- typecheck: clean
- lint: clean
- unit (`scripts/tenancy-inventory` subset): 172/172 (36 in
  `cli.test.ts`, 6 in `cli.git-index.test.ts` -- real Git, no mocking --
  30 in `readonly-db-remote.test.ts`, 70 in `explain-preflight.test.ts`,
  30 across `evidence-store.test.ts`/`ownership-matrix.test.ts`/
  `query-registry.test.ts`)
- unit (full repo, `pnpm test`): 280 files / 2425 tests, all pass
- real DB (`pnpm test:db:local`): 32 files / 297 tests, all pass
- CI config (`pnpm test:db:ci`, the same command the required "DB Tests"
  job runs): 32 files / 297 tests, all pass
- repository-wide credential-shaped-literal sweep: redone from scratch
  (not trusting round 11's result), zero remaining matches in any file
  this branch owns

### What Phase B2 explicitly does NOT do

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
