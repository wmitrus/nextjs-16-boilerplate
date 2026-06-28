# Onboarding Loop Auth-Flow Review

## Task ID

`2026-04-26-onboarding-loop-authflow-review`

## Status

**COMPLETED — IMPLEMENTATION AND FOCUSED AUTHJS VALIDATION CLOSED** — the provider-aware redirect slice is applied, the stale-cookie edge-authority fix is applied for DB-backed entry routes (`/users`, `/dashboard`, `/admin`), the AuthJS session route path no longer resolves the server logger at import time, the immediate PR blockers from review were addressed with SEC-10 log sanitization plus AuthJS-aware integration assertions, focused unit and integration packs pass, `pnpm typecheck` passes, repo-wide `pnpm lint --fix` passes after repairing unrelated task artifacts, live `/api/auth/session` plus `/api/auth/providers` return JSON with `HTTP 200`, and the focused AuthJS Chromium browser proof passes including the incomplete-user onboarding path.

## Objective

Review the current `/onboarding` loop report against the repository auth-flow contract, determine whether the latest AuthJS fixes still preserve the intended implementation shape, and identify concrete drift or blocker findings before any further implementation.

## Progress Checklist

- [x] Workflow instructions and auth-flow references read
- [x] Controlling auth/bootstrap/onboarding code paths identified
- [x] Architecture review completed
- [x] Security/Auth review completed
- [x] Next.js runtime review completed
- [x] Validation strategy review completed
- [x] Debug trace for the reported loop completed from code evidence
- [x] Affected auth-flow matrix scenarios mapped
- [x] Design constraints consolidated for implementation
- [x] Real-browser reproduction captured
- [ ] Leantime task linked or created
- [x] Focused implementation completed
- [x] Focused validation executed against affected matrix scenarios

## Review Scope

- `src/proxy.ts`
- `src/security/middleware/with-auth.ts`
- `src/app/auth/bootstrap/start/route.ts`
- `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
- `src/app/onboarding/layout.tsx`
- `src/app/onboarding/actions.ts`
- `src/app/users/layout.tsx`
- `src/app/dashboard/layout.tsx`
- auth-flow docs and matrix files

## Current Review Outcome

- Current code still preserves the core contract that bootstrap/start owns the hot-path onboarding redirect and DB remains the source of truth.
- The approved first remediation slice is now implemented:
  - bootstrap, onboarding, users, and registration-closed sign-in entry points now resolve through one shared provider-aware helper
  - focused unit tests for bootstrap/onboarding/users now assert AuthJS sign-in routing explicitly
- A second remediation slice is now implemented based on historical stale-cookie evidence:
  - edge cookie-hint redirects no longer override DB-backed entry guards for `/dashboard` or `/admin`
  - `/users`, `/dashboard`, and `/admin` now share the same architectural rule: edge hint may assist general private routes, but DB-backed provisioning guards remain authoritative for entry-route settlement
- Remaining drift:
  - some docs and matrix language still describe `/users` as the canonical app entry, while live code uses `/dashboard` as `DEFAULT_APP_ENTRY_URL`
- The reported `/onboarding` loop is now most plausibly explained by stale `__onboarding_pending` cookie routing on `/dashboard` after the app entry moved away from `/users`; the focused browser proof for the incomplete-user settlement path now passes.
- A separate recurrence also surfaced: homepage load now reproduces `CLIENT_FETCH_ERROR` again.
- Current best code-grounded explanation for that recurrence is import-time AuthJS server logger initialization inside the session route dependency path; that side effect has now been delayed to request-time method execution.
- The immediate PR-readiness blockers from the review pass were then closed with a narrow follow-up patch:
  - touched auth-flow guards no longer log raw `err` objects
  - integration redirect coverage is no longer Clerk-only; AuthJS `/auth/signin` assertions were added for middleware and proxy validation surfaces
- Architecture, security/auth, runtime, and validation reviews support keeping DB truth authoritative and reducing cookie-hint authority on DB-backed entry routes before widening scope.

## Closeout Position

- The task objective for the smallest-safe remediation slice is complete.
- Remaining broader AuthJS matrix reruns or docs wording cleanup are optional follow-up hardening tasks, not blockers for this task outcome.

## Affected Matrix Scenarios

- AF-02
- AF-05
- AF-06
- AF-09
- AF-10
- AF-16
- AF-17
- AF-21
- AF-27

## Artifact List

- `plan.md`
- `intake.md`
- `constraints.md`
- `implementation-plan.md`
- `01 - Architecture Guard - Summary.md`
- `02 - Security & Auth - Summary.md`
- `03 - Next.js Runtime - Summary.md`
- `04 - Implementation Agent - Summary.md`
- `05 - Validation Strategy - Summary.md`
- `06 - Debug Investigation - Summary.md`
- `validation-report.md`
