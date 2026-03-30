# Onboarding Transition Boundary Analysis

**Session**: `e7060e31-64b3-44c2-b93c-9f3b02dccd32`  
**Date**: 2026-03-17  
**Scope**: `/users -> /onboarding` transition hang only  
**Primary inputs**:

- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/single-failing-postgres-run-correlation.md`
- `.zencoder/chats/e7060e31-64b3-44c2-b93c-9f3b02dccd32/plan.md`
- `src/app/onboarding/layout.tsx`
- `src/app/onboarding/onboarding-form.tsx`

---

## 1. Objective

Determine the first plausible failing point after `/users` has already redirected correctly to `/onboarding`, and classify whether the current hang is primarily:

- `OnboardingGuard` server-entry behavior
- App Router route-settlement behavior
- onboarding client mount/hydration
- Clerk client-state interaction during onboarding entry
- dev-runtime-state amplification

No implementation is proposed here beyond identifying the narrowest safe next fix target.

---

## 2. Current-State Findings

### 2.1 Confirmed upstream boundary

From `single-failing-postgres-run-correlation.md`:

- `/auth/bootstrap` is **not** the current failure boundary
- `/users` completes normally
- `/users` correctly decides `redirect:/onboarding`
- the first meaningful divergence happens immediately after that redirect

So this analysis starts **after** `src/app/users/layout.tsx:94-96`, where `UsersLayout` issues:

```ts
if (access.status === 'ONBOARDING_REQUIRED') {
  redirect('/onboarding');
}
```

### 2.2 Framework behavior that matters here

From Next.js docs:

- layouts and pages are Server Components by default, and route transitions are resolved through the server-rendered RSC payload before the client commits the new route
  - source: `/docs/app/getting-started/server-and-client-components`
- `redirect()` in a Server Component throws framework control flow and terminates the current segment
  - source: `/docs/app/api-reference/functions/redirect`
- route transitions that depend on request-time server work can feel stalled without `loading.tsx`; `loading.tsx` is the special route-level mechanism that gives prefetched fallback UI and immediate feedback
  - source: `/docs/app/getting-started/linking-and-navigating`
  - source: `/docs/app/api-reference/file-conventions/loading`
- a Client Component form bound to a Server Action does not do work on mount by itself; it becomes relevant on user interaction
  - source: `/docs/app/getting-started/updating-data`

These framework rules strongly shape the likely failure boundary here.

---

## 3. File-Level Analysis

### 3.1 `src/app/onboarding/layout.tsx`

Relevant code:

- `OnboardingLayout` wraps the route in `Suspense` with `fallback={null}`
  - `src/app/onboarding/layout.tsx:10-19`
- `OnboardingGuard` performs:
  - `getAppContainer()`
  - `identityProvider.getCurrentIdentity()`
  - `userRepository.findById(identity.id)`
  - redirect branches for bootstrap, sign-in, or `/users`
  - `src/app/onboarding/layout.tsx:22-67`

#### What this guard actually does

`OnboardingGuard` repeats the same two server-side checks that already succeeded in the previous route:

1. identity resolution
2. internal user lookup

That matters because `UsersLayout` already performed the same essential sequence through `evaluateNodeProvisioningAccess(...)`:

- `identityProvider.getCurrentIdentity()`
  - `src/security/core/node-provisioning-access.ts:103-127`
- `userRepository.findById(identity.id)`
  - `src/security/core/node-provisioning-access.ts:149-171`
- onboarding incomplete branch
  - `src/security/core/node-provisioning-access.ts:173-192`

So the onboarding route is entering a **second async server boundary** immediately after the first one already proved:

- auth is present
- the internal user exists
- onboarding is incomplete

#### What could stall here without a clear server error

This file contains the strongest repo-owned stall boundary because:

- the guard is `async`
- it sits under `Suspense fallback={null}`
- there is **no onboarding-local `loading.tsx`**
- there is **no onboarding-local `error.tsx`**
- there is **no logging inside `OnboardingGuard`**

This means any repeated suspend, delayed await, or repeated request re-entry here can look like a hang without producing a clear route-specific error UI or log line.

#### Repeated server-entry behavior

The prior correlation report already showed repeated `auth:identity_claims_resolved` events after `/users -> /onboarding`. This is consistent with:

- repeated onboarding server entry
- duplicated RSC fetches/retries
- route settlement retries before the route visibly stabilizes

This file is the first place where those repeated entries can occur after `/users` has already redirected correctly.

#### Important nuance

There is no strong evidence that the **redirect branches inside `OnboardingGuard` are logically wrong**. The tests in `src/app/onboarding/layout.test.tsx` confirm the intended behavior:

- unprovisioned -> `/auth/bootstrap`
- unauthenticated -> `/sign-in`
- onboarded -> `/users`
- incomplete onboarding -> render children

So the likely issue is **not** a bad branch condition. The likely issue is the **async route-entry boundary itself**.

### 3.2 `src/app/onboarding/onboarding-form.tsx`

Relevant code:

- local React state only
  - `src/app/onboarding/onboarding-form.tsx:8-9`
- one submit handler for the server action
  - `src/app/onboarding/onboarding-form.tsx:11-25`
- no effects
- no router hooks
- no pathname/search-param hooks
- no transitions
- no mount-time server action invocation

#### What this means

This component is **not a plausible first failing point** for the current hang.

Why:

- it does nothing on first mount except render static form UI
- it does not call `completeOnboarding` until submit
- it does not use `useEffect`
- it does not use `useRouter`
- it does not start any transition or refresh loop

So if the page hangs immediately after `/users` redirects, the failure is almost certainly **before `OnboardingForm` becomes the active problem**.

### 3.3 Root client boundary that still matters

Relevant code:

- root layout wraps the app in `ClerkProvider`
  - `src/app/layout.tsx:72-87`
- root layout also uses `Suspense fallback={null}`
  - `src/app/layout.tsx:72-91`
- header auth controls mount Clerk client UI and force one client rerender via `isMounted`
  - `src/modules/auth/ui/HeaderAuthControls.tsx:16-37`
- header renders Clerk `SignedIn`, `SignedOut`, and `UserButton`
  - `src/modules/auth/ui/HeaderAuthControls.tsx:45-77`

This means onboarding entry is not isolated from Clerk. Even though the onboarding route code does not directly call Clerk client hooks, the route still settles inside a global client tree that includes:

- `ClerkProvider`
- Clerk auth UI components in the header

So Clerk is still materially present at route-settlement time, but it is **not directly exercised by onboarding-specific code**.

---

## 4. Exact Handoff Boundary

The exact handoff sequence is:

1. `UsersLayout`
   - `src/app/users/layout.tsx:94-96`
   - server throws `redirect('/onboarding')`
2. App Router navigation settlement
   - browser/client waits for the `/onboarding` route payload and route tree to settle
3. `OnboardingLayout`
   - `src/app/onboarding/layout.tsx:10-19`
   - wraps entry in `Suspense fallback={null}`
4. `OnboardingGuard`
   - `src/app/onboarding/layout.tsx:22-67`
   - repeats identity + user lookup and decides whether to redirect or render
5. `OnboardingForm`
   - `src/app/onboarding/onboarding-form.tsx:7-111`
   - first client-rendered onboarding UI

### The first plausible failing point

The **first plausible failing point after `/users` redirects correctly** is:

> `src/app/onboarding/layout.tsx`, specifically the `OnboardingLayout` + `OnboardingGuard` async server-entry boundary

Not because the redirect conditions look wrong, but because this is the first place where:

- route settlement depends on another async server pass
- there is no route-level loading UI
- the fallback is `null`
- repeated entry can occur without a clear local error signal

---

## 5. Primary Failure Classification

### 5.1 Server-entry vs route-settlement vs client-mount

**Best classification**: `route-settlement related`, at the onboarding server-entry boundary

More precise statement:

> The hang is primarily a route-settlement problem centered on the async onboarding layout boundary, not a client-mount problem inside `OnboardingForm`.

Why not primarily `client-mount related`:

- `OnboardingForm` has no mount-time effects, router calls, or transitions
- there is no code in that file that can create an immediate post-redirect loop or refresh storm

Why not primarily `OnboardingGuard logic bug`:

- its branch conditions are straightforward and tested
- the same identity and user lookup already succeeded one route earlier in `UsersLayout`
- the likely issue is the presence of a second opaque async boundary, not a wrong redirect decision

### 5.2 Strongest repo-owned failing boundary

The strongest repo-owned failing boundary is:

> `OnboardingLayout`'s `Suspense fallback={null}` combined with the async `OnboardingGuard` server entry

That combination can make route settlement look hung even when no explicit server error is thrown.

---

## 6. Is Clerk Still Materially Involved?

### 6.1 Server-side Clerk involvement

At this stage, Clerk is **still involved**, but the server-side Clerk path is **not the strongest primary suspect**.

Why:

- `OnboardingGuard` reaches identity through the request identity stack backed by Clerk auth/session resolution
- the failing-run correlation already showed repeated successful `auth:identity_claims_resolved`
- so server-side Clerk identity resolution is still active, but it is not failing in a way that explains the observed boundary

### 6.2 Client-side Clerk involvement

Clerk is still materially involved on the client because:

- the entire app is wrapped in `ClerkProvider`
  - `src/app/layout.tsx:72-87`
- the shared header mounts Clerk UI
  - `src/modules/auth/ui/HeaderAuthControls.tsx:45-77`

So Clerk can still amplify or destabilize route settlement or hydration **globally**.

But the important architectural distinction is:

> there is no onboarding-specific Clerk client code in `src/app/onboarding/*`

So Clerk is a **shared client-boundary participant**, not the first repo-owned onboarding failure point.

### 6.3 Net assessment on Clerk

Clerk is **still materially involved as an environment participant**, but **not as the first likely failing file/function inside the onboarding route**.

---

## 7. Dev-Runtime-State Amplification

`dev-runtime-state` still looks like a plausible amplifier, not the primary root cause.

Why:

- the previous correlation report already observed repeated request activity and later retry windows
- Next.js Fast Refresh can re-run or fully reload depending on what changed
  - source: `/docs/architecture/fast-refresh`
- the root and onboarding boundaries both use `Suspense fallback={null}`, so any dev-time rerender/retry can remain visually opaque

What this means:

- dev runtime churn can make the route feel more unstable
- but the repo-owned fix target should still start at the onboarding route-entry boundary, not at generic dev tooling

---

## 8. Architectural Assessment

### 8.1 What is most likely happening

The most likely sequence is:

1. `/users` correctly redirects to `/onboarding`
2. App Router begins settling the new route
3. `OnboardingGuard` re-runs identity and user lookup
4. because this boundary is async, opaque, and lacks segment-level loading/error visibility, the route can remain in an unresolved-looking state
5. if a shared client boundary like Clerk is also retrying or not fully settled, the user experiences a hang before `OnboardingForm` becomes relevant

### 8.2 What is least likely

Least likely primary cause:

- `src/app/onboarding/onboarding-form.tsx`

Reason:

- no first-mount side effects
- no router usage
- no transition logic
- no automatic action call

### 8.3 Lowest-blast-radius diagnosis

The lowest-blast-radius diagnosis is:

> the first plausible failing boundary is the onboarding route-entry layer, not the form, not bootstrap, and not the onboarding server action

---

## 9. Recommended Minimum Safe Next Fix Target

**Minimum safe next fix target**:

> `src/app/onboarding/layout.tsx`, specifically the async `OnboardingGuard` boundary and its route-entry visibility

Why this is the safest next target:

- it is the first plausible failing point after `/users`
- it is lower blast radius than changing root auth or Clerk wiring
- it avoids touching the confirmed-correct bootstrap path
- it targets the part of the route that can currently stall without a clear local signal

### What should be targeted first

The next fix should focus on the onboarding entry boundary, especially:

- the redundant second identity/user lookup in `OnboardingGuard`
- the `Suspense fallback={null}` opacity
- the absence of `app/onboarding/loading.tsx`
- the absence of onboarding-local entry/exit diagnostics

This is the minimum safe place to intervene before considering any broader Clerk or root-layout changes.

---

## 10. Direct Answers

### 10.1 Exact likely failing file/function/component boundary

`src/app/onboarding/layout.tsx`, at the `OnboardingLayout` + `OnboardingGuard` async server-entry boundary.

### 10.2 Is the hang primarily server-entry, route-settlement, or client-mount related?

Primarily **route-settlement related**, centered on the onboarding server-entry boundary.  
Secondarily influenced by server-entry opacity.  
Not primarily client-mount related.

### 10.3 Is Clerk still materially involved at this stage?

**Yes, but indirectly.**

- not as onboarding-specific code
- yes as the global `ClerkProvider` and shared header auth UI during route settlement/hydration
- server-side Clerk identity resolution appears healthy in the failing run

### 10.4 Minimum safe next fix target

`src/app/onboarding/layout.tsx` first.  
Do not start with `src/app/onboarding/onboarding-form.tsx`.  
Do not go back to `/auth/bootstrap`.

---

## 11. Bottom Line

The current hang is most likely **not** in the onboarding form and **not** in bootstrap. The first plausible repo-owned failure point after `/users` redirects correctly is the **opaque async onboarding layout boundary** in `src/app/onboarding/layout.tsx`. The hang is best classified as a **route-settlement problem at onboarding entry**, with Clerk still present as a global client-state participant and dev runtime likely acting as an amplifier rather than the primary cause.
