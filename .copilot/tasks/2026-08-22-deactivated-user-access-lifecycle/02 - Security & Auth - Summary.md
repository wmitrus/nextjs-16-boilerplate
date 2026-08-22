# 02 - Security & Auth - Summary

## Task Context

- Task ID: `2026-08-22-deactivated-user-access-lifecycle`
- Task Objective: Close the lifecycle authorization gap where `deactivatedAt` is never enforced.
- Current Run Scope: `evaluateNodeProvisioningAccess`, `createSecurityContext`, and their direct consumers.
- Status: COMPLETED
- Last Updated: 2026-08-22
- Related Control Artifacts: `intake.md`, `plan.md`, `04 - Implementation Agent - Summary.md`, `docs/ai/general/SECURITY_CODING_PATTERNS.md` (SEC-33)

## Scope Handled

- auth surfaces reviewed: `evaluateNodeProvisioningAccess` (`node-provisioning-access.ts`), `createSecurityContext` (`security-context.ts`), `with-node-provisioning.ts`, `secure-action.ts`, `src/security/middleware/with-auth.ts` (reviewed, not modified — see below)
- authorization surfaces reviewed: the full readiness-status/deny-code contract each evaluator exposes to its consumers
- trust-boundary questions in scope: is "user record exists and is onboarded" sufficient to grant access, or must account lifecycle state (`deactivatedAt`) also be checked; are there multiple independent places that need to agree on this

## Inputs Reviewed

- code paths reviewed: `src/security/core/node-provisioning-access.ts`, `src/security/api/with-node-provisioning.ts`, `src/security/core/security-context.ts`, `src/security/actions/secure-action.ts`, `src/security/middleware/with-auth.ts`, `src/proxy.ts`, `src/core/contracts/provisioning-access.ts`, `src/app/{dashboard,admin,users}/layout.tsx`, `src/app/admin/organizations/**/*.tsx`
- security/auth docs reviewed: `docs/ai/general/SECURITY_CODING_PATTERNS.md`, `docs/features/35 - Admin User Management.md`, `AGENTS.md` Auth/Tenancy non-negotiables
- earlier task artifacts reviewed: Case 1's artifacts (`.copilot/tasks/2026-08-22-admin-users-cross-tenant-idor/`) for the established multi-case-series conventions

## Actions Performed

- identity flow tracing performed: confirmed `identityProvider.getCurrentIdentity()` → `userRepository.findById(identity.id)` is the shared shape both evaluators start from, then diverge into independent readiness-status computations.
- authorization enforcement review performed: confirmed neither evaluator read `user.deactivatedAt` before this fix, despite both already having the full `User` row (including `deactivatedAt`) in hand from the same `findById()` call used for the onboarding check two lines later.
- tenant / org context review performed: confirmed the deactivation check must run _before_ tenant/membership resolution (not after) — a deactivated user in an org-db tenant with an already-revoked membership would otherwise surface as `TENANT_MEMBERSHIP_REQUIRED`, a misleading status that implies "ask to be re-invited" rather than "your account is disabled."
- sensitive-data exposure review performed: the deny message (`'This account has been deactivated.'`) and code (`ACCOUNT_DISABLED`) are appropriately specific for this case — unlike Case 1's admin-users cross-tenant fix, there is no cross-tenant enumeration concern here (the caller already knows their own account was deactivated; this is not information disclosure about another party).

## Current-State Findings

- Confirmed: the vulnerability is real for both evaluators, not just the one the report named. `evaluateNodeProvisioningAccess` gates every protected API route (via `withNodeProvisioning`) and every protected RSC layout/page (`dashboard`, `admin`, `users`, all `admin/organizations/**` pages — all confirmed by direct grep to call it, and all confirmed to already have a working generic `FORBIDDEN`/`!== 'ALLOWED'` deny path). `createSecurityContext` independently gates every Server Action built on `createSecureAction` and had the identical gap with its own, separately-typed `ReadinessStatus` enum.
- Confirmed: `src/security/middleware/with-auth.ts` (the edge-level gate run from `src/proxy.ts`) has its own onboarding-completeness check (`resolveOnboardingComplete`) that also never checks `deactivatedAt`, and also performs a real ABAC route-access authorization step (`authorizeRouteAccess`) that can independently 403/redirect for API/page routes. Reviewed in full: it does not itself serve protected content or complete a mutation — every branch either denies or calls `handler(req, ctx)`, which proceeds to the actual Next.js route/page/Server Action, which always re-verifies through one of the two node-level evaluators fixed in this case. Its own onboarding check falls back to a client-supplied cookie heuristic in Edge runtime (no DB access there), confirming this layer is architecturally not meant to be authoritative for a DB-backed lifecycle flag. Not modified; logged as `PE-03` (fail-fast polish only, not a security requirement).
- Risks: none remaining after the fix — verified via direct unit tests against both evaluator functions (not against mocks of them), proving the actual branching logic denies a deactivated user, including the ordering guarantee against a simultaneously-incomplete onboarding state.
- Drift: none introduced. Confirms the repository's own architecture doctrine ("do not treat middleware as sufficient protection... server-side enforcement is mandatory") in practice: the edge gate is genuinely non-authoritative, and the two node-level evaluators are correctly where enforcement lives — this task closes both of them.

## Trust Boundary Assessment

- where identity is established: unchanged — `identityProvider.getCurrentIdentity()`, upstream of both evaluators.
- where authorization is enforced: now, correctly, at the point the `User` row is first available in each evaluator — before any decision that could grant access, and before onboarding/tenant/membership branches that could otherwise mask the real reason for denial.
- where tenant or org context is derived: unchanged — this fix runs strictly before tenant resolution in both evaluators, so it has no interaction with tenant-context derivation.
- what claims or inputs are trusted: `user.deactivatedAt`, freshly read from the database on every call (no caching across requests in either evaluator) — this is precisely what makes the fix effective against a still-valid session/JWT.

## Sensitive Data And Exposure Notes

- logging / telemetry review: no new logging added directly in the evaluators (they return structured outcomes; existing consumers already log `status`/`code`/`diagnostics.reason` at their own call sites — e.g. `with-node-provisioning.ts`'s `logger.warn`, the RSC layouts' `logger.info` — and now correctly surface `ACCOUNT_DISABLED`/`account_disabled` through those same existing log statements with no changes needed there).
- response exposure review: the `ACCOUNT_DISABLED` message is deliberately specific ("This account has been deactivated") since, unlike Case 1, there is no cross-party information disclosure risk — the caller is being told about their own account's own state.
- client exposure review: none — no client-side code changed.
- cache exposure review: neither evaluator caches its outcome; both are called fresh per request (already true before this fix, unchanged).

## Security Decisions / Constraints

- approved controls or constraints:
  - The deactivation check must run in **every** independent evaluator that turns a `User` lookup into an access decision, not just the one named in the report. This case fixed both known evaluators (`evaluateNodeProvisioningAccess`, `createSecurityContext`).
  - The check must run before onboarding/tenant/membership branches in each evaluator.
  - `evaluateNodeProvisioningAccess` reuses the existing `FORBIDDEN` status (new `code: 'ACCOUNT_DISABLED'` only) so every existing consumer's deny-handling picks it up with zero consumer-side code changes. `createSecurityContext`'s `ReadinessStatus` enum has no equivalent shared "forbidden" bucket, so a new `'ACCOUNT_DISABLED'` value was added there, requiring one matching `case` in `secure-action.ts`'s switch (its only consumer).
  - IdP-side session revocation is explicitly **not** required to close this vulnerability, given this repo's AuthJS integration uses the JWT strategy (no server-side session store) — the per-request DB check is the revocation mechanism. Logged as `PE-02` rather than implemented, per the same low-blast-radius reasoning documented in SEC-33.
- rejected directions:
  - Rejected: introducing a brand-new top-level status value in `evaluateNodeProvisioningAccess` instead of reusing `FORBIDDEN`. Every consumer already has a correct `FORBIDDEN`/`!== 'ALLOWED'` catch-all; a new status would have required touching every one of those ~9 consumer files individually, with real risk of missing one and silently reopening the gap there.
  - Rejected: modifying `src/security/middleware/with-auth.ts` in this same change. It is not authoritative for this decision (see Current-State Findings), and touching it would mix an unrelated edge-runtime concern (cookie-based onboarding heuristics, ABAC route-access policy) into a lifecycle-authorization fix. Logged as `PE-03`.
  - Rejected: implementing Clerk/AuthJS session revocation as part of this fix. A materially larger, separable feature; logged as `PE-02`.
- required enforcement points: `src/security/core/node-provisioning-access.ts`, `src/security/core/security-context.ts`.

## Artifact Synchronization

- `plan.md` updates: workflow step sequence and gate results recorded.
- `intake.md` updates: scope and acceptance criteria recorded.
- `implementation-plan.md` updates: not used for this workflow.
- specialist artifact updates: `docs/ai/general/SECURITY_CODING_PATTERNS.md` — new SEC-33 entry; `docs/ai/general/POSSIBLE_ENHANCEMENTS.md` — PE-02, PE-03, PE-04 added.

## Open Questions / Blockers

- unresolved questions: whether the user wants PE-02 (IdP session revocation) prioritized given it was explicitly named in their original report text — surfaced for their triage, not decided unilaterally.
- blockers: none.
- evidence still needed: none — direct unit tests against both evaluator functions provide the strongest available proof without a live browser.

## Handoff Notes

- what the next agent should rely on: any future evaluator that resolves `identityProvider -> userRepository.findById -> access decision` must independently include this same `deactivatedAt` check — do not assume fixing one evaluator covers all of them (this repository has at least two, by design or by drift; grep for the pattern before declaring a lifecycle check complete).
- what should not be re-decided without new evidence: the decision not to add IdP-side revocation or edge-level duplication in this fix.
- recommended next specialist or step: none for this case — awaiting the user's next case in the audit series.

## Update Log

### Update Entry

- Date: 2026-08-22
- Trigger: Initial security review for this incident.
- Summary of change: Confirmed the reported gap in `evaluateNodeProvisioningAccess`, discovered an identical independent gap in `createSecurityContext` (Server Actions), reviewed and ruled out the edge-level proxy gate as non-authoritative, defined the fix shape, and added SEC-33.
- Sections refreshed: all.
