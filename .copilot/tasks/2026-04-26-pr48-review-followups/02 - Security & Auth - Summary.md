# Security & Auth Summary

## Scope Handled

PR review follow-up triage for auth, tenant context, and client trust-boundary findings on `feat/authjs`.

## Actions Performed

- Inspected current `with-auth`, AuthJS sign-in page, NextAuth route handler, AuthJS auth config, workspace switcher, and active-org route.
- Compared current code to automated findings before implementation.

## Findings

- Stale: `/auth/signin` route missing, App Router NextAuth handler missing.
- Stale: waitlist barrel export and waitlist repository interface file are already present.
- Valid and fixed: `active-org` trusted client-selected organization ID without server-side membership enforcement.
- Valid and fixed: client workspace switcher assumed success and reloaded even on failed org-switch response.
- Valid and fixed: AuthJS credentials flow returned email as `user.id`, weakening downstream identity correctness.

## Decisions

- Prioritized route-level authorization fix before client UX cleanups, then closed the adjacent AuthJS identity issue in the same slice.

## Blockers

- None currently.
