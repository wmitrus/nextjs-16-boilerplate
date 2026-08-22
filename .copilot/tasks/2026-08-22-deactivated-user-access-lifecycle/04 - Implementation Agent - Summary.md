# 04 - Implementation Agent - Summary

## Task Context

- Task ID: `2026-08-22-deactivated-user-access-lifecycle`
- Task Objective: Implement the lifecycle-authorization fix per the consolidated Security/Auth and Runtime constraints.
- Current Run Scope: as listed in Files Changed below.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `02 - Security & Auth - Summary.md`, `03 - Next.js Runtime - Summary.md`, `05 - Validation Strategy - Summary.md`

## Scope Handled

- modules / files changed: see Files Changed.
- implementation goals in scope: deny access for a deactivated user in both independent central evaluators; keep every existing consumer's deny-handling path unchanged where possible.
- constraints applied: all constraints from `02 - Security & Auth - Summary.md` (check before onboarding/tenant/membership, reuse existing status where a shared deny bucket exists, no IdP revocation, no edge-proxy changes).

## Inputs Reviewed

- code paths reviewed: `src/security/core/node-provisioning-access.ts`, `src/security/api/with-node-provisioning.ts`, `src/security/core/security-context.ts`, `src/security/actions/secure-action.ts`, `src/core/contracts/provisioning-access.ts`, `src/app/dashboard/layout.tsx`, `src/security/middleware/with-auth.ts` (reviewed, not modified)
- upstream specialist artifacts reviewed: `02`, `03`, `05` (this task's own).
- earlier implementation notes reviewed: Case 1's `04 - Implementation Agent - Summary.md`.

## Actions Performed

- code changes made: see Files Changed.
- tests or supporting files updated: see Files Changed.
- focused validation executed: `pnpm typecheck`, `pnpm lint --fix`, targeted `vitest run` on the six changed test files, `pnpm test` (full unit suite), `pnpm test:db` (full DB suite, unaffected), `pnpm skott:check:only`, `pnpm depcheck`, `pnpm env:check` — all green (see `plan.md`).

## Files Changed

- production files:
  - `src/security/core/node-provisioning-access.ts` — added `'account_disabled'` to `UsersGuardDecisionReason`, `'ACCOUNT_DISABLED'` to `NodeProvisioningDenyCode`; added the `user.deactivatedAt` check (returns `{ status: 'FORBIDDEN', code: 'ACCOUNT_DISABLED', ... }`) immediately after the user lookup, before the onboarding-completeness check
  - `src/security/api/with-node-provisioning.ts` — `mapProvisioningDenyToApiResponse` now returns a specific `403 ACCOUNT_DISABLED` response (message: "This account has been deactivated") when `outcome.status === 'FORBIDDEN' && outcome.code === 'ACCOUNT_DISABLED'`, instead of falling through to the generic `403 FORBIDDEN`
  - `src/core/contracts/provisioning-access.ts` — added `'ACCOUNT_DISABLED'` to `ProvisioningApiErrorCode`
  - `src/security/core/security-context.ts` — added `'ACCOUNT_DISABLED'` to `ReadinessStatus`; added the equivalent `user.deactivatedAt` check before the onboarding-completeness check
  - `src/security/actions/secure-action.ts` — added `{ status: 'account_disabled' }` to the action result union; added the matching `case 'ACCOUNT_DISABLED'` in the readiness-status switch
- test files:
  - `src/security/core/node-provisioning-access.test.ts` — two new cases: deactivated user denied; deactivated-and-onboarding-incomplete user still gets `ACCOUNT_DISABLED` (ordering proof), both also asserting the tenant resolver is never reached
  - `src/security/api/with-node-provisioning.test.ts` — one new case: `403`/`ACCOUNT_DISABLED` response for the API route wrapper
  - `src/app/dashboard/layout.test.tsx` — one new case: a deactivated user is redirected to `/` (proves the existing generic `FORBIDDEN` redirect branch, unmodified, correctly fires for the new code)
  - `src/security/core/security-context.test.ts` — two new cases, mirroring the `node-provisioning-access.test.ts` pair, for the independent Server Action evaluator
  - `src/security/actions/secure-action.test.ts` — one new row in the existing readiness-status `it.each` table (`['ACCOUNT_DISABLED', 'account_disabled']`)
- docs / artifact files:
  - `docs/ai/general/SECURITY_CODING_PATTERNS.md` — new SEC-33 entry + Pattern Index row
  - `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-02, PE-03, PE-04 added
  - `docs/features/35 - Admin User Management.md` — deactivation section updated to describe actual access enforcement
  - `.copilot/tasks/2026-08-22-deactivated-user-access-lifecycle/*` — this artifact set

## Behavior Change Summary

- previous behavior: a user with `deactivatedAt` set retained full access to every protected API route, RSC page, and Server Action for as long as their session/JWT remained valid — deactivation only affected data shown in the admin panel, not actual access.
- new behavior: the very next request from a deactivated user, through any of the three surfaces (API route via `withNodeProvisioning`, RSC page/layout, Server Action via `createSecureAction`), is denied — `403 ACCOUNT_DISABLED` for API routes and Server Actions, a redirect to `/` for RSC layouts (via the existing generic `FORBIDDEN` handling, unmodified). This is checked before onboarding/tenant/membership, so a deactivated account always gets the deactivation-specific deny regardless of its other state.
- intentional non-changes: no IdP-side (Clerk/AuthJS) session revocation call was added (`PE-02`); `src/security/middleware/with-auth.ts`/`src/proxy.ts` were reviewed but not modified (`PE-03`); no new Playwright E2E was added (`PE-04`).

## Implementation Decisions / Constraints

- implementation choices made: reused the existing `FORBIDDEN` status in `evaluateNodeProvisioningAccess` (new `code` only) so all ~9 existing consumers pick it up automatically; added a genuinely new `ReadinessStatus` value in `security-context.ts` since that enum has no equivalent shared "forbidden" bucket, requiring exactly one new `switch` case in its one consumer (`secure-action.ts`).
- constraints preserved: check-before-onboarding/tenant/membership ordering in both evaluators; no caching of the outcome; no changes to `src/security/middleware/with-auth.ts`.
- tradeoffs accepted: this repository now has two independently-implemented central evaluators with duplicated identity/user/onboarding-resolution logic (a pre-existing structural fact, not introduced by this fix) — both needed the identical fix applied twice rather than once, which is real duplication risk for any _future_ lifecycle-style check. Not resolved here (would be a broader refactor, out of scope for a P1 fix); flagged in the Security & Auth summary's Handoff Notes as something a future agent must remember to check both places for.

## Validation Performed

- commands run: `pnpm typecheck`; `pnpm lint --fix`; targeted `vitest run` on the six changed test files; `pnpm test` (full unit suite, 218 files / 1578 tests, +7 new); `pnpm test:db` (full DB suite, 19 files / 160 tests, unchanged — no DB-layer code touched); `pnpm skott:check:only`; `pnpm depcheck`; `pnpm env:check`.
- results: all green — see `plan.md`'s gate table.
- validation not run: Playwright E2E (deliberately — see `05 - Validation Strategy - Summary.md` and `PE-04`).
- residual risk from validation gaps: no real-browser proof of session-level denial yet; acceptable per the Validation Strategy decision, with `PE-04` noted as an optional follow-up.

## Artifact Synchronization

- `plan.md` updates: implementation + gate results recorded.
- `intake.md` updates: none required beyond initial scope.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: none beyond this file.

## Open Questions / Blockers

- unresolved questions: none.
- blockers: none.
- follow-up needed: `PE-02`, `PE-03`, `PE-04` (see `docs/ai/general/POSSIBLE_ENHANCEMENTS.md`); the structural duplication between the two central evaluators (see Implementation Decisions tradeoffs) is worth the user's attention at some point but is not itself a security defect.

## Handoff Notes

- what the next agent should rely on: this fix is complete and gate-verified; ready to push for the user's PR/CI step.
- residual risks for review: see `plan.md` residual risks section and the duplication note above.
- recommended next specialist or step: none for this case — awaiting the user's next case in the audit series.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Implementation of the consolidated remediation constraints.
- Summary of change: Added the `deactivatedAt` lifecycle check to both `evaluateNodeProvisioningAccess` and `createSecurityContext`, wired the new codes through their respective consumer deny-mapping switches, added regression tests, updated docs.
- Sections refreshed: all.
