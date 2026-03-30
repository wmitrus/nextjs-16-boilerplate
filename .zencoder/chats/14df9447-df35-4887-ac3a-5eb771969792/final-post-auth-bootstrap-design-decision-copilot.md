# Final Post-Auth Bootstrap Design Decision

**Agent**: GitHub Copilot  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: `2026-03-18`  
**Decision**: **APPROVED — direct Clerk landing on `/auth/bootstrap` should be removed**

---

## 1. Objective

Determine the final architecture for the auth/bootstrap/onboarding flow after the route-handler cookie-bridge implementation, given the new runtime fact:

- the app can still hang on `/auth/bootstrap?redirect_url=/users`
- onboarding never appears in the failing run
- the handoff route and cookie-bridge path are therefore not reached in that failing run

This review decides whether `/auth/bootstrap` should remain the **direct Clerk post-auth landing route**, compares the candidate shapes, and defines the final approved implementation target.

---

## 2. Current-State Findings

### 2.1 The route-handler cookie bridge is runtime-legal but downstream of the active blocker

Current code confirms:

- [src/app/auth/bootstrap/page.tsx](/home/wojtek/projects/nextjs-16-boilerplate/src/app/auth/bootstrap/page.tsx) no longer writes cookies illegally in RSC render
- [src/app/auth/bootstrap/handoff/route.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/app/auth/bootstrap/handoff/route.ts) is now the legal cookie-write boundary
- [src/security/middleware/with-auth.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/security/middleware/with-auth.ts) is still the correct edge read/enforcement point
- [src/app/onboarding/actions.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/app/onboarding/actions.ts) remains the correct delete point

That implementation is structurally correct for the cookie bridge itself.

However, the new runtime fact changes the architectural conclusion:

> if the hang still occurs on `/auth/bootstrap` before the handoff route is reached, the blocker is not the cookie bridge anymore. The blocker is using `/auth/bootstrap` as Clerk’s direct first landing boundary.

### 2.2 Current redirect wiring still makes `/auth/bootstrap` the first app-owned route after Clerk auth

Current environment wiring in [.env.example](/home/wojtek/projects/nextjs-16-boilerplate/.env.example) points all Clerk post-auth redirect targets to:

`/auth/bootstrap?redirect_url=/users`

Those env values are normalized and passed through in:

- [src/app/layout.tsx](/home/wojtek/projects/nextjs-16-boilerplate/src/app/layout.tsx)
- [src/modules/auth/ui/HeaderAuthControls.tsx](/home/wojtek/projects/nextjs-16-boilerplate/src/modules/auth/ui/HeaderAuthControls.tsx)

So Clerk currently lands users directly on the heavy bootstrap page.

### 2.3 `/auth/bootstrap` is a heavy server-owned boundary, not a stable landing route

[src/app/auth/bootstrap/page.tsx](/home/wojtek/projects/nextjs-16-boilerplate/src/app/auth/bootstrap/page.tsx) currently does all of the following on first render:

- request-scoped logging
- identity lookup
- tenant/org conditional logic
- provisioning service execution
- DB user lookup
- error rendering decisions
- redirect decision to either `/auth/bootstrap/handoff` or the safe target

This is the correct place for **provisioning and final server-owned decisions**.

It is **not** a good direct post-auth landing surface.

Architecturally, this matters because the failing boundary now sits **before** the handoff route and before onboarding can render. That means the instability is attached to the initial landing onto bootstrap itself, not to the downstream onboarding redirect logic.

### 2.4 Existing evidence already pointed in this direction

Repository memory already captured the earlier direction:

- [middleware-routing.md](/memories/repo/middleware-routing.md) line 6: stop using `/auth/bootstrap` as Clerk’s direct post-auth landing and prefer a stable authenticated entry route, then let server guards redirect into bootstrap only when needed.

The new runtime fact validates that earlier direction rather than contradicting it.

### 2.5 Current logs show bootstrap is reached, but the critical point is that it is still the first unstable boundary

Current log history includes multiple `bootstrap:entry` and `bootstrap:redirect` events in [logs/server.log](/home/wojtek/projects/nextjs-16-boilerplate/logs/server.log), and there are no matching handoff-route log markers in the searched runtime logs.

That is consistent with the new fact pattern:

- the app reaches bootstrap
- bootstrap remains the first app-owned landing surface after Clerk callback completion
- the failure can still occur before the downstream handoff/cookie path matters

The cookie bridge therefore did not address the highest-risk boundary.

### 2.6 There is also current test/config drift

[src/testing/infrastructure/env.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/testing/infrastructure/env.ts) still defaults Clerk post-auth redirects to `/users`, while runtime env defaults moved to `/auth/bootstrap?...`.

That is not the root cause of the production/runtime issue, but it is a sign that redirect-strategy behavior is not consistently modeled across the repo.

---

## 3. Architectural Assessment

### 3.1 Does the latest runtime evidence show that direct landing on `/auth/bootstrap` is fundamentally unstable in this architecture?

**Yes.**

More precisely:

`/auth/bootstrap` is fundamentally unstable **as the direct Clerk post-auth landing page** in this repository’s current architecture.

I am not concluding that `bootstrap/page.tsx` is an invalid route in general.

I am concluding that it is the wrong **first boundary** immediately after Clerk callback/session finalization because it is simultaneously:

- server-rendered
- dynamic
- provisioning-heavy
- redirecting
- DB-backed
- used during a sensitive post-auth transition window

That is too much work and too much state coupling for the very first route Clerk hands control to.

The route-handler handoff does not fix that, because it only runs **after** bootstrap successfully settles and redirects onward.

### 3.2 Why this is the wrong first boundary under Next.js 16 + Clerk

Relevant Next.js guidance:

- Next.js navigation docs state that on subsequent navigations, the client must wait for the server response before the new route can be shown, especially for dynamic routes.
- Next.js route-handler docs state that route handlers do not participate in layouts or client-side navigations like pages.

Relevant Clerk guidance:

- Clerk’s onboarding guidance assumes a stable post-auth landing target plus middleware/server checks, not a heavy app-specific provisioning page as the fragile first boundary.
- Clerk also documents using configured redirect URLs as the post-auth destination, with app logic then handling onboarding rules.

In this repo, `/auth/bootstrap` is not a lightweight “land here, then continue” route. It is the provisioning engine entrypoint. That is an acceptable second boundary, not the best first one.

### 3.3 Correct interpretation

The final problem is now:

> the app needs a **stable post-auth landing route** that can reliably commit after Clerk finishes its own callback/session sync, and only then trigger the heavier bootstrap/provisioning boundary.

That is the required architectural separation.

---

## 4. Candidate Comparison

### A. Keep `/auth/bootstrap` as the direct landing page

**Rejected.**

Why:

- latest runtime evidence shows the failure still happens at that boundary
- the handoff route is not reached in the failing run, so the problem is earlier
- it keeps Clerk’s first landing on the heaviest app-owned server boundary
- it maximizes coupling between session-finalization timing and provisioning/redirect logic

### B. Stable post-auth landing route + separate bootstrap/provisioning boundary

**Approved. This is the correct final design family.**

Why:

- it separates “session settled enough to enter the app” from “run heavy provisioning and redirect logic”
- it preserves bootstrap as the DB-backed server-owned boundary
- it gives Clerk a lighter, more stable, Next-compatible landing route first
- it keeps business truth in the app, not in Clerk or cookies

### C. Dedicated route handler / server action driven bootstrap trigger

**Rejected as the primary final shape.**

Why:

- a route handler is a legal cookie boundary, but Next.js docs explicitly note route handlers do not participate in layouts or client-side navigations like pages
- a route handler is not a good stabilization surface for the first post-auth landing
- a server action requires a client-triggered POST and is not a natural fit for the initial auth redirect lifecycle
- neither option gives the app a stable committed UI boundary before bootstrap begins

Route handlers remain correct for the downstream cookie handoff. They are not the right first landing mechanism.

### D. Another better repository-compatible option

**The best concrete option is a refined version of B, not a different design family.**

The recommended concrete shape is:

- a **thin client stabilization route** as the direct Clerk landing target
- then a forced document navigation to the existing bootstrap page
- then the existing bootstrap-to-handoff-to-onboarding chain as needed

In this repository, the best placement is inside the existing bootstrap route family:

`/auth/bootstrap/landing` -> `/auth/bootstrap` -> `/auth/bootstrap/handoff` -> `/onboarding`

This is better than inventing a separate `/api/...` or heavy server redirect chain because it:

- reuses existing `isBootstrapRoute` classification in [route-classification.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/security/middleware/route-classification.ts)
- keeps auth/bootstrap delivery concerns grouped together
- avoids introducing a new middleware category for the landing route

---

## 5. Final Approved Design Decision

### 5.1 Final decision

**Remove `/auth/bootstrap` as the direct Clerk post-auth landing page.**

Keep bootstrap, but demote it from “first landing boundary” to “second-stage server provisioning boundary.”

### 5.2 Final approved flow

1. Clerk post-auth redirect target becomes:
   - `/auth/bootstrap/landing?redirect_url=/users`

2. `/auth/bootstrap/landing`
   - is a minimal client stabilization page
   - renders lightweight loading UI only
   - waits for Clerk client auth state to be loaded and signed-in
   - then performs a **full document navigation** using `window.location.replace(...)` to:
     - `/auth/bootstrap?redirect_url=/users`

3. `/auth/bootstrap`
   - remains the server-owned provisioning and decision boundary
   - runs identity resolution, provisioning, user lookup, error handling
   - if onboarding is incomplete, redirects to `/auth/bootstrap/handoff?redirect_url=...`
   - if complete, redirects to the safe target

4. `/auth/bootstrap/handoff`
   - remains the legal route-handler cookie write boundary
   - sets `__onboarding_pending=1`
   - redirects to `/onboarding?redirect_url=...`

5. `/onboarding`
   - remains guarded by the DB-backed onboarding guard

6. `completeOnboarding`
   - remains the legal cookie delete boundary

### 5.3 Why this is the best fit for the repository

This design best preserves:

- **current business cases**: onboarding and provisioning logic stay intact
- **modular monolith boundaries**: Clerk auth landing, bootstrap provisioning, middleware routing, and onboarding completion remain separated
- **security guarantees**: DB-backed server truth stays authoritative; cookie remains only a routing hint
- **DB-backed source of truth**: provisioning/onboarding state still comes from internal repositories, not Clerk metadata
- **Clerk/Next best practices**: direct post-auth landing becomes lightweight and stable; heavier server logic moves to a follow-up navigation

---

## 6. Exact Target Boundaries / Files

### Direct implementation targets

| File                                         | Decision                | Role                                                                             |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `src/app/auth/bootstrap/landing/page.tsx`    | **ADD**                 | Direct Clerk post-auth landing route; minimal client stabilization page          |
| `src/app/auth/bootstrap/landing/loading.tsx` | **OPTIONAL ADD**        | Lightweight loading UI if desired                                                |
| `src/app/auth/bootstrap/page.tsx`            | **KEEP / SMALL CHANGE** | Remains provisioning boundary; no longer direct Clerk landing target             |
| `src/app/auth/bootstrap/handoff/route.ts`    | **KEEP**                | Legal cookie-write boundary                                                      |
| `src/app/onboarding/actions.ts`              | **KEEP**                | Legal cookie-delete boundary                                                     |
| `.env.example`                               | **CHANGE**              | Point Clerk post-auth redirects to `/auth/bootstrap/landing?redirect_url=/users` |
| `.env.local`                                 | **CHANGE**              | Keep local runtime aligned with final landing strategy                           |
| `src/testing/infrastructure/env.ts`          | **CHANGE**              | Align test defaults with actual runtime redirect strategy                        |
| `src/app/layout.tsx`                         | **NO LOGIC CHANGE**     | Continues to pass env-driven Clerk redirect props                                |
| `src/modules/auth/ui/HeaderAuthControls.tsx` | **NO LOGIC CHANGE**     | Continues to pass env-driven Clerk redirect props                                |

### Middleware / classification impact

No new route-classification concept is required if the stable landing page lives under `/auth/bootstrap/landing`, because [route-classification.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/security/middleware/route-classification.ts) already treats `/auth/bootstrap/*` as `isBootstrapRoute`.

That is one of the main reasons this is the best repository-compatible placement.

### Recommended shape of the new landing page

The new landing page should be intentionally thin:

- `'use client'`
- no DI container access
- no provisioning calls
- no DB calls
- no business branching beyond “auth loaded and signed in”
- after auth is settled, call `window.location.replace('/auth/bootstrap?redirect_url=...')`

I recommend `window.location.replace(...)`, not `router.replace(...)`, because the goal is a clean document navigation into the server-owned bootstrap boundary after Clerk finishes its client-side session work.

---

## 7. Explicitly Rejected Approaches

1. **Keep `/auth/bootstrap` as the direct Clerk landing route**
   - rejected because it is still the active unstable boundary

2. **Keep `/users` as the direct Clerk landing route**
   - rejected because earlier evidence already showed the `/users -> /onboarding` server redirect boundary was fragile during post-auth settlement

3. **Route-handler-only landing strategy**
   - rejected because route handlers are not a good first landing surface for stabilization

4. **Server-action-driven initial bootstrap trigger**
   - rejected because it is unnatural for the initial auth redirect lifecycle and requires a client-triggered mutation step

5. **Move provisioning/onboarding truth into the cookie**
   - rejected because the cookie must remain only a routing hint

6. **Move the main fix into client-side onboarding/business logic**
   - rejected because that would weaken server ownership and authorization clarity

7. **Restore the old always-on production probes exactly as they were**
   - rejected because they were too broad and too invasive for shipping code

---

## 8. Probe / Verification Decision

### Were the probe removals premature?

**Partially yes.**

Removing always-on probes from production code was correct.

Removing all targeted client verification instrumentation **before** the final landing strategy was proven was premature.

### What should happen now?

For the final implementation/verification pass, temporarily restore **scoped, dev-only probes**, not the old permanent global probes.

Recommended temporary probes:

1. a probe in `/auth/bootstrap/landing`
   - logs mount
   - logs when Clerk auth becomes loaded/signed-in
   - logs when `window.location.replace('/auth/bootstrap?...')` is triggered

2. keep existing server logs in bootstrap
   - `bootstrap:entry`
   - `bootstrap:redirect`

3. keep the existing onboarding mount evidence already available in onboarding client components if still present, or add a temporary dev-only onboarding mount marker again

Do **not** restore the old root-wide route probe and visible production debug UI as permanent code.

The correct pattern is:

- targeted
- temporary
- gated behind a dev/debug flag
- removed after final verification

---

## 9. Final Implementation Guidance

1. Change all Clerk post-auth redirect env targets from:
   - `/auth/bootstrap?redirect_url=/users`
     to:
   - `/auth/bootstrap/landing?redirect_url=/users`

2. Add a minimal client landing route at:
   - `src/app/auth/bootstrap/landing/page.tsx`

3. In that page:
   - wait until Clerk client auth state is loaded and authenticated
   - then perform `window.location.replace('/auth/bootstrap?redirect_url=...')`
   - show only a small loading shell while waiting

4. Keep [src/app/auth/bootstrap/page.tsx](/home/wojtek/projects/nextjs-16-boilerplate/src/app/auth/bootstrap/page.tsx) as the heavy server provisioning boundary, but not as the direct Clerk landing boundary

5. Keep [src/app/auth/bootstrap/handoff/route.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/app/auth/bootstrap/handoff/route.ts) for the legal cookie write

6. Keep [src/app/onboarding/actions.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/app/onboarding/actions.ts) for the legal cookie delete

7. Align [src/testing/infrastructure/env.ts](/home/wojtek/projects/nextjs-16-boilerplate/src/testing/infrastructure/env.ts) with the runtime redirect strategy so tests exercise the real flow

8. For the final verification pass, temporarily add targeted dev-only probes around the new landing route and bootstrap handoff, then remove them after the flow is proven stable

---

## 10. Final Return

1. **Final approved design decision**
   - Replace direct Clerk landing on `/auth/bootstrap` with a thin stable landing route, then navigate into bootstrap as a second-stage server boundary.

2. **Should `/auth/bootstrap` stay or be removed from direct post-auth landing?**
   - It should be **removed from direct post-auth landing**.
   - It should remain in the system as the provisioning boundary.

3. **Exact target boundaries/files**
   - Add `src/app/auth/bootstrap/landing/page.tsx`
   - Update `.env.example`, `.env.local`, and `src/testing/infrastructure/env.ts`
   - Keep `src/app/auth/bootstrap/page.tsx`
   - Keep `src/app/auth/bootstrap/handoff/route.ts`
   - Keep `src/app/onboarding/actions.ts`

4. **Rejected approaches**
   - direct landing on `/auth/bootstrap`
   - direct landing on `/users`
   - route-handler-only landing
   - server-action-driven initial bootstrap
   - cookie as source of truth

5. **Final implementation guidance**
   - Use a thin client stabilization route as Clerk’s landing target, then full-document navigate into bootstrap, keep cookie bridge only as the downstream onboarding-routing mechanism.
