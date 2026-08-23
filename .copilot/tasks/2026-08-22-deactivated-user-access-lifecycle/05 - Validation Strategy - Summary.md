# 05 - Validation Strategy - Summary

## Task Context

- Task ID: `2026-08-22-deactivated-user-access-lifecycle`
- Task Objective: Decide the minimum validation that genuinely closes the lifecycle authorization gap.
- Current Run Scope: `node-provisioning-access.ts`, `security-context.ts`, and one representative consumer each.
- Mode: CHANGE VALIDATION
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `04 - Implementation Agent - Summary.md`

## Scope Handled

- change surfaces assessed: two evaluator functions, two consumer deny-mapping files (`with-node-provisioning.ts`, `secure-action.ts`), one representative RSC layout (`dashboard/layout.tsx`), one contract file (`provisioning-access.ts`)
- validation questions in scope: is direct unit coverage of the evaluator functions sufficient proof, or is real-browser/session-reuse proof required to call this closed
- excluded validation areas: IdP-side revocation (not implemented — `PE-02`); edge-proxy gate (not modified — `PE-03`)

## Inputs Reviewed

- code paths reviewed: as listed in `04 - Implementation Agent - Summary.md`
- tests / configs / workflows reviewed: `node-provisioning-access.test.ts`, `with-node-provisioning.test.ts`, `security-context.test.ts`, `secure-action.test.ts`, `dashboard/layout.test.tsx`, and Case 1's `05 - Validation Strategy - Summary.md` (precedent for this series' validation depth)
- earlier task artifacts reviewed: as above

## Actions Performed

- validation posture review performed: the defect is pure branching logic inside two already-tested pure(ish) evaluator functions — the strongest, most direct proof available is calling those functions with a deactivated-user fixture and asserting the returned status/code, exactly as every other branch in both functions is already tested.
- risk analysis performed: the two real risks are (a) missing the ordering guarantee (deactivation must win over onboarding-incomplete, not just be checked somewhere) and (b) a consumer not actually wiring the new code to a real deny response. Both are directly testable without a browser.
- test-level recommendations prepared: see below.
- command recommendations prepared: see below.

## Current-State Findings

- Confirmed: this repository's own precedent (Case 1, and this series generally) treats direct unit tests against the function where a vulnerability lives, plus one consumer-layer proof, as sufficient closure for an authorization defect — full Playwright E2E is treated as valuable additional confidence, tracked separately, not a blocker.
- Risks: none remaining. Both evaluators are covered by tests that construct real inputs and assert real outputs (no mocking of the function under test itself) — this is the highest-fidelity proof short of an actual HTTP/browser round trip.
- Drift: none.

## Validation-Risk Assessment

- primary risks: (a) the deactivation check landing after onboarding/tenant checks instead of before — mitigated by an explicit test asserting `ACCOUNT_DISABLED` wins even when onboarding is also incomplete, for both evaluators; (b) a consumer silently swallowing the new code instead of denying — mitigated by one direct consumer-layer test per evaluator (`with-node-provisioning.test.ts`'s new 403 case, `secure-action.test.ts`'s new table row, `dashboard/layout.test.tsx`'s new redirect case).
- confidence gaps: none remaining.
- over-validation or under-validation concerns: adding an equivalent unit test to every one of the ~9 RSC layout/page consumers of `evaluateNodeProvisioningAccess` was considered and rejected as over-validation — they all share one generic `FORBIDDEN`/`!== 'ALLOWED'` catch-all, already proven correct by the one representative test (`dashboard/layout.test.tsx`); duplicating that same assertion across every consumer file would not add real signal, only test-suite size.

## Recommended Validation Scope

- minimum required validation:
  - `pnpm typecheck`
  - `pnpm lint --fix`
  - `pnpm test` (evaluator-level + one representative consumer test per evaluator)
  - `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check`
- optional additional validation: a real-browser Playwright spec proving the full "login → deactivate → same cookie → deny across page/API/Server-Action" scenario — logged as `PE-04`.
- validation explicitly not required: no `pnpm test:db` changes (no DB-layer code changed in this case — `deactivatedAt`'s DB round-trip was already proven by Case 1's and the pre-existing `DrizzleUserRepository.db.test.ts`); no per-consumer-file test duplication beyond the one representative case per evaluator (see above).

## Validation Commands / Checks

- commands to run: `pnpm typecheck`, `pnpm lint --fix`, `pnpm test`, `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check` — all run in this session (see `plan.md`).
- environment prerequisites: none beyond the already-installed `pnpm install` from Case 1's session.
- expected evidence: all commands exit 0; `pnpm test` output includes the new SEC-33-labeled test cases across `node-provisioning-access.test.ts`, `with-node-provisioning.test.ts`, `security-context.test.ts`, `secure-action.test.ts`, and `dashboard/layout.test.tsx`.

## Artifact Synchronization

- `plan.md` updates: validation step marked complete; gate results table populated.
- `intake.md` updates: none required.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: whether the user wants `PE-04`'s real-browser proof prioritized, given it was the audit's explicitly named "most important E2E" — surfaced for their triage.
- blockers: none.
- dependencies on architecture / security / runtime decisions: none outstanding.

## Handoff Notes

- what the next agent should rely on: the gate results in `plan.md` are current and complete for this change.
- what should not be re-decided without new evidence: the decision that direct evaluator-level unit tests plus one representative consumer test per evaluator is sufficient, without duplicating the same assertion across every consumer file.
- recommended next specialist or step: Implementation (already run); this task is otherwise ready for the user's PR/CI step.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Validation-scope decision ahead of implementation sign-off.
- Summary of change: Decided direct evaluator-level tests plus one representative consumer test per evaluator is the minimum required and sufficient validation; documented why broader per-consumer duplication and full Playwright E2E are not required here.
- Sections refreshed: all.
