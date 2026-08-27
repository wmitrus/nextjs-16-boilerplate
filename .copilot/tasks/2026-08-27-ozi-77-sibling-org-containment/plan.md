# OZI-77 — Sibling-Organization Administration Containment

## Objective

Prevent a non-platform organization administrator from reading or mutating a sibling organization while preserving the existing explicit platform-admin path within the active tenant.

## Classification

- Primary workflow: Security Incident Workflow
- Severity: CRITICAL
- Incident status: SAFE TO REMEDIATE
- Linear issue: OZI-77
- Execution control: straight-through for local implementation; production rollout remains governed by OZI-78

## Affected Areas

- organization admin authorization helpers
- organization read and status mutation Drizzle services
- organization-scoped admin API routes
- organization admin Server Component pages
- route and real-database regression tests

## Specialist Sequence

- [x] Security/Auth pre-implementation review
- [x] Next.js Runtime review
- [x] Architecture Guard review
- [x] Validation Strategy
- [x] Implementation
- [x] Focused validation
- [x] Post-fix Security/Auth close-out
- [ ] Linear evidence and closure update (OZI-77 kept In Progress pending explicit user close; OZI-78 owns production rollout precondition)

## Known Risks

- A boolean admin result currently collapses platform and organization-scoped authority.
- The read service widens active-organization scope to every sibling under the same tenant.
- The status mutation service uses the same widening rule.
- Nested admin pages rely on the admin layout for action authorization, so their data loaders must still carry an explicit resource scope.
- A platform-admin compatibility path must remain explicit and server-derived.

## Artifacts

- `intake.md`
- `constraints.md`
- `implementation-plan.md`
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `validation-report.md`

## Progress

- [x] Confirmed the actor-to-SQL failure path on latest main.
- [x] Defined a discriminated server-derived admin organization scope.
- [x] Defined fail-closed and platform-admin compatibility behavior.
- [x] Defined required route and real-DB evidence.
- [x] Implement the approved scope contract and service predicates.
- [x] Update all in-scope callers.
- [x] Add sibling and cross-tenant negative tests.
- [x] Run required validation (route tests, PGlite DB tests, typecheck, changed-file lint, arch lint).
- [x] Recheck the final diff and close the incident locally (see `validation-report.md` and the Post-Fix Recheck in `02 - Security & Auth - Summary.md`).
