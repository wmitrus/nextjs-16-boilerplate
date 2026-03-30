# Post-Auth Landing Remediation Shape

Date: 2026-03-15  
Mode: investigation/design only, no implementation

## 1. Objective

Approve the minimum architecture-safe remediation shape for the post-auth landing strategy, based on:

- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/post-bootstrap-client-transition-analysis.md`
- `.zencoder/chats/d7fbaba9-1170-4052-aa3b-e8144a7b5541/post-bootstrap-client-transition-analysis-copilot.md`

## 2. Shared Findings From Both Analyses

Both analyses materially agree on these points:

- `/auth/bootstrap` succeeds on the server success path
- the visible failure happens after successful bootstrap, during the client-side handoff
- the strongest runtime suspect is installed Clerk App Router provider lifecycle:
  - `setActive`
  - cache invalidation
  - `router.refresh()`
- using `/auth/bootstrap` as the immediate Clerk landing route amplifies the failure because `/auth/bootstrap` is a redirect trampoline, not a stable destination
- middleware and bootstrap server logic are no longer the primary root-cause candidates

## 3. Approved Remediation Shape

### Approved answer to question 1

Yes.

`/auth/bootstrap` should stop being the direct Clerk `force` / `fallback` landing route.

Reason:

- `/auth/bootstrap` is a transient provisioning route that immediately redirects again on success
- Clerk’s App Router provider appears to refresh the current route during auth-state activation
- landing directly on a redirect-only route during that refresh window is the fragile part of the flow

### Approved answer to question 2

The safest minimum fix shape is:

- switch Clerk’s post-auth landing to a stable existing application route
- not a new dedicated handoff route as the first change

Preferred stable landing:

- `/users`

Why `/users` is the best minimum-safe choice:

- it is already the canonical authenticated destination in the current app flow
- it is already protected by repository-owned access logic in `src/app/users/layout.tsx`
- that layout already redirects to `/auth/bootstrap?redirect_url=/users` when bootstrap is actually required
- it also redirects to `/onboarding` when onboarding is required
- this preserves provisioning behavior while moving Clerk’s initial landing away from the fragile bootstrap route

So the approved fix shape is:

- Clerk lands on a stable route like `/users`
- repository-owned server guards then decide whether to:
  - stay on `/users`
  - redirect to `/auth/bootstrap`
  - redirect to `/onboarding`

This keeps provisioning and onboarding decisions server-owned, while removing `/auth/bootstrap` from the direct Clerk landing path.

### Why a new dedicated handoff route is not the first choice

A dedicated route like `/auth/complete` is a reasonable fallback option, but it is not the minimum-safe first change.

Why it is second choice:

- it introduces a new auth surface
- it requires new routing/policy decisions
- it expands blast radius beyond the current landing configuration
- it is only justified if simply landing on an existing stable route does not solve the issue

### Why “only change layout/header props” is too narrow as a description

Conceptually, yes, this is a redirect-strategy change.

But implementation-wise it should be treated as:

- a landing-strategy change
- expressed through the Clerk config consumed by:
  - `src/app/layout.tsx`
  - `src/modules/auth/ui/HeaderAuthControls.tsx`
- with accompanying config/test updates so the repository has one consistent landing policy

## 4. Preferred Fix Target Files

### Primary behavior targets

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

These are the repository-owned integration points currently feeding Clerk the post-auth landing route.

### Primary config-contract targets

- `.env.example`
- `src/core/env.test.ts`

If the landing route is changed, the checked-in config contract and tests should reflect the new intended policy.

### Routes that should remain behaviorally intact

- `src/app/auth/bootstrap/page.tsx`
- `src/app/users/layout.tsx`
- `src/app/onboarding/layout.tsx`

These should continue owning:

- provisioning checks
- onboarding gating
- safe server-side redirect decisions

### Files that are not primary fix targets

- `src/security/middleware/with-auth.ts`
- `src/security/middleware/route-classification.ts`
- CSP / Cloudflare files

Those are no longer the primary root-cause surface for this issue.

## 5. Minimum Safe Implementation Scope

Approved minimum scope:

1. Repoint Clerk `sign-in` / `sign-up` force and fallback landing config away from `/auth/bootstrap` and to a stable app route, preferably `/users`.
2. Apply that change consistently in:
   - `src/app/layout.tsx`
   - `src/modules/auth/ui/HeaderAuthControls.tsx`
   - checked-in env/config examples and related tests
3. Leave `/auth/bootstrap` in place as the internal provisioning/recovery trampoline used by existing server guards.
4. Do not redesign provisioning, onboarding, or middleware as part of the first remediation pass.

This scope is low-blast-radius because:

- it changes where Clerk lands, not how provisioning works
- it reuses existing server-owned route guards
- it does not create a new auth subsystem

## 6. Forbidden Patterns

The following implementation patterns should be treated as forbidden for the first remediation pass:

- Patching or monkey-patching Clerk internals, including overriding `window.__unstable__onBeforeSetActive` or `window.__unstable__onAfterSetActive`.
- Editing `node_modules` or vendoring custom Clerk provider code as a workaround.
- Moving provisioning logic into client components or client effects.
- Making `/auth/bootstrap` render client-driven navigation logic just to escape the stuck state.
- Adding `setTimeout`, delayed redirects, retry loops, or arbitrary `window.location.reload()` workarounds.
- Adding extra `router.refresh()` or client-side auth observers in the repository to “stabilize” the transition.
- Redesigning middleware, CSP, or security headers as part of this fix.
- Introducing a new `/auth/complete` route that is itself just another transient redirect-only trampoline to `/auth/bootstrap`.
- Leaving provider-level and button-level Clerk redirect config inconsistent with each other.

## 7. Approved Fallback If The Minimum Fix Fails

If changing the landing route to `/users` does not solve the issue, the next approved shape is:

- introduce a dedicated repository-owned handoff route such as `/auth/complete`

But only if needed, and only with these constraints:

- it must be a stable auth-completion boundary, not another redirect trampoline
- it must not own provisioning logic
- provisioning must remain in `/auth/bootstrap`
- route policy and auth semantics must be explicit and narrowly scoped

That is a second-step fallback, not the first remediation shape.

## 8. Final Approval

- approved remediation shape: stop using `/auth/bootstrap` as Clerk’s direct post-auth landing route, and instead land on a stable existing application route, preferably `/users`, then let existing server guards redirect to bootstrap/onboarding only when needed
- preferred fix target files: `src/app/layout.tsx`, `src/modules/auth/ui/HeaderAuthControls.tsx`, plus config/test contract files such as `.env.example` and `src/core/env.test.ts`
- forbidden patterns: Clerk internals patching, client-side provisioning workarounds, timeout/reload hacks, broad middleware rewrites, or introducing another transient redirect trampoline
- minimum safe implementation scope: landing-strategy/config change only, with bootstrap/provisioning behavior preserved and no auth architecture redesign
