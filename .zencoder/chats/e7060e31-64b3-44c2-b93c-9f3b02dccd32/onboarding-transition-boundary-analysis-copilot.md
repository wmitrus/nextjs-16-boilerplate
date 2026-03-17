# Onboarding Transition Boundary Analysis

**Session**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Date**: 2026-03-17  
**Scope**: investigate the current primary failure boundary at the `/users -> /onboarding` transition only  
**Inputs used**:

- `single-failing-postgres-run-correlation.md`
- `plan.md`
- `src/app/onboarding/layout.tsx`
- `src/app/onboarding/onboarding-form.tsx`
- adjacent auth/runtime code that executes during onboarding entry

---

## 1. Objective

Determine whether the current onboarding-transition hang is primarily caused by:

- `OnboardingGuard` server-side behavior
- App Router route settlement during `/onboarding` entry
- client hydration or first mount of onboarding UI
- Clerk client state interaction during onboarding entry
- dev-runtime-state amplification

And return the narrowest safe next fix target without implementing changes.

---

## 2. Current-State Findings

### 2.1 What the prior run correlation already established

The previous report already narrowed the live failure boundary correctly:

- `/users` completes normally
- `/users` decides `redirect:/onboarding`
- the meaningful divergence happens **after** that redirect
- the current failure is **not** at `/auth/bootstrap`

That means the next boundary to inspect is the handoff from:

1. `UsersLayout` server redirect
2. `/onboarding` server entry
3. client route settlement and first mount of the onboarding tree

### 2.2 Runtime limitations during this investigation

No running Next.js dev server with MCP was discoverable from this workspace during this analysis pass, so this report is based on:

- the existing correlated run artifact
- static code analysis
- test coverage
- Next.js redirect and server-function docs

---

## 3. Handoff Boundary Walkthrough

### 3.1 `/users` exit boundary

`src/app/users/layout.tsx` resolves access, logs the decision, and for incomplete onboarding calls:

```ts
redirect('/onboarding');
```

This part is already validated by the prior investigation. The `/users` guard is not the current blocker.

### 3.2 `/onboarding` server-entry boundary

`src/app/onboarding/layout.tsx` is the real entry gate:

```tsx
export default async function OnboardingLayout({ children }) {
  return (
    <Suspense fallback={null}>
      <OnboardingGuard>{children}</OnboardingGuard>
    </Suspense>
  );
}
```

`OnboardingGuard` then performs, in order:

1. `identityProvider.getCurrentIdentity()`
2. `userRepository.findById(identity.id)`
3. redirect decisions:
   - `/auth/bootstrap`
   - `/auth/bootstrap?reason=db-error`
   - `/sign-in`
   - `/users`
4. otherwise render the onboarding subtree

This means the entire `/onboarding` route settlement is blocked on server-side auth and DB lookups before any visible onboarding UI can mount.

### 3.3 `/onboarding` client-entry boundary

`src/app/onboarding/page.tsx` is trivial:

```tsx
return <OnboardingForm />;
```

`src/app/onboarding/onboarding-form.tsx` on first render does **not**:

- run `useEffect`
- call `router.push`, `router.replace`, or `router.refresh`
- invoke the server action on mount
- interact with Clerk
- perform any async work before the user submits the form

So there is no meaningful first-mount logic in the onboarding client tree that explains a pre-render transition hang.

---

## 4. `src/app/onboarding/layout.tsx` Analysis

### 4.1 Identity resolution

`OnboardingGuard` calls:

```ts
identity = await identityProvider.getCurrentIdentity();
```

That call is not a trivial session read. The actual Node path is:

1. `RequestScopedIdentityProvider.getCurrentIdentity()`
2. `RequestIdentitySource.get()`
3. Clerk auth/session claim resolution
4. `DrizzleInternalIdentityLookup.findInternalUserId(...)`

Important consequence:

- even though the earlier logs show `auth:identity_claims_resolved`, that only proves Clerk request identity resolution happened
- it does **not** prove the full `getCurrentIdentity()` call completed
- the next DB-backed internal identity lookup may still be the point where onboarding entry stalls

### 4.2 User lookup

If identity resolution succeeds, `OnboardingGuard` immediately does:

```ts
user = await userRepository.findById(identity.id);
```

This is another server-side DB dependency before the onboarding page can settle.

Important consequence:

- there is no guard-local logging before or after this lookup
- if this query stalls, the route can remain pending without a clear app-level breadcrumb

### 4.3 Redirect conditions

Redirect logic itself is straightforward and covered by tests:

- `UserNotProvisionedError` -> `/auth/bootstrap`
- other identity-provider failures -> `/auth/bootstrap?reason=db-error`
- no identity -> `/sign-in`
- no user row -> `/auth/bootstrap`
- `onboardingComplete === true` -> `/users`
- otherwise render children

There is no obvious redirect loop encoded in the logic itself for the incomplete-onboarding case.

### 4.4 Repeated server-entry behavior risk

The real risk in this file is not branching complexity. The real risk is that:

- `OnboardingGuard` is async
- it runs before any onboarding UI is visible
- it is wrapped in `Suspense fallback={null}`
- it has no instrumentation of its own

So if server entry is retried or delayed, the user sees a route that appears to hang with no visible fallback and little route-local evidence.

### 4.5 Where route settlement can stall without a clear server error

The most important design property of this file is:

> `/onboarding` cannot visually settle until `OnboardingGuard` finishes server work, and while it is pending the fallback is `null`.

That creates an opaque failure mode:

- any slow or retried server guard work looks like a blank or stuck transition
- redirect meta handling in a streaming render can stay unresolved from the user’s perspective
- there is no onboarding-specific log line to tell whether guard entry started, identity lookup finished, or user lookup finished

This is the strongest route-local reason the current boundary can feel like a hang without a crisp server exception.

---

## 5. `src/app/onboarding/onboarding-form.tsx` Analysis

### 5.1 First client mount behavior

`OnboardingForm` uses only:

- `useState` for `error`
- `useState` for `isPending`

There are no mount-time side effects.

### 5.2 Hooks and effects

There are no:

- `useEffect`
- `useLayoutEffect`
- transitions
- deferred values
- subscriptions
- browser API calls on mount

So the onboarding form does not have an entry-time hook path that would repeatedly refresh, re-navigate, or stall initial route settlement.

### 5.3 Actions and router usage

The form only invokes `completeOnboarding` on submit:

```tsx
<form action={handleSubmit}>
```

and `handleSubmit` only runs after user interaction.

There is no `router.push`, `router.replace`, or `router.refresh` in the component.

### 5.4 Hanging or repeated transition risk from this file

For the current failure boundary, this file is **low probability**.

It can produce submit-time fetch failures later, but it is not a convincing explanation for a hang that occurs before the onboarding UI visibly settles.

---

## 6. Exact Boundary Assessment

### 6.1 Exact handoff boundary

The handoff is:

1. `UsersLayout` throws `redirect('/onboarding')`
2. App Router begins `/onboarding` render
3. `OnboardingLayout` suspends on `OnboardingGuard`
4. `OnboardingGuard` performs auth + DB gate checks
5. only then can the onboarding client tree mount

### 6.2 First plausible failing point after `/users` redirected correctly

The **first plausible failing point** is inside:

`src/app/onboarding/layout.tsx` -> `OnboardingGuard`

More precisely, the earliest likely sub-boundary is:

```ts
await identityProvider.getCurrentIdentity();
```

with the most likely deep sub-step being:

`RequestScopedIdentityProvider.getCurrentIdentity()` -> `DrizzleInternalIdentityLookup.findInternalUserId(...)`

Why this is the earliest plausible boundary:

- the failing-window logs show Clerk auth-claim resolution repeating after the `/users` redirect
- that is exactly the front half of `getCurrentIdentity()`
- there is no evidence that onboarding reached client mount
- there is also no evidence that `findById()` completed

The **second plausible point**, if identity resolution is not the stall, is:

```ts
await userRepository.findById(identity.id);
```

Both sit inside the same server-entry guard boundary.

---

## 7. Primary Failure Classification

### 7.1 Server-entry vs route-settlement vs client-mount

**Primary classification**: `server-entry related`

**How it presents to the user**: `route-settlement hang`

**Not primarily**: `client-mount related`

### 7.2 Why the primary classification is server-entry

Because:

- onboarding cannot mount until `OnboardingGuard` completes
- `OnboardingGuard` performs async auth and DB work
- there is no onboarding UI logic on first mount that would explain the stall earlier than that
- the prior correlation already placed the failure before stable onboarding settlement

### 7.3 Why route settlement still matters

This is not a pure business-logic bug in onboarding state checks. It is a server-entry stall that becomes a route-settlement hang because:

- the route is suspended
- the fallback is `null`
- redirects in streaming contexts settle through framework control flow
- the user sees an opaque pending route instead of a visible loading or explicit failure state

So the best wording is:

> the failure is primarily in onboarding server entry, but it manifests as an App Router route-settlement hang

---

## 8. Clerk Involvement At This Stage

### 8.1 Is Clerk still materially involved?

**Yes, but not as the primary moving part.**

Clerk is still involved in two ways:

1. `ClerkRequestIdentitySource` powers `getCurrentIdentity()`
2. the shared app shell still mounts Clerk client UI such as `UserButton`

### 8.2 Is Clerk the most likely root cause of the onboarding-entry hang?

**No, not from current evidence.**

Reasons:

- onboarding page code itself does not use Clerk client components
- the form has no Clerk dependency on first mount
- the stronger risk is the DB-backed completion of identity resolution and user lookup inside the server guard

### 8.3 Practical conclusion on Clerk

Clerk remains part of the auth context, but the current boundary is no longer a Clerk-led bootstrap problem. At this stage Clerk is a supporting dependency inside server entry, not the primary target.

---

## 9. Dev-Runtime-State Amplification

Dev-runtime-state is a real amplifier here.

The main amplifiers are:

1. `Suspense fallback={null}` in the onboarding layout
   - pending guard work becomes visually invisible

2. global client rejection handling ignores `Failed to fetch`
   - unhandled route-transition failures can be under-reported in local client logs

3. repeated dev retries / re-entry behavior seen in previous correlation work
   - makes the route look unstable without pinpointing the exact awaited boundary

This is still secondary. It amplifies the symptom. It is not the most likely first failing point.

---

## 10. Minimum Safe Next Fix Target

**Minimum safe next fix target**:

`src/app/onboarding/layout.tsx` -> `OnboardingGuard`

Specifically, the safest next target is to instrument and narrow the two awaited server-entry steps:

1. before and after `identityProvider.getCurrentIdentity()`
2. before and after `userRepository.findById(identity.id)`

And, if a product-visible mitigation is needed after confirming the boundary:

3. replace the `null` suspense fallback with a real onboarding-entry loading state so route settlement is observable instead of appearing frozen

### 10.1 What not to target first

Do **not** target first:

- `src/app/onboarding/onboarding-form.tsx`
- `completeOnboarding` submit flow
- bootstrap provisioning logic
- `/users` redirect logic

Those are all downstream or already validated.

---

## 11. Final Answer

1. **Exact likely failing file/function/component boundary**:
   - `src/app/onboarding/layout.tsx` -> `OnboardingGuard`
   - earliest likely sub-boundary: `identityProvider.getCurrentIdentity()`
   - next likely sub-boundary: `userRepository.findById(identity.id)`

2. **Primary classification**:
   - primarily `server-entry related`
   - manifested as `route-settlement` hang in App Router
   - not primarily `client-mount related`

3. **Is Clerk still materially involved?**
   - yes, indirectly through server identity resolution and shared app-shell client state
   - no, it is not the most likely primary cause at this boundary

4. **Minimum safe next fix target**:
   - instrument and harden `OnboardingGuard` server entry first
   - then, if needed, add a visible non-null onboarding-entry fallback so pending route settlement is observable
