# Post-Auth Landing Remediation Shape

## Objective

Review the two post-bootstrap transition analyses and approve the minimum architecture-safe remediation shape for the post-auth landing strategy.

Inputs reviewed:

- `post-bootstrap-client-transition-analysis.md`
- `post-bootstrap-client-transition-analysis-copilot.md`
- current repository routing and auth entry points

Constraint: investigation/design only. No implementation.

## Executive Decision

### Approved remediation shape

The approved minimum safe remediation shape is:

- **stop using `/auth/bootstrap` as the direct Clerk force/fallback landing route**
- **land Clerk on an existing stable authenticated route instead**
- **keep `/auth/bootstrap` as a repository-owned server-side provisioning trampoline reached only when guards determine it is required**

In this repository, the safest shape is:

- Clerk completes auth
- Clerk lands on a stable authenticated entry route
- repository-owned server guards decide whether to:
  - continue to the app
  - redirect to `/onboarding`
  - redirect to `/auth/bootstrap?redirect_url=...` when provisioning is actually required

This preserves provisioning behavior while removing `/auth/bootstrap` from the most fragile part of Clerk’s `setActive -> invalidate cache -> router.refresh()` transition window.

## 1. Should `/auth/bootstrap` Stop Being The Direct Clerk Force/Fallback Landing Route?

### Approved answer

Yes.

`/auth/bootstrap` should stop being the immediate Clerk post-auth landing route.

### Why

Both analyses converge on the same structural problem:

- `/auth/bootstrap` is not a stable destination
- it is a redirect-only server-side transition route on the success path
- Clerk’s App Router lifecycle is likely refreshing the current route while that redirect is still in flight

That means `/auth/bootstrap` is the wrong place to land **directly** from Clerk session activation.

### Important boundary

This does **not** mean `/auth/bootstrap` should be removed.

It still has a valid server-owned role:

- perform provisioning
- resolve onboarding state
- redirect to the correct next route

The issue is not bootstrap’s existence. The issue is using bootstrap as the immediate client landing point from Clerk.

## 2. Safest Fix Shape: Stable Route, Dedicated Handoff Route, Or Config-Only Change?

### Approved choice

The safest minimum fix shape is:

- **switch Clerk landing to an existing stable route by changing repository-owned redirect configuration**

### Why this is preferred over a dedicated handoff route

A new dedicated handoff route such as `/auth/complete` is **not** the minimum safe shape.

Reasons:

- it introduces a new route contract
- it creates another auth transition surface to maintain and test
- if it is also only a redirect trampoline, it risks recreating the same fragility under a different path
- it expands blast radius without being necessary for the current diagnosis

### Why config-only change is enough for minimum scope

The repository already has a stable authenticated route shape capable of routing correctly after auth settles.

For example, existing server guards already support:

- redirecting authenticated-but-unprovisioned access to `/auth/bootstrap?redirect_url=/users`
- redirecting onboarding-required users to `/onboarding`
- allowing fully ready users into `/users`

That means the repo already owns the correct decision logic. The unstable piece is only where Clerk lands first.

### Approved remediation pattern

- change Clerk’s configured post-auth landing away from `/auth/bootstrap`
- point it to a stable app entry route already protected by repository-owned server guards
- let those guards decide whether bootstrap is needed

### Candidate shape

The best candidate is an existing authenticated entry route, such as `/users`, or an equivalent stable app entry route already governed by server-side provisioning access checks.

## 3. Preferred Primary Fix Target Files

### Primary fix targets

1. `src/app/layout.tsx`
2. `src/modules/auth/ui/HeaderAuthControls.tsx`

### Why these are the right primary targets

`src/app/layout.tsx` is the top-priority file because:

- it mounts `ClerkProvider`
- it defines provider-level auth redirect behavior
- it is the cleanest repository-owned place to stop sending Clerk directly to `/auth/bootstrap`

`src/modules/auth/ui/HeaderAuthControls.tsx` is the second target because:

- it passes per-button redirect props for modal sign-in/sign-up
- leaving those props on `/auth/bootstrap` would preserve inconsistent behavior even if layout-level config changes

### New route target?

Not in the minimum safe scope.

A new dedicated handoff route should **not** be the first move unless a later validation step proves that an existing stable route cannot preserve the required post-auth semantics.

### Bootstrap route as primary target?

No.

`src/app/auth/bootstrap/page.tsx` should not be the first remediation target because:

- server-side bootstrap success is already confirmed
- bootstrap is still needed for provisioning
- changing bootstrap first increases risk of breaking correct server behavior while not addressing the identified client handoff instability

## 4. Minimum Safe Implementation Scope

### Approved minimum scope

The minimum safe implementation scope is:

1. change Clerk post-auth force/fallback landing configuration away from `/auth/bootstrap`
2. use a stable repository-owned authenticated entry route as the landing target
3. keep all provisioning and onboarding resolution in existing server guards and `/auth/bootstrap`
4. update all repository-owned Clerk entry points so they agree on the same landing behavior

### What this scope intentionally avoids

- no redesign of auth architecture
- no change to provisioning domain logic
- no change to middleware auth classification
- no change to Clerk internals
- no new auth route contract unless later evidence proves it is needed

### Why this is low blast radius

Because it only changes:

- where Clerk lands first

It does **not** change:

- how provisioning is evaluated
- how bootstrap succeeds or fails
- how onboarding is decided
- how private-route middleware works

### Architectural shape after remediation

After the minimum fix, the intended flow becomes:

1. Clerk finishes auth and session activation
2. browser lands on a stable authenticated route
3. repository-owned server guard evaluates current state
4. if bootstrap is required, server redirects to `/auth/bootstrap?redirect_url=...`
5. bootstrap provisions and redirects onward
6. if bootstrap is not required, app continues normally

That shape is safer because Clerk’s refresh lifecycle happens on a stable route, not on a redirect-only provisioning trampoline.

## 5. Forbidden Patterns

The following implementation patterns should be forbidden for the first remediation pass.

### Forbidden pattern 1

- **Do not patch or rely on Clerk internal unstable hooks as the primary fix**

Examples:

- changing undocumented Clerk internals
- monkey-patching `window.__unstable__onBeforeSetActive`
- monkey-patching `window.__unstable__onAfterSetActive`
- depending on unstable provider internals as a permanent solution

Reason:

- high maintenance cost
- poor upgrade safety
- moves ownership outside repository boundaries

### Forbidden pattern 2

- **Do not redesign `/auth/bootstrap` into a client-managed handoff page**

Examples:

- moving provisioning decisions into client code
- converting bootstrap into a client navigation orchestrator
- adding client polling/timeouts to force navigation away from bootstrap

Reason:

- violates server ownership of auth/provisioning decisions
- increases security and correctness risk

### Forbidden pattern 3

- **Do not change middleware as the first fix**

Examples:

- adding more callback-param exceptions
- adding special bootstrap/client-transition branches to middleware
- trying to solve the post-auth handoff race inside proxy/auth middleware

Reason:

- middleware is no longer the strongest root-cause candidate
- increases blast radius for all requests

### Forbidden pattern 4

- **Do not introduce a new redirect trampoline route as the first fix if it only forwards again**

Examples:

- creating `/auth/complete` that immediately redirects to `/auth/bootstrap`
- adding another transient server route without introducing a genuinely stable landing state

Reason:

- likely recreates the same timing sensitivity under a different path

### Forbidden pattern 5

- **Do not change only one of the repository-owned Clerk redirect surfaces**

Examples:

- updating `src/app/layout.tsx` but leaving modal button props in `src/modules/auth/ui/HeaderAuthControls.tsx` on `/auth/bootstrap`
- updating header buttons but leaving provider-level redirects unchanged

Reason:

- creates split behavior
- makes verification ambiguous

### Forbidden pattern 6

- **Do not bypass provisioning by sending users directly to app routes without guard enforcement**

Examples:

- routing directly to `/users` while weakening server guard checks
- assuming stable landing means bootstrap is no longer needed

Reason:

- provisioning and onboarding enforcement must remain server-owned

## 6. Preferred Remediation Shape In One Sentence

Approved shape:

- **land Clerk on a stable authenticated route, keep bootstrap server-owned and secondary, and let existing server guards decide when bootstrap is actually required**

## 7. Recommended Repository-Owned Target Files

### Primary

- `src/app/layout.tsx`
- `src/modules/auth/ui/HeaderAuthControls.tsx`

### Secondary only if needed for config consistency

- environment/default config surfaces that define the Clerk redirect URLs

### Not primary for the first pass

- `src/app/auth/bootstrap/page.tsx`
- middleware files
- a new dedicated handoff route

## 8. Final Answer

- approved remediation shape: **remove `/auth/bootstrap` as Clerk’s direct post-auth force/fallback landing and use a stable authenticated entry route instead; keep bootstrap as a server-owned secondary provisioning route**
- preferred fix target files: **`src/app/layout.tsx` first, `src/modules/auth/ui/HeaderAuthControls.tsx` second, plus any environment-backed redirect config they rely on**
- forbidden patterns: **patching Clerk internals, moving provisioning into client code, changing middleware first, adding another transient redirect trampoline, changing only one redirect surface, or bypassing server guard enforcement**
- minimum safe implementation scope: **repository-owned redirect configuration only, with provisioning/onboarding logic preserved as-is and bootstrap reached only through existing server guards when actually required**
