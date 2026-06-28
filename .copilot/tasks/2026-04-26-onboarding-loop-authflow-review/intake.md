# Intake

## Request

Verify the heavy logging and apparent `/onboarding` looping against the repository's current auth-flow anti-patterns and verification matrix, and assess whether the latest AuthJS fixes still preserve implementation correctness.

## Starting Evidence

- User report: excessive logs and apparent `/onboarding` loop on local `http://localhost:3000/onboarding`
- Active provider in local env: AuthJS
- Recent changes on branch include AuthJS foundation work, invite flow changes, bootstrap error fixes, and admin/auth follow-up work

## Readiness Checklist

- [x] `AGENTS.md` read
- [x] `MODE_MANIFEST.md` read
- [x] `00 - Agent Interaction Protocol.md` read
- [x] `REPOSITORY_AI_CONTEXT.md` read
- [x] `SECURITY_CODING_PATTERNS.md` read
- [x] `AUTH_FLOW_ANTI_PATTERNS.md` read
- [x] `AUTH_FLOW_MATRIX_HOW_TO_USE.md` read
- [x] `AUTH_FLOW_VERIFICATION_MATRIX.md` read
- [x] Workflow 05 read
- [x] Live code path identified
- [x] Architecture review completed
- [x] Security/Auth review completed
- [x] Runtime review completed
- [x] Validation strategy review completed
- [x] Approved first implementation slice applied
- [x] Browser evidence captured in this run
- [ ] Leantime task linked in artifacts

## Code Paths Selected For Review

- `src/app/auth/bootstrap/start/route.ts`
- `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
- `src/app/onboarding/layout.tsx`
- `src/app/onboarding/actions.ts`
- `src/security/middleware/with-auth.ts`
- `src/security/middleware/route-policy.ts`
- `src/app/users/layout.tsx`
- `src/app/dashboard/layout.tsx`
- `src/app/auth/signin/page.tsx`
- `src/app/auth/post-auth-redirect.ts`

## Local Hypothesis

The core bootstrap/onboarding routing shape remains mostly correct, but stale provider-specific redirects and documentation drift make the AuthJS onboarding path inconsistent and can plausibly manifest as repeated bootstrap/onboarding churn or broken recovery navigation.

## Cheapest Disconfirming Check

Read the concrete redirect decision points for unauthenticated, bootstrap-required, and onboarding-required states and compare them to the current provider-aware sign-in route and the documented auth-flow contract.

## Design Review Outcome

- Approved for constrained implementation: yes
- Approval basis: Architecture Guard, Security & Auth, Next.js Runtime, and Validation Strategy reviews converge on one low-blast-radius remediation slice
- Approved remediation slice:
  - make bootstrap/onboarding/users unauthenticated redirects provider-aware
  - update focused tests that currently institutionalize `/sign-in`
  - keep bootstrap-start ownership, DB truth, and cookie-hint semantics unchanged
- Implementation status:
  - applied via shared provider-aware sign-in helper reused by bootstrap/onboarding/users and one adjacent registration-closed sign-in entry point
  - follow-up stale-cookie remediation applied in `with-auth.ts` so DB-backed entry guards stay authoritative for `/users`, `/dashboard`, and `/admin`
  - follow-up AuthJS runtime stabilization applied by removing module-scope server logger initialization from `auth.ts` and `AuthJsRequestIdentitySource.ts`
  - focused touched-file diagnostics pass
- Remaining non-code blocker: no Leantime linkage was recorded in this run because command-execution tooling is unavailable in the current tool surface

## Browser Evidence Captured In This Run

- Final focused AuthJS browser proof executed in isolated container-backed E2E mode:
  - `pnpm e2e:authjs:core`
- Result: `6 passed` in Chromium.
- Evidence covered:
  - AuthJS session route health still returns JSON and does not regress to HTML (`CLIENT_FETCH_ERROR` guard)
  - unauthenticated `/dashboard` visits redirect to AuthJS sign-in in a real browser
  - successful AuthJS sign-in lands on `/dashboard` by default in a real browser
  - incomplete AuthJS user settles on `/onboarding` first and then `/dashboard` after onboarding completion
- Remaining limitation: this run did not execute the broader full AuthJS matrix beyond the focused session, dashboard-entry, and incomplete-user onboarding proof set.

## Additional Runtime Regression Captured

- New symptom after the redirect fixes: homepage load triggers `[next-auth][error][CLIENT_FETCH_ERROR]` again with HTML returned from the session fetch.
- Current local hypothesis: the AuthJS session-route dependency path still had import-time side effects through `resolveServerLogger()` in `auth.ts` and `AuthJsRequestIdentitySource.ts`, which could fail before request-time execution reached the route handler body.
- Cheapest local remediation applied: logger resolution is now lazy and only occurs inside request-handling methods, not at module import time.

## Current Assessment

- The approved implementation slice and focused AuthJS validation are complete.
- The original focused browser gap is closed by the later incomplete-user onboarding spec and `pnpm e2e:authjs:core` run.
- Any broader matrix rerun or wording cleanup around `/users` versus `/dashboard` is follow-up hardening, not a blocker for this task outcome.
