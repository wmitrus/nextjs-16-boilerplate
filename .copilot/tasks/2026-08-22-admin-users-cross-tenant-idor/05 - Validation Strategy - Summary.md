# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-08-22-admin-users-cross-tenant-idor`
- Task Objective: Decide the minimum validation that genuinely closes the cross-tenant IDOR/BOLA, and what's optional/not required.
- Current Run Scope: `/api/admin/users`, `/api/admin/users/[id]`, `DrizzleAdminUsersService`.
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- change surfaces assessed: two route handlers, one new admin service, one new core reference table, two rewritten route unit-test files, one new DB integration test file
- validation questions in scope: what layer must prove the fix closes the vulnerability; whether E2E browser proof is required to call this closed
- excluded validation areas: the other admin routes named in the audit's separate SEC-23 finding; the wider audit's other cases

## Inputs Reviewed

- code paths reviewed: as listed in `04 - Implementation Agent - Summary.md`
- tests / configs / workflows reviewed: `vitest.unit.config.ts`, `vitest.db.config.ts`, `e2e/admin-users.spec.ts`, `.copilot/tasks/2026-08-20-admin-feature-flags-gui/05 - Validation Strategy - Summary.md` (the precedent decision for the analogous SEC-26 fix)
- earlier task artifacts reviewed: as above

## Actions Performed

- validation posture review performed: confirmed the vulnerability lives entirely in the SQL predicate layer (does the query itself constrain by tenant membership) — not in rendering, hydration, or client-side routing, none of which need browser-level proof to validate a fix at this layer.
- risk analysis performed: the highest-value proof is a real Postgres-compatible DB test asserting a real seeded cross-tenant user is unreachable — weaker than that (fully mocked unit tests alone) would only prove the route _calls_ the service with the right arguments, not that the service's SQL actually enforces the boundary.
- test-level recommendations prepared: see below.
- command recommendations prepared: see below.

## Current-State Findings

- Confirmed: the precedent fix for the original SEC-26 occurrence (feature flags) closed that vulnerability with unit (route-handler) + real-DB integration tests only — no dedicated Playwright E2E cross-tenant spec was added there either. This repository's own established bar for "IDOR/BOLA closed" is unit + DB integration, not full E2E, for this class of finding.
- Risks: `e2e/admin-users.spec.ts` fully mocks `**/api/admin/users**` responses (`route.fulfill`) — it cannot and does not exercise real backend authorization/scoping at all, before or after this fix. It remains valid as UI-rendering proof only; it must not be cited as evidence for or against this fix.
- Drift: none.

## Validation-Risk Assessment

- primary risks: a fix that only changes route-handler wiring but not the underlying query would still pass naive route-level unit tests (if the mock doesn't assert query arguments) — mitigated by asserting exact scope arguments passed to the service in the route unit tests, AND independently proving the service's SQL enforces scoping against a real DB.
- confidence gaps: none remaining after the DB integration test suite (`DrizzleAdminUsersService.db.test.ts`) passed against real seeded two-tenant fixture data (`acme`/`globex`, `alice`/`bob`) with PGlite (a real Postgres-compatible engine, not a mock).
- over-validation or under-validation concerns: a dedicated Playwright E2E spec exercising two real authenticated sessions in different `org-db` tenants would add real-browser confidence but is a materially larger investment (new AuthJS/Clerk fixture wiring for a second tenant, `org-db` scenario runner) than this vulnerability's closure requires, and exceeds the precedent bar set by the original SEC-26 fix. Recommended as optional future hardening, not required here.

## Recommended Validation Scope

- minimum required validation:
  - `pnpm typecheck`
  - `pnpm lint --fix`
  - `pnpm test` (route-handler unit tests, including new SEC-26-labeled regression cases for both routes)
  - `pnpm test:db` (new `DrizzleAdminUsersService.db.test.ts`, proving real cross-tenant denial)
  - `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check`
- optional additional validation: a dedicated Playwright E2E spec with two real `org-db` tenant sessions proving cross-tenant denial in a real browser — logged as `PE-01` in `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` rather than restated here.
- validation explicitly not required: no change to `e2e/admin-users.spec.ts` (its mocked-response UI-rendering assertions are unaffected by this backend-only fix); no change to `DrizzleUserRepository.db.test.ts` (that repository's self-service contract and tests are untouched).

## Validation Commands / Checks

- commands to run: `pnpm typecheck`, `pnpm lint --fix`, `pnpm test`, `pnpm test:db`, `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check` — all run in this session (see `plan.md` for exact results).
- environment prerequisites: none beyond `pnpm install` (already done in-session) — DB tests use in-memory PGlite by default, no external Postgres/Testcontainers required locally.
- expected evidence: all commands exit 0; `pnpm test:db` output specifically shows the new `DrizzleAdminUsersService (real DB) — cross-tenant IDOR regression coverage` describe block passing, including the "does not mutate the row" / "returns null" assertions for cross-tenant attempts.

## Artifact Synchronization

- `plan.md` updates: validation step marked complete; gate results table populated.
- `intake.md` updates: none required.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: whether the user wants the optional real-browser E2E cross-tenant proof as a follow-up — surfaced in `plan.md` residual risks, not decided unilaterally.
- blockers: none.
- dependencies on architecture / security / runtime decisions: none outstanding — both prior specialist reviews are COMPLETED with no open constraints.

## Handoff Notes

- what the next agent should rely on: the gate results in `plan.md` are current and complete for this change.
- what should not be re-decided without new evidence: the decision that unit + real-DB integration tests (without a new Playwright spec) is sufficient to close this specific vulnerability, consistent with this repo's own precedent.
- recommended next specialist or step: Implementation (already run — see `04 - Implementation Agent - Summary.md`); this task is otherwise ready for the user's PR/CI step.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Validation-scope decision ahead of implementation sign-off.
- Summary of change: Decided unit + real-DB integration coverage is the minimum required and sufficient validation; documented why full Playwright E2E cross-tenant proof is optional follow-up, not required, consistent with this repo's own precedent for the same defect class.
- Sections refreshed: all.
