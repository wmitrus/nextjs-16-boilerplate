# Implementation Plan

## Status

Approved first, second, and third slices implemented. Focused executable validation passes for unit, integration, typecheck, runtime endpoint health, and the focused AuthJS browser proof including the incomplete-user onboarding path. Broader full-matrix reruns remain optional follow-up hardening.

## Approved First Implementation Slice

1. [x] Make onboarding/bootstrap unauthenticated redirects provider-aware in the same way `with-auth.ts` already is.
2. [x] Update the focused unit tests that currently encode `/sign-in` in AuthJS-sensitive onboarding/bootstrap paths.
3. [x] Remove stale-cookie edge authority from DB-backed entry routes after confirming `/dashboard` is now the default app entry.
4. [x] Remove import-time AuthJS server logger side effects from the session-route dependency path.
5. [x] Re-run focused auth-flow validation for the affected matrix scenarios and `/api/auth/session` health.
6. [x] Capture a final AuthJS browser proof for session-route health and dashboard entry behavior.
7. [x] Added and ran a dedicated AuthJS incomplete-user onboarding browser scenario for `/auth/bootstrap/start -> /onboarding -> /dashboard`.

## Closeout

- The approved remediation slices for this task are complete.
- A wider full AuthJS matrix rerun can still be requested later, but it is no longer required to mark this implementation task complete.

## Review Approvals

- Architecture Guard: GO for a low-blast-radius redirect-unification patch; no broader auth-flow redesign approved.
- Security & Auth: GO for provider-aware redirect cleanup; provider isolation drift is real and should be corrected.
- Next.js Runtime: GO for server-side redirect cleanup; runtime ownership split remains correct.
- Validation Strategy: GO with focused unit validation first and browser verification only if the post-fix behavior remains ambiguous.

## Explicit Non-Goals For The First Follow-Up

- no broad auth-flow refactor
- no change to cookie-hint ownership
- no change to bootstrap-start as the hot-path decision boundary
- no reopening tenant/org design decisions
