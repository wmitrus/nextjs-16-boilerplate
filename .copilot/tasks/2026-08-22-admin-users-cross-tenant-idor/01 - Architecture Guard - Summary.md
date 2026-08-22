# 01 - Architecture Guard - Summary

## Task Context

- Task ID: `2026-08-22-admin-users-cross-tenant-idor`
- Task Objective: Verify the tenant-scoping fix does not introduce module-boundary or dependency-direction drift.
- Current Run Scope: new `DrizzleAdminUsersService`, new `membershipsReferenceTable`, and the resulting `user` module's ability to query `memberships`-derived scope without depending on the `authorization` module.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- modules / layers reviewed: `src/modules/user/infrastructure/drizzle/*`, `src/modules/authorization/infrastructure/drizzle/schema.ts`, `src/core/db/schema/references.ts`
- change surface reviewed: the new admin service's need to test tenant membership (owned by `authorization`) from within the `user` module
- architecture questions in scope: does `user -> authorization` become a real dependency; is the existing "admin service, not DI-registered repository" pattern (established by `DrizzleFeatureFlagAdminService`) the right shape here too

## Inputs Reviewed

- code paths reviewed: `src/core/db/schema/references.ts` (pre-existing `usersReferenceTable`/`organizationsReferenceTable`/`tenantsReferenceTable` pattern), `src/modules/authorization/infrastructure/drizzle/schema.ts` (real `membershipsTable`), `src/core/db/migrations/config/drizzle.dev.ts` (migration schema glob)
- docs / ADRs / prompts reviewed: `docs/ai/general/REPOSITORY_AI_CONTEXT.md` (Module Structure / dependency direction table), `.copilot/tasks/2026-08-20-admin-feature-flags-gui/01 - Architecture Guard - Summary.md` (precedent for "admin service mirrors `DrizzleAdminOrganizationsMutationService`, not a DI repository")
- earlier task artifacts reviewed: as above

## Actions Performed

- repository inspection performed: confirmed `src/core/db/schema/references.ts` already exists precisely to let one module's Drizzle schema declare an FK/join target against another module's real table without importing that module's schema file — used today by `organizations`/`memberships` (in `authorization`) to reference `usersReferenceTable`/`tenantsReferenceTable`/`organizationsReferenceTable` (all owned elsewhere).
- boundary checks performed: verified the new `membershipsReferenceTable` addition to that same file is symmetric with the existing pattern — a minimal-column `pgTable` mirror of a table owned by a different module (`authorization`'s `memberships`), used only for building a join predicate, never imported by `authorization` itself.
- dependency / DI review performed: confirmed `DrizzleAdminUsersService` imports only `@/core/db`, `@/core/db/schema/references`, and its own module's `./schema` — no import from `@/modules/authorization/**`. Dependency direction stays `modules -> core`, exactly as `REPOSITORY_AI_CONTEXT.md` requires; no new `user -> authorization` edge was created. Confirmed via `pnpm skott:check:only` (no circular dependencies) after the change.
- docs-vs-code checks performed: confirmed `drizzle.dev.ts`'s migration glob (`./src/modules/**/infrastructure/drizzle/schema.ts`) does not include `src/core/db/schema/references.ts` — the new reference table is query-only and will never be picked up by `drizzle-kit generate`, matching the existing reference tables' behavior (no migration drift risk).

## Current-State Findings

- Confirmed: the fix introduces zero new cross-module dependency edges. `DrizzleAdminUsersService` stays inside the `user` module's ownership, `membershipsReferenceTable` stays inside `core` (a neutral, already-established location for exactly this kind of cross-module join reference).
- Confirmed: the "new admin-only service, not a DI-registered repository" shape matches the precedent set for `DrizzleFeatureFlagAdminService` (itself explicitly documented as mirroring `DrizzleAdminOrganizationsMutationService`) — this repository already has an established convention for admin CRUD surfaces that need broader query shapes than their domain-level DI-registered counterparts.
- Risks: none identified. The alternative considered (adding a scope parameter directly to `UserRepository`) was rejected precisely because it would have coupled a widely-used self-service contract to an admin-only concern — the chosen shape avoids that.
- Drift: none.

## Boundary And Dependency Assessment

- module ownership assessment: `user` module owns `usersTable` and now `DrizzleAdminUsersService`; `authorization` module owns `membershipsTable` (untouched); `core` owns the new `membershipsReferenceTable` (a read-only mirror, not a second source of truth for the table's real schema/migrations).
- dependency direction assessment: `modules/user -> core` only (unchanged shape); no reverse or lateral module dependency introduced.
- DI / composition assessment: `DrizzleAdminUsersService` is deliberately NOT registered in the DI container, consistent with `DrizzleFeatureFlagAdminService` — constructed directly at the route-handler call site with a container-resolved `DrizzleDb`.
- cross-module coupling assessment: the only "coupling" is at the physical-table level (both `usersReferenceTable`-style tables and the real tables point at the same Postgres tables) — this is the same accepted tradeoff the repo already made for `usersReferenceTable`/`organizationsReferenceTable`/`tenantsReferenceTable`, not a new category of risk.

## Architectural Decisions / Constraints

- approved architectural constraints: new cross-module join needs must go through a `core/db/schema/references.ts`-style reference table, never a direct import of another module's real schema file. Admin-only CRUD surfaces needing DB shapes beyond a DI-registered domain repository's contract should be new, directly-instantiated services (not DI-registered), following the `DrizzleFeatureFlagAdminService` precedent.
- rejected directions: adding `authorization` as a dependency of `user` (or vice versa) to share the real `membershipsTable` object directly — rejected as an unnecessary new module coupling when the existing reference-table pattern already solves this.
- follow-up architectural guardrails: none new: the reference-table pattern and admin-service pattern were already established; this task is a second confirming use of both, not a new precedent.

## Artifact Synchronization

- `plan.md` updates: architecture review step marked complete.
- `intake.md` updates: none required.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: none.
- blockers: none.
- evidence still needed: none — `pnpm skott:check:only` and `pnpm depcheck` both pass clean after the change.

## Handoff Notes

- what the next agent should rely on: the reference-table + admin-service patterns are safe to reuse for any future admin surface needing a similar cross-module scoping join.
- what should not be re-decided without new evidence: the decision not to add `tenant_id`/`organization_id` directly to `usersTable` (a larger, unrelated schema change not required by this fix).
- recommended next specialist or step: Validation Strategy, then Implementation (both already run — see their summaries).

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Conditional architecture review for this security incident (new cross-module join reference introduced).
- Summary of change: Confirmed no new module dependency edges; confirmed the reference-table and non-DI-registered-admin-service patterns are correctly reused, not newly invented.
- Sections refreshed: all.
