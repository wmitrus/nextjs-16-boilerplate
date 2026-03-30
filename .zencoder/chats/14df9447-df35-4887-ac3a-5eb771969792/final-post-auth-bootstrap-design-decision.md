# Final Post-Auth Bootstrap Design Decision

**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: `2026-03-18`  
**Decision**: **APPROVED — remove `/auth/bootstrap` page from direct Clerk post-auth landing**

## 1. Objective

Decide the final architecture-correct post-auth landing design after the runtime-legal route-handler cookie-bridge implementation still leaves the user visibly stuck on:

`/auth/bootstrap?redirect_url=/users`

This review answers whether `/auth/bootstrap` should remain the direct Clerk landing route, or whether the final design must replace that boundary with a more stable Clerk/Next.js 16-compatible shape.

## 2. Current-State Findings

### 2.1 What the current implementation does

The current flow now looks like this:

1. Clerk redirects to `/auth/bootstrap?redirect_url=/users`
2. `src/app/auth/bootstrap/page.tsx` performs:
   - identity resolution
   - provisioning
   - DB-backed user lookup
   - onboarding decision
3. if onboarding is incomplete, the page redirects to `src/app/auth/bootstrap/handoff/route.ts`
4. the handoff route sets `__onboarding_pending`
5. the handoff route redirects to `/onboarding`

So the direct Clerk landing is still a **Server Component page**, not a Route Handler.

### 2.2 The current server-side bootstrap logic is not the thing failing

Recent server logs show that the bootstrap business logic itself completes successfully:

- `logs/server.log:272` -> `bootstrap:entry`
- `logs/server.log:289` -> `provisioning:ensure` `status:"success"`
- `logs/server.log:290` -> `bootstrap:redirect` with `reason:"missing_onboarding_state"`
- immediately after, `/onboarding` server rendering begins and `OnboardingGuard` reaches `decision:"render:onboarding"`

That means:

- provisioning is not fundamentally broken
- DB access is not fundamentally broken
- the onboarding decision itself is not fundamentally broken

The unstable boundary is the **direct post-auth page landing and redirect hop**, not the underlying business rules.

### 2.3 Why the current design is still fragile

Per official Next.js docs:

- `redirect()` in a streaming context emits the redirect on the client side
- Route Handlers do not participate in layouts or client-side navigations like pages
- cookie mutation must happen in Route Handlers or Server Actions

That combination matters here.

The current direct landing still goes through a Server Component page render on the hot post-auth path. Even though the cookie write was moved to a legal Route Handler, the user still has to survive:

`Clerk post-auth redirect -> /auth/bootstrap page render -> page-level redirect -> handoff route -> /onboarding`

So the architecture still places an RSC page boundary directly in the most timing-sensitive part of the auth flow.

### 2.4 Clerk guidance is compatible with changing the landing boundary

Official Clerk docs support:

- configuring force/fallback redirect URLs through env vars or props
- using `auth()` in Route Handlers
- using middleware to enforce onboarding

Clerk's simple onboarding guide uses middleware plus session claims/public metadata for simpler Clerk-owned onboarding state.

This repository intentionally does **not** use Clerk as the source of truth for onboarding completion. The app uses DB-backed provisioning and onboarding state. That is still the correct ownership model here.

So the right conclusion is not "move truth into Clerk."

The right conclusion is:

- keep DB truth in the app
- but stop using a Server Component page as the direct post-auth landing boundary

## 3. Answer To The Main Question

### 3.1 Does the latest runtime evidence show that direct landing on `/auth/bootstrap` is fundamentally unstable in this architecture?

**Yes.**

More precisely:

- the **bootstrap business logic** is not fundamentally unstable
- the **bootstrap page as the direct Clerk landing boundary** is fundamentally unstable for this flow

Reason:

- the user-visible hang now occurs before the cookie bridge can help
- the current hot path still depends on a post-auth Server Component page render plus page-level redirect
- the server logs show the bootstrap logic can succeed while the user-visible navigation still fails

That is the signature of a boundary problem, not a business-rule problem.

So `/auth/bootstrap` should no longer be the direct post-auth landing **page**.

## 4. Candidate Comparison

### A. Keep `/auth/bootstrap` as the direct landing page

**Reject.**

Why:

- this is the boundary that is still failing visibly
- it keeps a Server Component page render in the hottest post-auth path
- it keeps the redirect dependent on page/render/streaming behavior instead of an atomic HTTP response boundary

### B. Stable post-auth landing page + separate bootstrap handoff/provisioning boundary

**Reject as the final choice.**

This would look like:

- Clerk lands on a stable page
- page mounts
- page triggers bootstrap separately

Why I do not recommend it:

- it adds an extra client-mount dependency
- it still depends on client route settlement before bootstrap starts
- it is less robust than a server-only direct landing
- it is unnecessary because the server already has enough data to decide immediately

This is better than A, but not the best final design.

### C. Dedicated Route Handler or Server Action bootstrap trigger

**Partially approve.**

- **Route Handler**: approve
- **Server Action**: reject for direct landing

Why:

- a Server Action cannot be the direct Clerk landing target without a client intermediary
- a Route Handler can be the direct landing target and can do atomic redirect/cookie work in a single server response

### D. Better repository-compatible option

**Approve. This is the final recommendation.**

Use a **dedicated nested Route Handler under the bootstrap prefix as the direct Clerk landing**, and make the existing bootstrap page UI-only.

Concrete shape:

- Clerk lands on `/auth/bootstrap/start?redirect_url=/users`
- `src/app/auth/bootstrap/start/route.ts` performs provisioning + DB-backed decision
- the Route Handler:
  - redirects directly to `/users` if ready
  - sets `__onboarding_pending` and redirects directly to `/onboarding` if onboarding is required
  - redirects to a UI page for recoverable error states or org-required states
- `src/app/auth/bootstrap/page.tsx` stops being a hot-path provisioning page and becomes a recovery/status UI page only

This is the best match for the current repository because:

- it preserves the bootstrap route family already recognized by `isBootstrapRoute`
- it avoids route-classification churn
- it avoids the page/route conflict at `/auth/bootstrap`
- it preserves current error UIs and org-selection UI
- it removes the direct post-auth RSC page from the critical path

## 5. Final Approved Design Decision

### 5.1 Final decision

**Do not keep `/auth/bootstrap` as the direct Clerk post-auth landing page.**

**Replace it with a direct Clerk landing Route Handler at:**

`/auth/bootstrap/start?redirect_url=/users`

### 5.2 Why this is the best final design

This design best preserves:

- current business cases
- modular monolith boundaries
- security guarantees
- DB-backed onboarding truth
- Clerk and Next.js runtime legality

Because it keeps:

- identity/provisioning/onboarding truth on the server
- optimistic middleware checks in middleware
- final truth in the DB
- direct post-auth navigation in an atomic HTTP response boundary

And it removes:

- page-render timing from the post-auth hot path
- an unnecessary extra handoff hop
- the current dependence on `/auth/bootstrap` page route settlement

## 6. Final Target Boundaries And Files

### 6.1 New direct post-auth entrypoint

**Add**

- `src/app/auth/bootstrap/start/route.ts`

Responsibilities:

- explicit `runtime = 'nodejs'`
- authenticate the request using the existing server/auth boundary
- run provisioning
- inspect DB-backed onboarding state
- set `__onboarding_pending` directly when incomplete
- issue a direct HTTP redirect to `/onboarding?redirect_url=...` or `safeTarget`
- redirect recoverable failures to bootstrap UI state routes/query states

### 6.2 Shared server bootstrap decision logic

**Extract**

- `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
  or equivalent local server helper

Responsibilities:

- encapsulate the current logic now embedded in `src/app/auth/bootstrap/page.tsx`
- return a typed outcome such as:
  - `ready`
  - `onboarding_required`
  - `org_required`
  - `cross_provider_linking`
  - `quota_exceeded`
  - `tenant_config`
  - `db_error`

Why extract it:

- keeps Route Handler logic thin
- avoids duplicating provisioning/orchestration logic
- preserves composition root and DI usage through existing container access

### 6.3 Bootstrap page becomes UI-only

**Change**

- `src/app/auth/bootstrap/page.tsx`

New role:

- no longer direct post-auth landing
- no provisioning logic in the normal path
- render UI based on `searchParams`, for example:
  - `state=org-required`
  - `error=cross_provider_linking`
  - `error=quota_exceeded`
  - `error=tenant_config`
  - `error=db_error`

This lets the existing client UIs remain useful without leaving them on the critical post-auth path.

### 6.4 Collapse the redundant handoff hop

**Remove or retire**

- `src/app/auth/bootstrap/handoff/route.ts`

Reason:

- once the direct landing is already a Route Handler, it can legally set the cookie itself
- a second Route Handler hop becomes unnecessary complexity

### 6.5 Update Clerk redirect targets

**Change**

- `.env.example`
- `.env.local`
- `src/testing/infrastructure/env.ts`

From:

- `/auth/bootstrap?redirect_url=/users`

To:

- `/auth/bootstrap/start?redirect_url=/users`

The consuming code can remain in place:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

### 6.6 Keep current read/delete boundaries

**Keep**

- `src/security/middleware/with-auth.ts`
- `src/app/onboarding/actions.ts`

These remain the correct boundaries for:

- reading the onboarding-pending hint in middleware
- deleting it after successful onboarding completion

### 6.7 Update org-required continuation

**Change**

- `src/app/auth/bootstrap/bootstrap-org-required.tsx`

Why:

- it currently sends organization selection back to `/auth/bootstrap`
- that would reintroduce the page boundary into the hot path

It should instead continue to the new Route Handler landing, preserving `redirect_url` if present.

### 6.8 Tests

**Change / add**

- `src/app/auth/bootstrap/page.test.tsx`
- `src/app/auth/bootstrap/start/route.test.ts`
- possibly new tests for `resolve-bootstrap-outcome.ts`
- update any env/redirect assertions affected by the new landing path

## 7. Rejected Approaches

The following approaches should now be explicitly rejected:

1. Keeping `/auth/bootstrap` page as the direct Clerk landing route.
2. Keeping the current `/auth/bootstrap -> /auth/bootstrap/handoff -> /onboarding` hot path.
3. Adding a client-side `useEffect` bootstrap trigger as the primary fix.
4. Using a Server Action as the direct post-auth entrypoint.
5. Moving onboarding truth into Clerk metadata/session claims as a hotfix.
6. Duplicating raw cookie/path logic in `src/proxy.ts`.
7. Converting `/auth/bootstrap` itself into `route.ts` while `page.tsx` still exists at the same segment.

## 8. Probes And Verification

### 8.1 Were the client probe removals premature?

**Yes, slightly.**

They were reasonable for production cleanup, but premature for incident closure because the final landing boundary had not actually been stabilized yet.

### 8.2 Recommendation

Temporarily restore probes for the final implementation/verification pass, but behind a dev-only or explicit debug flag.

Recommended temporary probes:

- shared-shell route probe
- onboarding client hydration probe

Not required:

- a long-lived bootstrap page probe, because the final design should remove the bootstrap page from the hot path

Also add structured server logs in the new Route Handler:

- `bootstrap_start:entry`
- `bootstrap_start:decision`
- `bootstrap_start:error`

That gives a cleaner final verification surface than relying on page-mounted probes in a route that should no longer be central.

## 9. Final Implementation Guidance

1. Introduce `src/app/auth/bootstrap/start/route.ts` as the direct Clerk landing boundary.
2. Extract the current provisioning/decision logic from `src/app/auth/bootstrap/page.tsx` into a shared server helper.
3. Make the Route Handler own the full post-auth decision:
   - ready -> redirect to `safeTarget`
   - onboarding required -> set cookie and redirect to `/onboarding`
   - org required -> redirect to bootstrap UI state
   - recoverable errors -> redirect to bootstrap UI state
4. Convert `src/app/auth/bootstrap/page.tsx` into a UI-only recovery/status page.
5. Remove `src/app/auth/bootstrap/handoff/route.ts` once the new Route Handler owns cookie write + redirect directly.
6. Change Clerk env redirect targets to `/auth/bootstrap/start?redirect_url=/users`.
7. Update `BootstrapOrgRequired` continuation URLs to the new start route.
8. Temporarily restore dev-gated probes for one final verification pass, then remove them before shipping.

## 10. Final Return

### 10.1 Final approved design decision

**Use a dedicated Route Handler under the bootstrap prefix as the direct Clerk post-auth landing, and remove the bootstrap page from the hot path.**

### 10.2 Should `/auth/bootstrap` stay or be removed from direct post-auth landing?

**Removed from direct post-auth landing.**

Keep it only as:

- UI recovery/status surface
- or retire it entirely in a later cleanup

### 10.3 Exact target boundaries/files

Primary targets:

- `src/app/auth/bootstrap/start/route.ts`
- `src/app/auth/bootstrap/resolve-bootstrap-outcome.ts`
- `src/app/auth/bootstrap/page.tsx`
- `src/app/auth/bootstrap/bootstrap-org-required.tsx`
- `.env.example`
- `.env.local`
- `src/testing/infrastructure/env.ts`
- `src/app/auth/bootstrap/start/route.test.ts`

Keep:

- `src/security/middleware/with-auth.ts`
- `src/app/onboarding/actions.ts`
- `src/app/users/layout.tsx`

Remove after refactor:

- `src/app/auth/bootstrap/handoff/route.ts`

### 10.4 Rejected approaches

- direct Clerk landing on `/auth/bootstrap` page
- client-triggered bootstrap page workaround
- Server Action direct landing
- provider-metadata ownership shift as hotfix
- raw proxy branching
- same-segment `page.tsx` + `route.ts` conflict at `/auth/bootstrap`

## 11. Source Notes

Official sources used:

- Next.js `cookies()` docs: https://nextjs.org/docs/app/api-reference/functions/cookies
- Next.js `redirect()` docs: https://nextjs.org/docs/app/api-reference/functions/redirect
- Next.js Route Handlers guide: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js authentication guide: https://nextjs.org/docs/app/guides/authentication
- Clerk `auth()` docs: https://clerk.com/docs/reference/nextjs/app-router/auth
- Clerk Route Handlers docs: https://clerk.com/docs/reference/nextjs/app-router/route-handlers
- Clerk redirect URL guide: https://clerk.com/docs/guides/development/customize-redirect-urls
- Clerk onboarding guide: https://clerk.com/docs/guides/development/add-onboarding-flow
