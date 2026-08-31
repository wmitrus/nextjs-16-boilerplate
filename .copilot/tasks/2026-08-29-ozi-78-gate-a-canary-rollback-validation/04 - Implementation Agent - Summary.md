# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `OZI-78`
- Current run scope: Gate A, Slice A1 coordinator review corrections only
- Status: completed locally; no commit, push, or remote operation performed
- Last updated: 2026-08-30
- Control artifact: `plan.md`

## Changes

- Canonical AuthJS provisioning now selects an owner-backed default-tenant
  organization using a stable organization/role ordering.
- The optional containment fixture inserts only A2. It reuses seeded Globex HQ
  as B1 and proves the returned A1/A2/B1 topology before responding.
- Fixture mutation refuses every database target except local PostgreSQL on
  `127.0.0.1:5433/app_test` (including `localhost` and `[::1]` host aliases),
  and refuses Vercel Preview and Production.
- The platform E2E user now provisions normally after the normal user creates
  the fixture.
- Containment helpers are isolated in a server-only sibling module so the
  Next.js route module exports only `POST`; IPv6 loopback is accepted as
  `[::1]`.
- Ordinary AuthJS provisioning continues to return only `{ success: true }`.
- The containment browser scenario now runs normal-admin and platform-admin
  assertions as two serial tests, so each remains within the standard test
  timeout while preserving a proven shared topology.

## Validation

- Focused route and step-up static tests: 34 passed.
- `pnpm lint --fix`: passed.
- `pnpm exec next typegen`: passed.
- `pnpm typecheck`: passed.
- Local AuthJS container Playwright containment scenario: passed; its setup
  explicitly skipped Clerk identities and reset only `app_test`.

## Scope and Safety

- No Clerk API, Neon, Vercel, Preview, production, Linear update, commit, or
  push was used.
- Existing A1/A2/B1 application-boundary assertions remain intact.
# OZI-78 — Implementation Summary

## A4.2a Controlled Remote Candidate DETAIL Read

- Added a rollback-assessment-local adapter for the sole authorized provider
  operation: `vercel api /v13/deployments/<nominated-id> --method=GET --raw`.
- Default `pnpm rollback:assess -- --deployment-id=<id>` remains local-only;
  it does not read anchors, invoke Vercel, or make a network call.
- Remote access requires the one-time explicit
  `--execute-remote-candidate-read` flag. Duplicate flags and malformed IDs
  fail before the provider subprocess.
- The adapter checks local expected identity anchors and local Vercel project
  linkage, bounds stdout, suppresses provider stderr, parses JSON as untrusted,
  and delegates all deployment acceptance to `assertProductionDeployment()`.
- A successful remote identity proof permits only the existing local Git
  ancestry check. No Git fetch/GitHub fallback, environment read, DB access,
  smoke, promotion, rollback, or traffic change was added.
- REMOTE_READ evidence provenance is structurally unforgeable: the exported
  `buildLocalRollbackAssessment()` has no provenance parameter in its type at
  all, so it can never produce `READ_AND_VALIDATED`; only a private helper
  used exclusively by `run()` after it has actually executed
  `readRemoteCandidateDetail()` may establish that provenance.
- The single Vercel DETAIL subprocess now also carries an explicit 15s
  timeout alongside the existing 128 KiB bounded output, with no retries.

## PR #89 Full Review Corrective Pass

- Removed `run()`'s caller-controlled dependency bag (`vercelExecutor`,
  `readExpectedIdentity`, `gitExecutor`). `run()` is now
  `run(argv = process.argv)` only, structurally bound to the real
  `readExpectedProductionIdentity()`, `readRemoteCandidateDetail()`, and
  local ancestry implementations — no importing module can inject a fake
  Vercel executor to fabricate `READ_AND_VALIDATED` provenance. CLI tests use
  a Vitest module mock of `./remote-candidate` instead.
- `src/app/api/internal/preview-canary/database-binding/route.ts` now also
  requires a non-empty `URL#hostname` after the protocol check, so
  `postgresql:///db` fails closed to the existing bounded 500
  `{"error":"Unavailable"}` instead of returning 200 with `databaseHost: ''`.
- `gitRefSchema` gained the remaining Git branch/ref-format predicates:
  no path component may start with `.` or end with `.lock`, the value may
  not be exactly `@`, and a branch name may not start with `-`. The existing
  character-class exclusions (control chars, whitespace, `~^:?*\[`, no
  trailing `]` restriction) were preserved unchanged.
- `src/app/api/internal/e2e/authjs-user/containment-fixture.ts` (`[::1]`) and
  the `gitRefSchema` character class were confirmed correct and left
  untouched; `scripts/git/full-diff.sh` (user-owned) was not modified.

A4.2a was implemented, reviewed, and (outside this implementation pass) later
executed once, read-only, against the live Production rollback candidate:
`candidateIdentity`/`containmentFloorAncestry` PASS, `remoteCandidateEvidence`
READ_AND_VALIDATED, `rollbackAction` NOT_AUTHORIZED, `rollbackExecutable`
false. No Production mutation, rollback, or promote occurred. A4.2a is
COMPLETE. Full A4 is not complete.

## A4.2b Read-Only Compatibility Evidence

- New internal, Production-only, internal-API-guarded endpoint
  `/api/internal/rollback-assessment/environment-contract` returns a bounded
  `{authProvider, contractVersion, fingerprint}` attestation — a SHA-256
  fingerprint over `AUTH_PROVIDER`/`TENANCY_MODE`/`TENANT_CONTEXT_SOURCE`
  only, never a raw env dump or secret. Shared fingerprint logic lives in
  `src/security/internal-api/rollback-environment-contract.ts`.
- New `--execute-production-environment-read`: one bounded GET (10s timeout,
  4 KiB response cap) against the trusted candidate's own immutable
  deployment URL. **This route is instrumentation for future candidates
  only — it cannot retroactively exist on a candidate deployed before this
  PR.** `run()` proves this locally before ever attempting the GET
  (`checkCandidateEnvironmentContractInstrumentation`: `git cat-file -e
  <trusted-sha>:<route-path>`, no fetch); a candidate whose commit lacks
  the route is BLOCKED ("predates deployment-bound environment-contract
  instrumentation"), never a 404 misread as ERROR. **Verified against the
  real repository**: the currently validated A4.2a candidate
  (`f2d57d52d10c7685df40b57b7d4aa9ab21778a67`) genuinely predates this
  route, so its `environmentContract` is BLOCKED FOR LEGACY CANDIDATE and
  cannot reach PASS under any authorization. The "expected" contract side
  is sourced from explicit `PRODUCTION_AUTH_PROVIDER`/
  `PRODUCTION_TENANCY_MODE`/`PRODUCTION_TENANT_CONTEXT_SOURCE` local trust
  anchors (LOCAL_OPERATOR_DECLARED provenance) — never the operator's own
  ambient env, which could be Preview/dev.
- New `--execute-production-schema-read`: candidate-side migration evidence
  from local Git object access at the exact trusted candidate SHA (no
  fetch, fails closed on shallow history); Production-side evidence from
  one explicitly read-only, timeout-bounded `SELECT hash FROM
  drizzle.__drizzle_migrations ORDER BY hash ASC LIMIT candidateCount + 1`
  (`ORDER BY hash` is for deterministic retrieval only, no ordering claim;
  bounded to the already-known candidate count + one extra row, so
  Production having more entries is still detected via the returned row
  count). Compared via **exact applied-migration hash-set equality**
  (`assessAppliedMigrationHashSetCompatibility`) — never positional/tag
  equality: `drizzle.__drizzle_migrations` never stored a `tag`, order
  never participates in the result, and each side is validated for
  well-formedness/uniqueness before comparison (a duplicate or malformed
  hash on either side is INVALID). **The connection is never opened until
  Production database identity is proven on two independent dimensions**
  — `resolveVerifiedProductionDatabaseUrl()` requires the resolved
  `DATABASE_URL` to be a PostgreSQL URI whose hostname *and* decoded
  database name both exactly match two explicit local trust anchors,
  `PRODUCTION_DATABASE_HOST` and `PRODUCTION_DATABASE_NAME` (both
  LOCAL_OPERATOR_DECLARED, not independently provider-verified) — a
  Postgres/Neon host alone does not identify a database. Never imports
  the existing migration-repair helper. (See "A4.2b Schema Evidence Final
  Pass" below for why an earlier positional-pairing design was replaced,
  and "A4.2b Final Error-Boundary Cleanup" for how client-construction
  failures are handled.)
- Both new flags require `--execute-remote-candidate-read` to have already
  succeeded in the same invocation; neither can reach a Vercel DETAIL read or
  a Production connection on its own, and neither is a generic
  `--remote`/`--execute`/`--production` flag.
- Provenance for all three evidence categories (candidate, environment,
  schema) is structurally unforgeable through the exported
  `buildLocalRollbackAssessment()` — none of it can produce a `PASS` labeled
  as remotely verified.
- `smoke` remains BLOCKED (A4.2c); `rollbackAction`/`rollbackExecutable`
  remain NOT_AUTHORIZED/false regardless of environment/schema outcome.

A4.2b is implemented and locally validated; its remote/Production reads were
NOT exercised in this pass. **The currently deployed A4.2a legacy candidate
cannot reach `environmentContract: PASS`** — it predates the attestation
route, and no authorization can change that; only a future candidate built
after this route exists can. Full A4 is not complete.

## A4.2b Final Corrective Pass

- `readCandidateEnvironmentContract()` now also sends
  `x-vercel-protection-bypass`/`x-vercel-set-bypass-cookie: true`, resolving
  `VERCEL_AUTOMATION_BYPASS_SECRET` lazily and independently of
  `INTERNAL_API_KEY`, failing closed before any `fetch` if either secret is
  missing — matching `prod-deploy.yml`'s existing Production smoke contract
  for Standard/Deployment-Protected immutable URLs. Neither secret is ever
  logged, returned, or included in a thrown message.
- `readOperatorDeclaredProductionContractDimensions()` now requires an
  explicit `PRODUCTION_TENANT_CONTEXT_SOURCE` sentinel
  (`db`/`provider`/`none` → `db`/`provider`/`null`); a missing, empty, or
  unrecognized value makes the whole expected contract undetermined
  (BLOCKED) rather than silently defaulting to `null`.
- `checkCandidateEnvironmentContractInstrumentation()` now distinguishes
  "commit not locally resolvable" from "commit resolvable but lacks the
  route" with separate BLOCKED reasons (an added local `git cat-file -e
  <sha>^{commit}` check). The regression test against the real A4.2a
  candidate SHA now asserts the *specific* "predates instrumentation"
  reason in this repository's actual (non-shallow) state, rather than
  accepting any BLOCKED status — it no longer overclaims what a shallow
  checkout's BLOCKED result would mean.
- `PRODUCTION_DATABASE_HOST`'s documentation now states plainly that it is
  LOCAL_OPERATOR_DECLARED — an explicit non-secret pin, not an
  independently provider-verified Production identity — and that its value
  must come from a trusted Production source held independently of the
  `DATABASE_URL` it checks; copying it from that same URL would defeat the
  pin. No new remote provider read was introduced to verify the pin.
- No change to the fail-closed result for the current candidate
  (`dpl_7wuoSfmfnp9GTauaxWMVpQ7NFZRb`); no legacy bypass added. The legacy
  rollout policy remains a separate operator decision.

## A4.2b Schema Evidence Final Pass

- **Removed the positional Production-hash-to-candidate-tag pairing
  entirely** (`pairProductionHashesWithCandidateTags()` deleted). It relied
  on `created_at ASC` ordering reproducing `_journal.entries` order, which
  does not hold in this repository: `created_at` is populated from
  `_journal.json.entries[].when`, and the real journal's `when` values are
  non-monotonic (e.g. `0005_generic_profile_fields`'s `when` predates
  `0004_cool_morgan_stark`'s), plus the existing migration-repair tooling
  can insert rows stamped with `Date.now()` later. The old design could
  therefore have produced a false BLOCKED for a genuinely compatible
  Production database.
- Added `assessAppliedMigrationHashSetCompatibility()` in
  `production-schema.ts`: candidate and Production migration hashes are
  compared as **exact sets**, order-independent. Each side is validated
  for well-formedness (64-hex) and uniqueness first (a duplicate or
  malformed hash on either side is INVALID); exact set equality is the
  only path to PASS. `migration-compatibility.ts`'s original ordered/tag
  comparator is preserved unchanged (unused by the live Production path,
  kept as an existing tested utility).
- The Production SELECT's `ORDER BY created_at ASC` was replaced with
  `ORDER BY hash ASC` (reproducibility only, no ordering claim); the
  `LIMIT expectedCount + 1` bound is unchanged and still correctly detects
  "Production has more migrations than the candidate" via the returned
  row count, independent of which specific rows a `LIMIT` selects.
- Added `PRODUCTION_DATABASE_NAME` as a second explicit
  LOCAL_OPERATOR_DECLARED trust anchor alongside `PRODUCTION_DATABASE_HOST`
  in `resolveVerifiedProductionDatabaseUrl()`: a Postgres/Neon host alone
  does not identify a database (one endpoint can serve several), so both
  hostname and decoded database name must now exactly match before any
  connection opens. Protocol is also now validated (`postgres:`/
  `postgresql:`, else `ERROR`).
- `readProductionAppliedMigrationHashes()` now folds a `client.end()`
  failure into the same bounded `ERROR` evidence as a query failure —
  even after an otherwise-successful SELECT, a close failure downgrades
  the result to `ERROR` rather than reporting a false `OK`; no raw driver
  error ever escapes the function.

## A4.2b Final Error-Boundary Cleanup

- `clientFactory(...)` (Postgres client construction) is now inside the
  same bounded error boundary as the query and the close.
  `postgres.js` parses the URL/options synchronously during construction,
  so it can throw before any query runs; that throw now collapses to the
  same generic `{status: 'ERROR', reason: 'Production migration-journal
  read failed.'}` instead of escaping to the CLI's top-level raw-error
  printer. If construction itself fails, `client.end()` is never
  attempted -- no client was actually established to close. Target
  binding (`resolveVerifiedProductionDatabaseUrl()`) still runs first and
  unchanged: construction is never attempted at all when identity cannot
  be proven.
- Corrected the earlier "A4.2b Read-Only Compatibility Evidence" section
  above, which still described positional Production-hash-to-candidate-
  tag pairing and only `PRODUCTION_DATABASE_HOST` -- both superseded by
  the "A4.2b Schema Evidence Final Pass" section. `plan.md` was checked as well;
  its remaining positional-pairing mention is
  explicitly historical/superseded by the current hash-set architecture, so no
  additional correction was required there.; there is now only one described
  architecture: exact applied-migration hash-set equality, `ORDER BY
  hash` for deterministic retrieval only, `PRODUCTION_DATABASE_HOST` +
  `PRODUCTION_DATABASE_NAME`, both LOCAL_OPERATOR_DECLARED.
- The BLOCKED reason for a missing/unrecognized expected-environment
  anchor now names all three required declarations
  (`PRODUCTION_AUTH_PROVIDER`/`PRODUCTION_TENANCY_MODE`/
  `PRODUCTION_TENANT_CONTEXT_SOURCE`), not just the first two -- values
  are never included, only the variable names.

## Validation

- Focused rollback-assessment Vitest suite: 184 tests passed (includes
  the five new client-construction error-boundary cases and fixtures
  modeling this repository's actual non-monotonic `_journal.json` `when`
  values).
- Focused `src/security/internal-api/rollback-environment-contract.test.ts`
  and the new route's test: 18 tests passed.
- `pnpm test`: 297 files / 2810 tests passed.
- `pnpm lint`, `pnpm typecheck`, and `git diff --check` passed.
- No remote Vercel or Production operation was run during implementation.
