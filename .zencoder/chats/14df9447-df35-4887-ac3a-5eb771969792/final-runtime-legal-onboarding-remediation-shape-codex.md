# Final Runtime-Legal Onboarding Remediation Shape (Codex)

**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: `2026-03-18`  
**Decision**: **APPROVED WITH REQUIRED SHAPE CORRECTION**

## 1. Objective

Define the final architecture-correct fix shape for the `/users -> /onboarding` hang under:

- Next.js 16 App Router runtime rules
- Clerk post-auth redirect behavior
- the repository's server-owned auth/onboarding boundaries

This pass is design-only. No implementation.

## 2. Current-State Findings

### 2.1 The confirmed failure boundary is still the same

From the existing route-boundary artifacts:

- `/users` commits client-side
- server-side `OnboardingGuard` reaches `decision: render:onboarding`
- `/onboarding` returns `200`
- `/onboarding` never commits client-side

So the fix still needs to avoid the fragile `/users` RSC redirect handoff during the post-auth transition.

### 2.2 The current cookie write is runtime-illegal

`src/app/auth/bootstrap/page.tsx` currently calls `cookies().set()` during Server Component page render.

Under Next.js 16, that is invalid. Per the official `cookies()` docs, cookie mutation is allowed only in:

- a Route Handler
- a Server Action / Server Function

It is not allowed in Server Component page or layout render.

### 2.3 The current Clerk landing still goes to `/users`

The currently configured redirect inputs still point to `/users`:

- `.env.example`
- `.env.local`
- `src/testing/infrastructure/env.ts`

And both:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

already pass those env-backed values through to Clerk.

That means the old bridge shape is incomplete even if the cookie write were moved to a legal boundary, because the observed failing run still lands on `/users` before bootstrap can place the routing hint.

### 2.4 The read-side and clear-side boundaries are already basically correct

These parts are already in the right layer:

- `src/security/middleware/with-auth.ts`
  - edge-readable `req.cookies.get('__onboarding_pending')`
  - correct enforcement point inside the existing security pipeline
- `src/app/onboarding/actions.ts`
  - `'use server'` action
  - legal place to delete the cookie after successful completion

So the main remaining design corrections are:

1. move the **write** into a legal boundary
2. move the **post-auth landing** onto the bootstrap path that can establish that hint before `/users` is evaluated

## 3. Architectural Assessment

### 3.1 Is the cookie-bridge concept still the best fix shape?

**Yes, but only as a completed bootstrap-handoff design.**

The cookie bridge remains the best minimum-safe shape because:

- Edge middleware cannot do the DB lookup needed for onboarding state
- the cookie is only a routing hint, not an authorization source
- DB-backed truth remains enforced in server-owned guards
- it avoids relying on the known-fragile `/users` Server Component redirect during Clerk session settlement

What is **not** approved is the incomplete version that:

- writes the cookie in `bootstrap/page.tsx`
- keeps Clerk landing directly on `/users`

That version is both runtime-illegal and insufficiently on-path for the failing run.

### 3.2 Where can the onboarding-pending signal be written legally and safely?

**Approved write boundary: a nested Route Handler under the bootstrap route.**

Recommended shape:

- `src/app/auth/bootstrap/handoff/route.ts`

Why this is the right boundary:

- Route Handlers are a legal cookie-mutation boundary in Next.js 16
- bootstrap page render can redirect to it without moving business logic to the client
- it stays inside the auth/bootstrap delivery boundary instead of inventing a separate API surface
- it reuses the existing `isBootstrapRoute` classification because `/auth/bootstrap/*` is already treated as bootstrap-only in `route-classification.ts`

**Not recommended for the write:**

- Server Action for the initial bootstrap handoff
  - bootstrap page render cannot invoke it directly without introducing a client intermediary
- cookie mutation in any `page.tsx` / `layout.tsx`
  - runtime-illegal in Next.js 16
- raw mutation inside `proxy.ts`
  - wrong layer and no DB truth

### 3.3 Is there a better final design than the cookie bridge right now?

**Not for the minimum safe final pass in this repository.**

The only materially different design would be to move onboarding truth into Clerk-owned metadata/session claims so middleware can read it directly, following Clerk's simplified custom-onboarding guide.

I do **not** recommend that for this fix.

Why:

- this repo already treats onboarding/provisioning as app-owned domain state
- the authoritative state lives in the internal user record, not in Clerk
- moving truth into Clerk now would create cross-system coupling during an incident fix
- it is a broader architectural shift than the evidence justifies

For this modular monolith, the correct split remains:

- Clerk owns authentication and post-auth landing
- the app owns provisioning and onboarding truth
- middleware uses a transient cookie only as a transport hint

## 4. Approved Final Implementation Shape

### 4.1 Final approved shape

The final approved shape is:

1. **Repoint Clerk post-auth landing to bootstrap**
   - Change the current post-auth redirect target from `/users` to `/auth/bootstrap?redirect_url=/users`
   - Apply this to the existing env-driven Clerk redirect settings so the browser no longer lands on `/users` first

2. **Keep bootstrap page as the server-owned provisioning/decision boundary**
   - `src/app/auth/bootstrap/page.tsx` keeps:
     - identity lookup
     - provisioning
     - user lookup
     - error UI rendering
   - When onboarding is incomplete, it must no longer call `cookies().set()`
   - Instead it redirects to a nested handoff Route Handler

3. **Add a legal handoff Route Handler**
   - `src/app/auth/bootstrap/handoff/route.ts`
   - Responsibilities only:
     - sanitize `redirect_url`
     - set `__onboarding_pending=1`
     - redirect to `/onboarding?redirect_url=...`

4. **Keep the middleware read where it is**
   - `src/security/middleware/with-auth.ts`
   - Continue reading `__onboarding_pending` in edge mode
   - Continue enforcing the redirect through `redirectForIncompleteOnboarding(...)`

5. **Keep the happy-path delete where it is**
   - `src/app/onboarding/actions.ts`
   - Continue deleting `__onboarding_pending` in the existing Server Action after successful completion

6. **Keep `UsersLayout` as a DB-backed safety net**
   - `src/app/users/layout.tsx`
   - No change required for the core fix

### 4.2 Why the Clerk redirect change is required

This is the most important correction to the earlier bridge drafts.

If Clerk still lands on `/users`, then the browser can still hit the already-confirmed failing path before bootstrap has a chance to establish the cookie.

So the final fix is **not** just "move `cookies().set()` into a Route Handler."

It is:

- move the write to a legal boundary
- and make bootstrap the actual post-auth landing route

Without both, the route-commit race is still structurally in play.

### 4.3 Why the nested bootstrap handoff route is better than an `/api/...` helper

An `/api/...` Route Handler would also be legal, but it is not the best final shape here.

The nested bootstrap handoff route is better because it:

- stays in the same auth/bootstrap route family
- inherits the existing bootstrap route classification and auth behavior
- keeps the fix within the delivery/auth boundary instead of inventing an API-style endpoint for a pure navigation handoff
- avoids JSON-style API semantics on direct unauthenticated hits

So the preferred final shape is:

`/auth/bootstrap` -> `/auth/bootstrap/handoff` -> `/onboarding`

not:

`/auth/bootstrap` -> `/api/...` -> `/onboarding`

## 5. Exact Runtime-Legal Mutation Boundaries

### 5.1 Cookie write

**Boundary**: `GET` Route Handler  
**Target**: `src/app/auth/bootstrap/handoff/route.ts`

This is the only approved place for setting `__onboarding_pending` in the bootstrap flow.

### 5.2 Cookie delete

**Boundary**: Server Action  
**Target**: `src/app/onboarding/actions.ts`

This remains legal and correct for the normal onboarding-complete path.

## 6. Exact Target Files

### 6.1 Required repo changes

| File                                           | Decision                  | Why                                                                                      |
| ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/page.tsx`              | **CHANGE**                | Remove illegal cookie mutation and redirect incomplete users to the nested handoff route |
| `src/app/auth/bootstrap/handoff/route.ts`      | **ADD**                   | Legal cookie-write boundary; set `__onboarding_pending` and redirect to `/onboarding`    |
| `.env.example`                                 | **CHANGE**                | Update documented Clerk post-auth landing to bootstrap                                   |
| `.env.local`                                   | **CHANGE FOR LOCAL RUNS** | Local runtime currently still lands on `/users`                                          |
| `src/testing/infrastructure/env.ts`            | **CHANGE**                | Keep tests aligned with the new default post-auth landing                                |
| `src/app/auth/bootstrap/page.test.tsx`         | **CHANGE**                | Stop asserting cookie mutation in page render; assert redirect to handoff route          |
| `src/app/auth/bootstrap/handoff/route.test.ts` | **ADD**                   | Assert `Set-Cookie` and redirect behavior                                                |

### 6.2 Operational change outside the repo

The actual deployed Clerk/Vercel env values also need to change, because the runtime behavior is env-driven.

The code in these files already consumes those env values correctly and does not need logic changes for this part:

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

### 6.3 Files that should stay unchanged for the core fix

| File                                   | Decision | Why                                               |
| -------------------------------------- | -------- | ------------------------------------------------- |
| `src/security/middleware/with-auth.ts` | **KEEP** | Read-side location is already correct             |
| `src/app/onboarding/actions.ts`        | **KEEP** | Delete-side location is already legal             |
| `src/app/users/layout.tsx`             | **KEEP** | DB-backed safety net stays in place               |
| `src/proxy.ts`                         | **KEEP** | No raw cookie/path branching should be added here |

## 7. Forbidden Patterns

The following patterns should now be treated as explicitly forbidden:

1. `cookies().set()` or `cookies().delete()` in any Server Component render path
   - `page.tsx`
   - `layout.tsx`
   - any other RSC render branch

2. Any Next.js 16 cookie-mutation pattern outside:
   - a Route Handler
   - a Server Action / Server Function

3. Keeping Clerk post-auth landing on `/users` while expecting the bridge to eliminate the `/users -> /onboarding` route-commit race

4. Adding bespoke onboarding-cookie logic directly in `src/proxy.ts`
   - no raw `pathname === '/users'`
   - no duplicate route matching outside `RouteContext` / `withAuth`

5. Treating `__onboarding_pending` as an authorization control
   - it is routing-only
   - DB-backed guards remain authoritative

6. Moving the primary fix into client-side router code
   - no client-side `router.replace('/onboarding')` workaround as the main solution

7. Bypassing repository auth/security boundaries
   - no direct DB logic in edge middleware
   - no provider-only shortcut that bypasses server-owned provisioning logic

8. Treating Clerk public metadata/session claims as the new source of truth as a hotfix
   - that would be a broader architecture change, not the minimum safe remediation

## 8. Alignment With Official Next.js 16 + Clerk Guidance

### 8.1 Next.js 16 alignment

This design aligns with the official Next.js App Router rules because:

- cookie mutation is moved into a Route Handler, which is a legal response-producing boundary
- cookie deletion remains in a Server Action, which is also legal
- no sensitive routing logic is moved to the client
- middleware remains edge-safe and transport-only

Official Next.js source of truth used:

- `https://nextjs.org/docs/app/api-reference/functions/cookies`
- `https://nextjs.org/docs/app/getting-started/route-handlers`
- `https://nextjs.org/docs/app/getting-started/mutating-data`

### 8.2 Clerk alignment

This design aligns with Clerk's App Router onboarding guidance in the ways that matter for this repo:

- use middleware/server boundaries to enforce onboarding redirects
- use post-auth redirect URLs to land on a stable server-owned route after auth
- keep the onboarding flow server-controlled rather than client-only

Official Clerk source of truth used:

- `https://clerk.com/docs/guides/development/add-onboarding-flow`
- `https://clerk.com/docs/nextjs/components/authentication/sign-up`

Clerk's example guide stores onboarding state in `publicMetadata` and session claims. That is appropriate for simpler Clerk-owned flows.

This repository should not adopt that as a hotfix because:

- onboarding/provisioning state here is app-owned domain data
- the modular monolith should keep that truth in the server-owned user record
- Clerk should remain the identity provider, not the business-state authority

So the final design is aligned with Clerk best practices at the integration boundary, while still respecting this repo's ownership model.

## 9. Risks And Tradeoffs

### 9.1 Accepted tradeoff: one extra redirect hop

The approved flow adds one internal redirect hop:

`/auth/bootstrap` -> `/auth/bootstrap/handoff` -> `/onboarding`

That is acceptable because it buys:

- runtime legality
- lower blast radius
- preserved bootstrap error UI
- a server-owned fix to the confirmed race

### 9.2 Residual risk: stale onboarding cookie

The normal path already deletes the cookie in `completeOnboarding`, so the happy path is covered.

Residual edge case:

- DB onboarding state becomes complete
- cookie remains stale
- edge middleware still redirects `/users` to `/onboarding`

That can cause a completed-user bounce if the stale cookie persists.

I do **not** consider that a blocker for the minimum safe hang fix, but it should be tracked as follow-up hardening if observed in practice. The clean hardening path would be a later cookie-cleanup Route Handler for already-complete onboarding exits.

## 10. Final Answers

### 10.1 Approved final implementation shape

**Yes, the cookie-bridge remains the right fix class, but only as a bootstrap-handoff design:**

- Clerk lands on `/auth/bootstrap?redirect_url=/users`
- bootstrap page does provisioning and decision-making
- incomplete onboarding redirects to a nested Route Handler
- the Route Handler legally sets the cookie and redirects to `/onboarding`
- middleware reads the cookie on future requests
- the onboarding Server Action deletes the cookie on completion

### 10.2 Exact runtime-legal boundary for mutation

- **Write**: `src/app/auth/bootstrap/handoff/route.ts`
- **Delete**: `src/app/onboarding/actions.ts`

### 10.3 Exact target files

Required:

- `src/app/auth/bootstrap/page.tsx`
- `src/app/auth/bootstrap/handoff/route.ts`
- `.env.example`
- `.env.local`
- `src/testing/infrastructure/env.ts`
- `src/app/auth/bootstrap/page.test.tsx`
- `src/app/auth/bootstrap/handoff/route.test.ts`

Keep as-is for the core fix:

- `src/security/middleware/with-auth.ts`
- `src/app/onboarding/actions.ts`
- `src/app/users/layout.tsx`
- `src/proxy.ts`
- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

### 10.4 Forbidden patterns

- `cookies().set()` in `page.tsx` / `layout.tsx` render
- any cookie mutation outside Route Handlers or Server Actions
- keeping post-auth Clerk landing on `/users`
- raw cookie/path branching in `src/proxy.ts`
- client-side routing hacks as the primary fix
- using the cookie as auth truth
- bypassing the repo's server-owned provisioning/auth boundaries

### 10.5 Concrete implementation guidance for the final pass

1. Change the Clerk post-auth redirect env values from `/users` to `/auth/bootstrap?redirect_url=/users`.
2. Remove `cookies` usage from `src/app/auth/bootstrap/page.tsx`.
3. Change the incomplete-onboarding redirect in bootstrap page to `/auth/bootstrap/handoff?redirect_url=...`.
4. Add `src/app/auth/bootstrap/handoff/route.ts` to set `__onboarding_pending` and redirect to `/onboarding?redirect_url=...`.
5. Leave `src/security/middleware/with-auth.ts` as the read/enforcement point.
6. Leave `src/app/onboarding/actions.ts` as the happy-path delete point.
7. Update the bootstrap tests and add handoff-route tests.

## 11. Recommended Next Action

Implement the bootstrap-handoff variant, not the old page-render cookie-write variant and not a broader Clerk-metadata redesign.
