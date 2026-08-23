# Intake — Deactivated Users Retain Access (Case 2 of multi-case security audit)

## Source

User-supplied security audit finding, Case 2 of the ongoing multi-case
remediation series (Case 1: `.copilot/tasks/2026-08-22-admin-users-cross-tenant-idor/`).

## Mode

`security-incident-workflow` (per `docs/ai/general/MODE_MANIFEST.md` selection
rule #2 — authorization/lifecycle gap).

## Severity

**P1** — confirmed lifecycle authorization failure: a deactivated account
retains full access until its session/JWT naturally expires.

## Problem Statement

`await userRepo.deactivate(id, deactivatedAt)` sets `users.deactivated_at`,
and the feature's own docs describe this as revoking access. But the
repository's central request-readiness evaluator,
`evaluateNodeProvisioningAccess()` (`src/security/core/node-provisioning-access.ts`),
looks up the user, checks onboarding, resolves tenant, checks membership, and
returns `ALLOWED` — **never reading `user.deactivatedAt`**, even though the
same `findById()` call already returns it.

Investigation for this case additionally found a **second, independently
implemented** evaluator with the identical gap: `createSecurityContext()`
(`src/security/core/security-context.ts`), used by every Server Action built
on `createSecureAction()`. These two functions do not share an
implementation; fixing one does not fix the other.

## Scope

- `src/security/core/node-provisioning-access.ts` (`evaluateNodeProvisioningAccess`)
- `src/security/api/with-node-provisioning.ts` (API route deny-response mapping)
- `src/security/core/security-context.ts` (`createSecurityContext`, the
  evaluator Server Actions actually use)
- `src/security/actions/secure-action.ts` (Server Action deny-response mapping)
- `src/core/contracts/provisioning-access.ts` (`ProvisioningApiErrorCode`)
- Regression tests for both evaluators and one representative consumer each
  (an API route wrapper, one protected RSC layout, the Server Action wrapper)
- `docs/ai/general/SECURITY_CODING_PATTERNS.md` (new SEC-33) and
  `docs/features/35 - Admin User Management.md`

## Out Of Scope (explicitly deferred — see `docs/ai/general/POSSIBLE_ENHANCEMENTS.md`)

- IdP-side session revocation (Clerk API calls, any AuthJS equivalent) and a
  dedicated revocation-outcome audit event — logged as `PE-02`. The
  per-request DB-truth check this case adds already makes a stale
  session/JWT functionally useless; see reasoning in `PE-02` and SEC-33.
- Adding the same check to the edge-level proxy gate
  (`src/security/middleware/with-auth.ts`) — logged as `PE-03`. Not
  authoritative for this decision by architecture design (no DB access in
  Edge runtime for most of its checks; every real destination re-verifies
  via one of the two node-level evaluators this case fixes).
- A real-browser Playwright spec proving "login → admin deactivate → same
  cookie → deny" across a page, an API route, and a Server Action — logged
  as `PE-04`, same reasoning as `PE-01` from Case 1.

## Acceptance Criteria

1. A user with `deactivatedAt` set is denied by `evaluateNodeProvisioningAccess`
   (`FORBIDDEN` / `ACCOUNT_DISABLED`) — before onboarding/tenant/membership
   checks, so a deactivated-but-incomplete-onboarding account cannot get a
   different (more permissive-looking) status.
2. The same is true, independently, for `createSecurityContext`
   (`ACCOUNT_DISABLED` readiness status) — the evaluator Server Actions use.
3. Every existing consumer of both evaluators denies access on the new
   status/code via its existing generic deny-handling path — no consumer
   file needed a code change to pick this up (verified: it didn't).
4. Regression tests exist directly against both evaluator functions (proving
   deny + proving the before-onboarding ordering) and against one
   representative consumer of each (API route wrapper, one RSC layout,
   Server Action wrapper).
5. Docs updated: SEC-33 in `docs/ai/general/SECURITY_CODING_PATTERNS.md`,
   `docs/features/35 - Admin User Management.md`.
6. All quality gates green.

## Leantime

Same session-environment limitation as Case 1 (no `.env.leantime`/
`LEANTIME_URL` available) — see `plan.md`.
