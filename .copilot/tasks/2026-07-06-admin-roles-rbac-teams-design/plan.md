# Plan

## Objective

- Determine the best delivery shape for the next Administration step in AuthJS: `Roles`, `RBAC & Policies`, and `Teams`.
- Decide whether these should be designed as one connected feature slice or as separate tracks.
- Produce an architecture and security-backed recommendation before implementation.

## Task Classification

- Type: design review / workflow orchestration
- Area: administration, authorization, tenancy, AuthJS
- Expected specialists: Leantime Integration, Architecture Guard, Security & Auth

## Current Hypothesis

- These three surfaces are tightly connected in the data model and trust model, but they are not the same implementation slice.
- The most likely safe approach is one integrated design package with staged implementation, rather than three independent feature designs or one fully merged delivery.

## Checklist

- [x] Read repository orchestration and artifact rules
- [x] Read current admin surface and authorization baseline docs
- [x] Create task workspace and control artifacts
- [x] Open Leantime task for this review
- [x] Run Architecture Guard review
- [x] Run Security & Auth review
- [x] Consolidate constraints into a single recommendation
- [x] Update artifacts with final decision and residual risks
- [x] Finish the Phase 1 Organizations design package with implementation-ready API contracts and ResponseService rules
- [x] Close Leantime task

## Likely Affected Areas

- `src/app/admin/page.tsx`
- `src/app/admin/layout.tsx`
- `src/modules/authorization/**`
- `src/modules/provisioning/**`
- `src/core/contracts/**`
- relevant docs under `docs/features/` and `docs/feature-desings/`

## Risks / Unknowns

- Existing repository baseline is organization-scoped for roles and policies but does not yet define a separate team model.
- A premature `Teams` UX could hard-code organizational semantics that later conflict with a future real team model.
- A premature `Roles` UX could leak authorization editing into UI before server-side enforcement and invariants are stabilized.
- A premature `RBAC & Policies` UX could expose high-blast-radius policy editing before role lifecycle and membership semantics are fixed.
- AuthJS admin work already depends on the current bootstrap/admin guard model; new admin surfaces must preserve that enforcement path.

## Artifacts

- `plan.md`
- `intake.md`
- `constraints.md`
- `implementation-plan.md`
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `validation-report.md`

## Status

- Completed: architecture and security reviews align on integrated design with staged implementation.
- Completed: the Phase 1 Organizations slice is now design-complete, including page scope, route strategy, API envelopes, handler expectations, and error semantics.
- Completed: the organization detail, nested invitations, and nested roles routes are now implemented under the existing admin guard and ResponseService pattern.
- Completed: role lifecycle now includes create, rename, and guarded delete for custom roles in organization scope.
- Completed: the first organization-scoped RBAC & Policies mutation now exists as a constrained policy-create flow under `/admin/organizations/[organizationId]/rbac`.
- Completed: the next real protected capability now exists beyond policy CRUD; organization status mutation is available from the detail route and guarded by `tenant:update`.
- Completed: flat admin hub drift has been reduced by routing Roles, RBAC & Policies, and Invitations cards through the canonical Organizations entry point.
- Completed: focused AuthJS admin Playwright coverage now passes for canonical hub routing, organization archive/restore, members role reassignment, archived-state disablement, and last-owner protection.
- Completed: focused nested invitation route tests now pass for canonical organization-scoped create/revoke behavior.
- Completed: dedicated real-DB role lifecycle validation now passes for duplicate-name, reserved-name, protected-role, membership-bound, and pending-invitation deletion guards.
- Completed: focused browser proof now passes for sending and revoking a pending invitation from the canonical nested invitations page.
- Completed: Leantime tracking is now synchronized under milestone `72` (`Leantime Artifact Hygiene And Full Audit`) with task `84` (`Deliver admin organizations RBAC and memberships`), closed with `6.00 h` logged on `2026-07-12`.
- Completed: security-blocker remediation landed for invitation log hygiene and archived-organization write freezing across nested roles, invitations, and policies routes, with focused route and service tests passing.
- Completed: secure server actions now enforce mandatory replay tokens with nonce reuse protection; the showcase caller and focused unit/integration tests were updated to prove the fail-closed contract.
- Completed: the pre-existing `modules -> app` boundary violation in `src/modules/auth/ui/authjs/UserAvatarMenu.tsx` was fixed by extracting `DEFAULT_APP_ENTRY_URL` to `src/shared/lib/routing/default-app-entry.ts`.
- Completed: `pnpm arch:lint` now passes after the boundary fix, so the remaining architecture release gate for this slice is closed.
- Completed: replay-token creation now lives in a client-safe module, while replay validation and nonce persistence remain in the explicitly server-only replay-store module.
- Completed: Security & Auth re-review approved the reviewed admin/RBAC/replay-boundary slice for production readiness, contingent on normal release gates and production Upstash replay-store env being configured.
- Completed: Validation Strategy re-review approved the current validation package for release readiness; focused replay unit/integration tests, lint, typecheck, architecture lint, import-graph scans, sensitive-artifact scans, and operator-provided production build evidence are all available.
