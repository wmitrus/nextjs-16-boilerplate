# OZI-78 — Gate A Canary, Rollback, and Production Validation

## Objective

Define the minimum safe Phase 0 canary, observability, rollback-planning, and
production-validation capability for the existing organization-containment
behavior. This task must preserve the current authorization semantics:

- normal administrator: active-organization scope only;
- explicit platform administrator: active-tenant scope only;
- neither path may reach another tenant.

## Classification

- Primary workflow: Safe Feature Workflow, high-risk path
- Linear issue: OZI-78
- Execution control: manual-handoff
- Current phase: A1/A2 complete and validated; A3a read-only complete with
  historical Preview PASS; A3b unstarted; A4.1 (local-only rollback
  assessment) COMPLETE; A4.2a (operator-controlled remote candidate DETAIL
  read) COMPLETE -- executed once, read-only, against the live Production
  rollback candidate (PASS, see below); A4.2b (read-only environment-contract
  and Production migration-journal compatibility evidence) implemented and
  locally validated, and its live reads subsequently executed by the
  operator against `dpl_FntevQ2meXxpesZ4x2XYbWwQWWAo`
  (candidateIdentity/containmentFloorAncestry/environmentContract PASS;
  Production migration drift found and repaired under separate
  authorization; post-repair `schemaCompatibility` PASS with 21 unique
  migration hashes -- see A4.2b status below); A4.2c (deployment-bound
  AuthJS read-only rollback smoke) implemented and locally validated behind
  the new `--execute-authjs-smoke-read` acknowledgement, its network smoke
  NOT YET exercised; rollback/promote execution remains unstarted and
  separately gated; full A4 is not complete
- Current baseline: `main@7e4b3eddd07f27a060c40616a0d7f130925a6b48`
- Containment floor: `2450d410f4617f9b0e415f2b4d47bcde748b1cbc`

## Gate A Constraints

- No remote operation is authorized by this plan.
- Do not read production configuration or access production.
- Do not execute Clerk fixture reconciliation, Clerk Backend API mutation,
  Neon mutation, Vercel deployment, promotion, or rollback without explicit
  operator approval.
- Do not automatically mutate every PR Preview. The canary is explicitly
  targeted and inert by default.
- Do not duplicate the existing real-Postgres organization containment tests.
- Do not widen platform administration to global or unscoped access.
- Do not use an unscoped lookup to distinguish a sibling object from a
  nonexistent object.
- Do not duplicate existing step-up-denial or generic 5xx telemetry.

## Confirmed Current-State Evidence

- `DrizzleAdminOrganizationsReadService.db.test.ts` already proves active-org
  containment, sibling denial, active-tenant platform access, and cross-tenant
  denial.
- `DrizzleAdminOrganizationsMutationService.db.test.ts` already proves
  same-org success, normal sibling denial, platform sibling success, and
  cross-tenant denial.
- Nested organization routes perform a scoped parent-organization lookup
  before their members, roles, invitations, and policy writes. Existing route
  tests cover action denials and scoped 404 paths. Gate A must add evidence
  only if further review finds a concrete nested DB-boundary hole; it must use
  the existing fixture and table-driven cases rather than recreate A1/A2/B1.
- `e2e/admin.spec.ts` is AuthJS happy-path coverage and does not prove the
  canary's negative containment assertions.
- Clerk E2E fixture support uses the real Clerk Backend API. A Clerk scenario
  is remote-capable unless an inspected path proves it needs no fixture
  reconciliation or mutation.
- Normal Preview deployment is Git-SHA/ref bound, but it has no manual,
  fail-closed OZI-78 fixture protocol or scoped canary stage.
- Existing Vercel production deployment validates readiness and smoke before
  `vercel promote`; it does not provide an ancestry-guarded rollback planner.

## Provider and Context Matrix

| AUTH_PROVIDER | TENANT_CONTEXT_SOURCE | Current classification |
|---|---|---|
| Clerk | provider | Executable only with Clerk fixture/API path review; potentially REMOTE-WRITE |
| Clerk | db | Executable only with Clerk fixture/API path review; potentially REMOTE-WRITE |
| AuthJS | db/single | Executable locally with the repository container scenario |
| AuthJS | provider/org | Unsupported by current evidence |
| Supabase or Neon | any | Unsupported: adapters are explicitly unimplemented |
| Active deployment | unknown | Operator must supply deployed provider/context configuration |

`AUTH_PROVIDER` and `TENANT_CONTEXT_SOURCE` remain separate axes. The
production/Preview matrix is not inferred from local environment files.

## Proposed Ordered Slices

### Slice A1 — Local containment evidence

1. Re-inspect nested members, roles, invitations, and policies for any
   concrete DB-boundary gap.
2. Add only the smallest table-driven assertion to an existing test if such a
   gap is confirmed. Otherwise record that the shared scoped-read-service
   predicate plus existing route tests is transitive evidence and leave the
   containment tests unchanged.
3. Add the smallest AuthJS local E2E containment scenario that creates or
   reuses local A1/A2/B1 data and proves listing, direct-object, nested-surface,
   platform, and required step-up outcomes.

This slice is local-only when run through the AuthJS container scenario.

**Status: completed locally.** The nested-surface review found no concrete
DB-boundary gap beyond the existing scoped-read-service and route evidence.
The implemented AuthJS container scenario proves the A1/A2/B1 list, direct
GET, representative nested-members page, and active-tenant platform behavior.
Fixture mutation is fail-closed to the local `app_test` PostgreSQL profile.

### Slice A2 — Missing authorization-boundary observability

1. Reuse the existing server Pino logger.
2. Add only fixed-cardinality organization-boundary events for action denial
   and scoped lookup miss; include an allowed denominator only if the
   monitoring design requires it.
3. Emit no identifiers, email, route parameter, session data, provider secret,
   or server-failure classification.
4. Do not alter `withAdminStepUp` telemetry or generic error handling.

This slice is local-only to implement and test.

**Status: completed and validated.**

### Slice A3 — Manual Preview canary tooling

1. Prefer a guarded repository script/CLI invoked manually against an approved
   Preview, rather than changing `preview-deploy.yml` to seed every PR.
2. Add a `--plan`/read-only default; require an explicit `--apply`-style
   control before fixture writes.
3. Before any apply action, fail closed unless the supplied Preview URL,
   Vercel deployment metadata, repository/project/team identity, Git ref/SHA,
   and expected isolated Neon Preview branch all agree.
4. Use the normal Preview deployment mechanism; do not create a workflow
   unless the existing manual command model cannot safely expose an approved
   operator-controlled execution path.
5. Treat all Clerk user/org/membership creation, repair, reconciliation, and
   cleanup as REMOTE-WRITE. Do not assume a useful read-only Clerk run exists
   until the exact helper path is inspected.

This slice may be implemented locally but must not be executed remotely without
operator approval.

**A3a status: COMPLETE / PASS.** The auto live read-only flow exercised branch
`ozi-78-gate-a-slice-a1`, SHA `ca8b31b15e0cd8ac395e7266496b4e12781d8607`,
deployment ID `dpl_6viFav6cmpTS3DKSNhv1ANmY5TtB`, and immutable Preview
`https://nextjs-16-boilerplate-3k0s8g461-wojciech-mitruss-projects.vercel.app`.
Runtime auth evidence was bound to that deployment (`authjs`), and runtime DB
plus Neon verification passed for `preview/ozi-78-gate-a-slice-a1` and
`ep-wandering-wave-agb6mck0-pooler.c-2.eu-central-1.aws.neon.tech`. It ran
read-only with mutation not requested. This evidence does not authorize A3b
or any Production action.

**A3b status: not authorized / not executed.**

### Slice A4 — Rollback assessment and runbook

1. Build a tested local guard/helper that discovers a nominated Vercel
   candidate, validates READY state and deployment identity, extracts trusted
   Git metadata, checks containment-floor ancestry, checks schema/persistence
   and security-critical environment-contract compatibility, runs a
   pre-rollback smoke against the candidate, and generates—not executes—the
   rollback command and plan.
2. A workflow-based ancestry check must fetch sufficient history/commits or
   use an equivalent trusted GitHub ancestry API. A shallow checkout alone is
   insufficient.
3. Keep actual `vercel rollback` and `vercel promote` outside the rehearsal:
   either changes production traffic. An isolated custom Vercel environment or
   disposable project is an optional, separately approved alternative only.
4. Prefer this guard plus an operator runbook over a new workflow unless a
   concrete operational gap proves the workflow necessary.

This slice is local-only to implement/test. Candidate inspection and smoke are
remote access and require separate approval; traffic switching always requires
separate production authorization.

**Status: A4.2a COMPLETE.** The operator-controlled remote candidate DETAIL
read has been executed once, read-only, against the live Production rollback
candidate, with the following authoritative evidence:

| Field | Value |
|---|---|
| `deploymentId` | `dpl_7wuoSfmfnp9GTauaxWMVpQ7NFZRb` |
| `gitRef` | `main` |
| `gitSha` | `f2d57d52d10c7685df40b57b7d4aa9ab21778a67` |
| `immutableUrl` | `https://nextjs-16-boilerplate-qgsv3lkg6-wojciech-mitruss-projects.vercel.app` |
| `candidateIdentity` | `PASS` |
| `containmentFloorAncestry` | `PASS` |
| `remoteCandidateEvidence` | `READ_AND_VALIDATED` |
| `rollbackAction` | `NOT_AUTHORIZED` |
| `rollbackExecutable` | `false` |

That operation was a single bounded Vercel DETAIL `GET`; it performed no
Production mutation, no rollback, no promote, and no traffic change.

**Status: A4.2b (environment-contract and Production migration-journal
read-only compatibility evidence) implemented and locally validated; its
remote/Production reads have NOT been exercised in this pass.** Default
`rollback:assess` remains zero-network/local-only. Two further narrow,
independent acknowledgements were added, each authorizing exactly one read
category and requiring the same-invocation `--execute-remote-candidate-read`
to have already established the trusted candidate:

- `--execute-production-environment-read` -- one bounded GET, from the
  operator's machine, against the trusted candidate's own immutable
  deployment URL, at a new internal-API-guarded, Production-only endpoint
  (`/api/internal/rollback-assessment/environment-contract`) that returns
  only `{authProvider, contractVersion, fingerprint}` -- a SHA-256
  fingerprint over the enumerated dimensions `AUTH_PROVIDER`, `TENANCY_MODE`,
  `TENANT_CONTEXT_SOURCE`. The GET carries `x-internal-key` (this
  application's own auth) and, independently, `x-vercel-protection-bypass`
  / `x-vercel-set-bypass-cookie: true` -- the same
  `VERCEL_AUTOMATION_BYPASS_SECRET` contract `prod-deploy.yml`'s own
  Production smoke step already relies on, required for an immutable
  Production URL that Vercel Standard/Deployment Protection covers. Both
  secrets are resolved lazily, only at the one call site about to read,
  and fail closed before any `fetch` if either is absent. **This endpoint
  is instrumentation for future rollback candidates only.** A candidate is
  an immutable deployment built from a fixed Git commit; this route is
  added by this same PR, so it cannot retroactively exist on any candidate
  already deployed before this PR merges. Before ever attempting the GET,
  `run()` runs a purely local, deterministic check
  (`checkCandidateEnvironmentContractInstrumentation`, `git cat-file -e`,
  no fetch) with three distinct outcomes: shallow history (its own BLOCKED
  reason), the commit object itself not locally resolvable (its own
  distinct BLOCKED reason -- never conflated with "predates"), and the
  commit resolvable but lacking the route path (BLOCKED, "Rollback
  candidate predates deployment-bound environment-contract
  instrumentation"). **The currently validated A4.2a candidate
  (`dpl_7wuoSfmfnp9GTauaxWMVpQ7NFZRb`, SHA
  `f2d57d52d10c7685df40b57b7d4aa9ab21778a67`) is exactly such a candidate:
  it predates this PR, so `environmentContract` for it is BLOCKED FOR
  LEGACY CANDIDATE / instrumentation unavailable, and can never reach
  PASS, no matter which A4.2b flags are authorized.** This is proven by a
  regression test that runs the real (unmocked) Git check against that
  exact SHA in this repository: it first establishes, from this actual
  checkout's own shallow/non-shallow state, which BLOCKED reason applies,
  then -- in the non-shallow case this repository actually has -- asserts
  the precise "predates instrumentation" reason specifically (not merely
  "any BLOCKED status"). The candidate's own reported evidence, once
  instrumentation exists on a future candidate, is compared against an
  **expected** contract sourced from explicit `PRODUCTION_AUTH_PROVIDER`/
  `PRODUCTION_TENANCY_MODE`/`PRODUCTION_TENANT_CONTEXT_SOURCE` local trust
  anchors (`readOperatorDeclaredProductionContractDimensions()`, provenance
  LOCAL_OPERATOR_DECLARED) -- never the operator's own ambient
  `AUTH_PROVIDER`/`TENANCY_MODE`/`TENANT_CONTEXT_SOURCE`, which could
  legitimately resolve to Preview or development. Every dimension must be
  an explicit declaration, including the null case: an *absent*
  `PRODUCTION_TENANT_CONTEXT_SOURCE` is undetermined (BLOCKED), not
  silently `null` -- the bounded sentinel `none` is the only way to
  declare that value (`db`/`provider`/`none`; anything else undetermined).
- `--execute-production-schema-read` -- candidate-side migration evidence is
  derived from local Git object access at the exact trusted candidate SHA
  (`git show <sha>:<path>`, never the working tree, never a fetch; shallow
  history fails closed to BLOCKED). Production-side evidence is one bounded,
  explicitly read-only `SELECT hash FROM drizzle.__drizzle_migrations LIMIT
  candidateCount + 1` (explicit connect/statement timeouts,
  `default_transaction_read_only` plus an explicit `BEGIN ... READ ONLY`
  transaction, at most one connection; the `+ 1` row and an absolute
  1000-entry ceiling exist so a Postgres `LIMIT` -- which always returns
  `min(actualRowCount, limit)` rows regardless of which specific rows are
  selected -- reliably reveals when Production has *more* migrations than
  the candidate, via the returned row count alone, without claiming
  anything about which extra row that is). **The connection is never
  opened until Production database identity is proven on two independent
  dimensions**: `resolveVerifiedProductionDatabaseUrl()` requires the
  resolved `DATABASE_URL`/`DATABASE_URL_UNPOOLED` to be a PostgreSQL URI
  whose hostname *and* decoded database name both exactly equal two
  explicit local trust anchors, `PRODUCTION_DATABASE_HOST` and
  `PRODUCTION_DATABASE_NAME` -- a Postgres/Neon host alone does not
  identify a database; one endpoint can serve several. Both anchors are
  **LOCAL_OPERATOR_DECLARED, not independently provider-verified** --
  exactly like `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`/`GITHUB_REPOSITORY` are
  pins the operator declares rather than a live provider identity check;
  this slice authorizes no additional remote provider read to verify
  either pin. Both values must come from a trusted Production source held
  independently of the connection string being checked (e.g. how
  Production's database was provisioned, or a separately-read Vercel/Neon
  Production config) -- copying either out of the very `DATABASE_URL` this
  check validates would defeat the pin entirely, agreeing a Preview/dev/
  stale URL with itself. This check fails closed to `BLOCKED` (or `ERROR`
  for a non-PostgreSQL scheme / unparseable URI) before any SQL executes.
  A `client.end()` failure is folded into the same bounded evidence
  contract as a query failure -- even after an otherwise-successful
  SELECT, a close failure still produces the generic `ERROR` result,
  because deterministic cleanup was never established; no raw driver
  error ever escapes.
  **The comparison this evidence supports is exact applied-migration
  *hash-set* equality -- never positional/tag equality.**
  `drizzle.__drizzle_migrations` never stored a `tag`, and its
  `created_at` column is populated from `_journal.json.entries[].when`;
  this repository's real journal contains non-monotonic `when` values
  (e.g. `0005_generic_profile_fields`'s `when` is earlier than
  `0004_cool_morgan_stark`'s), and the existing migration-repair tooling
  can insert rows stamped with `Date.now()` later still -- so
  `created_at` ordering cannot honestly be read as `_journal.entries`
  order in this repository. An earlier design paired Production hashes
  positionally with the candidate's own tags under an assumed
  `created_at`-as-journal-order equivalence; that assumption does not
  hold here and could have produced a false BLOCKED for a genuinely
  compatible Production database. `assessAppliedMigrationHashSetCompatibility()`
  replaces it: candidate and Production hash sets (each independently
  validated for well-formedness and uniqueness -- a duplicate or
  malformed hash on either side is INVALID) must be exactly equal as
  *sets*; order never participates in the result. Never imports the
  existing migration-repair helper (`repairKnownMigrationJournalDrift`).

Both A4.2b reads require candidate identity to already be established in the
same invocation; neither flag can reach a Vercel DETAIL read or a Production
connection on its own. Provenance for all three evidence categories
(candidate, environment, schema) is structurally unforgeable: the exported,
always-local `buildLocalRollbackAssessment()` has no way to source
`REMOTE_READ` provenance for any of them, so a caller supplying matching
fixtures directly can never observe a `PASS` labeled as remotely verified.

`environmentContract`/`schemaCompatibility` may reach `PASS` once their
respective reads are authorized, target-bound, and match -- but not for the
current legacy candidate's `environmentContract`, which is architecturally
blocked as described above regardless of authorization; no legacy bypass or
compatibility exception exists in code, and none is planned as part of this
implementation slice. `smoke` remains `BLOCKED` (A4.2c), and
`rollbackAction`/`rollbackExecutable` remain `NOT_AUTHORIZED`/`false`
regardless. No A4.2b remote or Production read was performed during this
implementation pass; Production DB/runtime state was not accessed by this
change, and full A4 is not complete. Whether/how to bootstrap the legacy
candidate onto A4.2b coverage (e.g. nominating a newer, already-instrumented
candidate once one exists) is a rollout-policy decision left to the operator,
separate from and after this implementation.

**Update — A4.2b live reads subsequently executed by the operator.** The
paragraphs above describe the A4.2b *implementation* pass, during which no
remote/Production read was performed. Separately, and before/outside the
A4.2c local implementation pass below, the operator executed the authorized
A4.2b live reads against deployment `dpl_FntevQ2meXxpesZ4x2XYbWwQWWAo`.
Confirmed final state: `candidateIdentity` PASS; `containmentFloorAncestry`
PASS; `environmentContract` PASS in its authorized deployment-bound read.
Production migration drift was discovered during schema evidence
collection; a separately authorized, atomic Production repair removed the
retired pending-invitation index and its `drizzle.__drizzle_migrations`
journal row plus one duplicate `0009_authjs_credentials` journal row.
Independent post-commit verification passed with exactly 21 current unique
migration hashes and the retired index absent, and the subsequent rollback
assessment returned `schemaCompatibility` PASS. Those were operator actions
taken outside this task's implementation passes; no rollback was authorized
or executed.

**Status: A4.2c (deployment-bound AuthJS read-only rollback smoke)
implemented and locally validated; its network smoke has NOT been exercised
in this pass.** A fourth independent acknowledgement,
`--execute-authjs-smoke-read`, was added (accepted at most once, never
satisfied by a generic `--remote`/`--execute`/`--production` flag). It
authorizes only a bounded, read-only smoke against the *already validated*
candidate's exact `immutableUrl` -- two GETs, `GET /auth/signin` (HTTP 200 /
media type exactly `text/html` / fully-read bounded body that is non-empty
AND, once complete, contains all four stable SignInClient credentials-form
markers `<form`, `name="email"`, `name="password"`, `type="submit"`
independently and order-agnostically -- a generic shell or PPR "Loading sign
in..." fallback fails closed; the body and the missing marker are never
surfaced) and `GET /api/auth/session` (HTTP 200 / media type exactly
`application/json` / bounded body parsing to a non-null non-array object;
anonymous `{}` needs no fixture). Each request is `method: GET`,
`cache: no-store`, `redirect: error`, no retries, one
`AbortSignal.timeout(10s)`; the only headers sent are an
endpoint-appropriate `accept` and `x-vercel-protection-bypass`
(`x-vercel-set-bypass-cookie` deliberately NOT sent -- it previously
provoked a 307 on this immutable URL). No user authentication, no
credentials, no fixtures, no mutation endpoint, no `INTERNAL_API_KEY`.
`VERCEL_AUTOMATION_BYPASS_SECRET` is resolved lazily only when the smoke is
about to run and is never logged or returned; every failure mode collapses
to a generic `ERROR` with no body/URL/header/secret content. The network
smoke fires only when, in the SAME `run()`, candidate identity,
containment-floor ancestry, the remotely read environment contract, and the
remotely read schema compatibility have all been acquired and assessed
`PASS` and the environment evidence names `authjs`; the final executable
invocation therefore requires
`--execute-remote-candidate-read --execute-production-environment-read
--execute-production-schema-read --execute-authjs-smoke-read`. A dedicated
`smoke` provenance category and a `smokeEvidence` field were added: a `PASS`
smoke gate is unreachable through `buildLocalRollbackAssessment()` or
caller-supplied fixture evidence -- only `run()`, after the real smoke
returned `OK`, may establish `REMOTE_READ` provenance for it. Clerk smoke
remains `BLOCKED`; `rollbackAction`/`rollbackExecutable` remain
`NOT_AUTHORIZED`/`false` even when all four evidence categories `PASS`. No
A4.2c remote or Production read was performed during this implementation
pass; full A4 is not complete.

**Status: Production migration & deployment hardening
(`fix/ozi-78-production-migration-deploy-hardening`) — preventive follow-up,
implemented locally.** The OZI-78 live Production validation exposed
duplicate + retired/unknown migration-journal state; that drift's controlled
repair was already completed separately (see the A4.2b live-execution note
above). This follow-up prevents it from passing future Production
validation:

1. `assertMigrationJournalComplete()` in
   `scripts/validate-migration-journal.ts` now fails closed when *any* of
   `missing` / `duplicateHashes` / `unknownHashes` is non-empty (previously
   only `missing`), naming each violated category; it repairs nothing and
   adds no Production mutation, and never emits a connection string,
   credential, or environment value.
2. `.github/workflows/prod-deploy.yml` gains a top-level
   `concurrency: { group: production-deployment, cancel-in-progress: false }`
   so overlapping Production deployment pipelines serialize (a later
   deployment waits; it never cancels the active one). **Preventive
   hardening, NOT a proven root cause** of the historical duplicate
   `0009_authjs_credentials` row — that root cause remains unproven.
3. `scripts/validate-vercel-deploy-profiles.ts` gains
   `assertVercelProductionConcurrencyContractValid()` (deterministic
   line/block parser, no YAML dependency), invoked from
   `pnpm vercel:deploy:validate`, enforcing that top-level contract against
   the real `prod-deploy.yml`.

DB-level advisory locking / migration serialization remains a separate
future defense-in-depth item and was not implemented. No Production
operation, migration run, remote command, commit, or push occurred in this
hardening pass.

## Candidate File Set — To Confirm Before Implementation

| Path | Change | Necessity after correction | Validation remote-write risk |
|---|---|---|---|
| `e2e/admin-organizations-scope.spec.ts` | New or extend existing admin spec | AuthJS canary negative coverage is absent | No for AuthJS container; Clerk variant may be remote-write |
| Existing nested route/DB test only if a concrete gap is found | Modify conditionally | Avoid duplicate containment coverage | No |
| `src/security/...` narrow scope-observability helper and affected organization routes | New/modify conditionally | Existing signals do not classify organization action denial/scoped miss safely | No |
| `scripts/...` guarded canary CLI | New | Manual, fail-closed Preview targeting is absent | Implementation no; `--apply` yes |
| `scripts/...` rollback assessment helper and runbook | New | Existing deploy flow lacks candidate/ancestry assessment | Implementation no; remote inspection/smoke yes |
| `.github/workflows/preview-deploy.yml` | No change by default | Automatic per-PR fixture mutation is prohibited | N/A |
| New workflow file | Only if later justified | Do not create merely to wrap a script | Would be remote-capable |

## Validation Contract

1. Local/static: guard parsing, target mismatch, metadata mismatch, ancestry
   failure, schema/env incompatibility, and telemetry-redaction cases.
2. Unit: route/helper behavior and fixed-cardinality signal shape.
3. Real PostgreSQL/Testcontainers: only newly confirmed nested DB-boundary
   cases; do not repeat existing organization containment cases.
4. Local E2E: AuthJS container scenario; Clerk only after confirming that the
   selected path does not mutate remote fixtures or after explicit approval.
5. Preview canary: not authorized.
6. Production validation or traffic switching: not authorized.

## Remote-Operation Inventory

- Clerk test-user creation, repair, reconciliation, and deletion:
  REMOTE-WRITE / REQUIRES EXPLICIT OPERATOR APPROVAL.
- Clerk organization and membership mutation/cleanup:
  REMOTE-WRITE / REQUIRES EXPLICIT OPERATOR APPROVAL.
- Neon Preview fixture setup, mutation, or cleanup:
  REMOTE-WRITE / REQUIRES EXPLICIT OPERATOR APPROVAL.
- `pnpm neon:preview:check -- --cleanup-obsolete`: REMOTE-WRITE because it may
  delete an obsolete Preview branch.
- Vercel Preview deployment or a branch-scoped environment change for canary
  configuration: REMOTE-WRITE / REQUIRES EXPLICIT OPERATOR APPROVAL.
- Candidate inspection, remote smoke, and deployment metadata fetch: remote
  access; separately authorized before execution.
- `vercel promote` and `vercel rollback`: production traffic change / requires
  explicit production authorization.

## Progress

- [x] Confirmed clean baseline and containment-floor ancestry.
- [x] Read OZI-78 in Linear without modifying it.
- [x] Completed initial source reconnaissance.
- [x] Incorporated coordinator Gate A corrections into this plan.
- [x] Complete the targeted nested-surface evidence review; no additional
      nested DB-boundary test was warranted.
- [x] Establish and apply Slice A1 architecture, auth/runtime, and validation
      constraints before implementation.
- [x] Complete Slice A1 local AuthJS containment implementation and validation.
- [x] Obtain explicit approval before any remote-capable validation or action.

REVISED RECOMMENDATION:
SLICE A1 COMPLETE — READY FOR COORDINATOR REVIEW OF A2 PLANNING
