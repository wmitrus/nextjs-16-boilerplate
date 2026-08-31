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
  read) implemented and locally validated; full A4 remains blocked on
  separately authorized Production evidence and smoke
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

**Status: A4.2a controlled remote candidate DETAIL read implemented and locally
validated; full A4 remains blocked on separately authorized candidate/Production
evidence and smoke.** Default `rollback:assess` remains local-only and makes no
provider call. The explicit `--execute-remote-candidate-read` acknowledgement
permits exactly one bounded Vercel DETAIL GET for the already schema-validated,
operator-nominated deployment ID. Provider data is untrusted until the existing
production identity guard accepts it; environment, schema, smoke, and all
traffic-changing gates remain blocked/not authorized. No remote operation was
performed during implementation; Production remains untouched / not authorized.

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
