---
name: Auth Flow Change Review
description: Review auth/bootstrap/onboarding changes against repo anti-patterns and required flow invariants
---

If the PR does not touch any of these areas, no action is needed:

- `src/proxy.ts`
- `src/security/middleware/with-auth.ts`
- `src/app/auth/**`
- `src/app/onboarding/**`
- `src/app/users/**`
- auth-related route handlers, server actions, or provider/layout boundaries

If the changed auth-scoped files only update copy, styling, test assertions, or non-routing error presentation without changing any of the following, no action is needed:

- redirect targets or redirect parameter handling
- bootstrap/start flow behavior
- onboarding-required decision logic
- cookie reads or writes
- provider/layout auth boundaries
- route-handler or server-action auth enforcement
- `/users` access-control or fallback-guard behavior

This repository has a documented auth/bootstrap/onboarding contract. Review the changed files against these sources before deciding pass or fail:

- `docs/ai/general/AUTH_FLOW_ANTI_PATTERNS.md`
- `docs/ai/general/AUTH_FLOW_MATRIX_HOW_TO_USE.md`
- `docs/ai/general/AUTH_FLOW_VERIFICATION_MATRIX.md`
- `docs/ai/general/SECURITY_CODING_PATTERNS.md`
- `src/proxy.ts`
- `src/security/middleware/with-auth.ts`

Look for these issues and fail if any are introduced by the changed lines:

## 1. Trust-Boundary Regressions

- onboarding completion or provisioning truth moved out of the database and into Clerk session state, cookies, or client-only logic
- UI visibility used as the only protection for private routes or protected behavior
- tenant, org, membership, or onboarding decisions derived from untrusted client input

## 2. Redirect And Routing Regressions

- `redirect_url` or similar params forwarded without `sanitizeRedirectUrl()`
- raw auth/onboarding redirect logic added directly in `src/proxy.ts` instead of flowing through existing middleware/auth abstractions
- auth-route redirects that bypass the bootstrap/start flow or break the established `/users` landing assumptions

## 3. Known Auth Anti-Patterns

- a streaming page or layout is turned back into the hot-path onboarding redirect orchestrator immediately after SSO
- cookie state becomes the source of truth instead of a transient routing hint
- cookie mutation (`set` or `delete`) is performed in `page.tsx` or `layout.tsx`
- middleware logic assumes edge DB access for onboarding-required decisions

## 4. Runtime-Sensitive Auth Placement Problems

- auth-sensitive code is moved into the wrong runtime boundary
- auth changes create likely `/users -> /onboarding` route-race regressions
- auth-sensitive state is treated as safely cacheable without proof

When reviewing, map the touched auth-flow surfaces to the affected matrix scenario IDs from `AUTH_FLOW_VERIFICATION_MATRIX.md`.

If no routing, guard, cookie, provisioning, or provider-boundary behavior changes, report that no auth-flow matrix scenarios are materially affected and pass.

Passing result expectations:

- no changed lines introduce the anti-patterns above
- the changed auth path still fits the repository contract
- the review identifies which matrix scenarios are affected, even if they still require separate browser validation outside this check

Do not fail only because Playwright/browser validation has not been run yet. Fail when the changed code itself violates the documented auth-flow contract or clearly omits a required enforcement point.
