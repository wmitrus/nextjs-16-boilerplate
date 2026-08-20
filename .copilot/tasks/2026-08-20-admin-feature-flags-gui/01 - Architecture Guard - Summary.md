# 01 - Architecture Guard - Summary

## Task Context

- Task ID: 2026-08-20-admin-feature-flags-gui
- Task Objective: Build the admin GUI for Feature Flags management at `/admin/feature-flags`
- Current Run Scope: Design review before implementation (safe-feature-workflow Step 2)
- Status: COMPLETED
- Last Updated: 2026-08-20
- Related Control Artifacts: `plan.md`, `intake.md`

## Scope Handled

- modules / layers reviewed: `src/core/contracts/feature-flags.ts`,
  `src/modules/feature-flags/**`, `src/core/contracts/resources-actions.ts`,
  `src/modules/authorization/infrastructure/drizzle/**` (admin service
  precedent + seed wiring)
- change surface reviewed: proposed new admin CRUD service, new
  RESOURCES/ACTIONS entries, new route handlers, new RSC page
- architecture questions in scope: where admin CRUD logic should live;
  whether adding admin methods to `FeatureFlagService` is safe; whether a
  new RESOURCES entry requires seed-data changes

## Inputs Reviewed

- code paths reviewed: `src/core/contracts/feature-flags.ts`,
  `src/modules/feature-flags/infrastructure/drizzle/{schema,DrizzleFeatureFlagService}.ts`,
  `src/modules/feature-flags/factory.ts`, `src/core/contracts/resources-actions.ts`,
  `src/modules/authorization/infrastructure/drizzle/seed.ts`,
  `src/modules/authorization/infrastructure/drizzle/DrizzleAdminOrganizationsMutationService.ts`,
  `src/app/api/admin/users/route.ts`, `src/core/env.ts` (FEATURE_FLAG_PROVIDER)
- docs / ADRs / prompts reviewed: `docs/features/24 - Feature Flags.md`,
  `docs/features/35 - Admin User Management.md`
- earlier task artifacts reviewed: none (first specialist pass)

## Actions Performed

- repository inspection performed: confirmed `FeatureFlagService` has only
  `isEnabled()`; confirmed `featureFlagsTable` schema already supports full
  CRUD; confirmed no `RESOURCES.FEATURE_FLAG` exists
- boundary checks performed: verified `DrizzleAdminOrganizationsMutationService`
  has no `core/contracts` entry or DI token (direct instantiation), contrasted
  with `UserRepository`'s DI-registered, single-implementation shape
- dependency / DI review performed: traced `createFeatureFlagService()` →
  confirmed all 3 adapters are wrapped uniformly by `ResilientFeatureFlagService`
  and share the `FeatureFlagService` contract exactly — no adapter exposes
  admin operations today
- docs-vs-code checks performed: `docs/features/24 - Feature Flags.md`
  matches code exactly; no drift found

## Current-State Findings

- Confirmed: backend (contract, 3 adapters, table, migrations, CLI) is
  complete and out of scope for this task
- Confirmed: two inconsistent existing precedents for admin-CRUD placement
  (Users: bolted onto DI-registered repo; Organizations/RBAC: separate,
  directly-instantiated, non-DI service)
- Risks: widening `FeatureFlagService` would force meaningless
  implementations on `StaticFeatureFlagService`/`GrowthBookFeatureFlagService`
  and contradicts the documented fail-safe guarantee; admin mutations would
  be silently inert whenever `FEATURE_FLAG_PROVIDER != 'db'` if not surfaced
  in the UI
- Drift: none relevant to this task

## Boundary And Dependency Assessment

- module ownership assessment: new admin service belongs in
  `src/modules/feature-flags/infrastructure/drizzle/`, alongside
  `DrizzleFeatureFlagService` but as a separate class
- dependency direction assessment: unaffected — new service depends only on
  `DrizzleDb` and the existing schema, same as the runtime service
- DI / composition assessment: new service should NOT get a `core/contracts`
  interface or container token — single implementation, operator-only,
  mirrors the Organizations/RBAC admin services exactly
- cross-module coupling assessment: none introduced; route handlers
  instantiate the service directly, same pattern as
  `src/app/api/admin/organizations/*`

## Architectural Decisions / Constraints

- approved architectural constraints:
  1. New `DrizzleFeatureFlagAdminService`, separate from
     `DrizzleFeatureFlagService`, no contract/DI token, directly
     instantiated at the route-handler call site
  2. `FeatureFlagService` and all 3 adapters remain untouched
  3. New `RESOURCES.FEATURE_FLAG` + `ACTIONS.FEATURE_FLAG_READ`/`_MANAGE`,
     wired into `seed.ts`'s existing role policy blocks
  4. Admin page must read `env.FEATURE_FLAG_PROVIDER` and must not present
     mutations as meaningful when the active provider isn't `db`
- rejected directions: extending `FeatureFlagService` with admin methods
  (Users precedent) — rejected because it breaks adapter substitutability
- follow-up architectural guardrails: none beyond the above; this is a
  contained, low-blast-radius addition once the placement decision is
  respected

## Artifact Synchronization

- `plan.md` updates: Architecture Guard section added with binding
  constraints; task list checkbox marked done
- `intake.md` updates: constraints section reflects this decision
- `implementation-plan.md` updates: not yet created (created at
  Implementation stage if the constraint summary warrants a scenario-level
  checklist)
- specialist artifact updates: n/a (first specialist pass)

## Open Questions / Blockers

- unresolved questions: none blocking further review
- blockers: none
- evidence still needed: Security/Auth sign-off on the resource/action
  naming and seed-data change (this agent's authority ends at structural
  placement, not ABAC policy correctness)

## Handoff Notes

- what the next agent should rely on: the 4 binding constraints above are
  settled; do not re-litigate the admin-service placement decision without
  new evidence
- what should not be re-decided without new evidence: whether to extend
  `FeatureFlagService` (settled: no)
- recommended next specialist or step: Security & Auth review, specifically
  the `RESOURCES.FEATURE_FLAG`/`ACTIONS.FEATURE_FLAG_*` naming, the
  `seed.ts` wiring, and confirmation that the `isEnvBasedPlatformAdmin` OR
  `AuthorizationService.can()` gating shape is sufficient with no
  additional trust-boundary risk specific to feature flags (e.g. whether a
  compromised admin session toggling flags has blast radius considerations
  beyond what Users/Organizations admin already accept)

## Update Log

### Update Entry

- Date: 2026-08-20
- Trigger: Initial Architecture Guard review for safe-feature-workflow Step 2
- Summary of change: First and only pass; GO with 4 binding constraints
- Sections refreshed: all
