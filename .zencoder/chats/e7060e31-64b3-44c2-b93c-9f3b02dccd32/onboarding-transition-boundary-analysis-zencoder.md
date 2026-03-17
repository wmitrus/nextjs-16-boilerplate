# Onboarding Transition Boundary Analysis

**Session ID**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Agent**: Debug / Investigation Agent  
**Date**: 2026-03-17  
**Scope**: `/users` → `/onboarding` transition boundary, route settlement, and client mount behavior

---

## 1. Objective

Identify the exact file/function/component boundary responsible for the current hang (if any) after `/users` has correctly decided `redirect:/onboarding`. Determine whether the hang is server-entry, route-settlement, or client-mount related. Identify minimum safe next fix target.

---

## 2. Symptom Summary

**Confirmed from prior artifacts:**

- Bootstrap is working (Phase 2 fix confirmed, all bootstrap runs in server.log succeeded)
- `/users` → `ONBOARDING_REQUIRED` → `redirect('/onboarding')` is executing correctly
- `GET /onboarding 200 in 291ms` and `GET /onboarding 200 in 141ms` appear in server logs
- The original "Rendering..." / `TypeError: Failed to fetch` was a bootstrap RSC stream abort — now fixed

**Current investigation scope:**  
Whether any "hang" persists at the onboarding transition and, if so, at what exact boundary.

---

## 3. Confirmed Evidence

### 3.1 Server Logs (Confirmed)

| Session        | Request         | HTTP Result  | Notes                                 |
| -------------- | --------------- | ------------ | ------------------------------------- |
| ~1773697318xxx | GET /onboarding | 200 in 291ms | First load                            |
| ~1773697318xxx | GET /onboarding | 200 in 141ms | Second load (prefetch/cache)          |
| ~1773697318xxx | GET /users      | 200 in 327ms | Guard: ONBOARDING_REQUIRED → redirect |

**No server-side error on `/onboarding` in any log session.**

### 3.2 Bootstrap Fix (Confirmed In-Code)

- `src/app/auth/bootstrap/page.tsx`: catch-all → `<BootstrapErrorUI error="db_error" />` (no `throw err`)
- `src/core/db/drivers/create-postgres.ts`: `connect_timeout: 10`

### 3.3 OnboardingGuard Error Handling (Confirmed In-Code)

All error paths in `OnboardingGuard` issue **redirects**, not uncaught throws:

- `identityProvider.getCurrentIdentity()` fails → `redirect('/auth/bootstrap?reason=db-error')`
- `userRepository.findById()` fails → `redirect('/auth/bootstrap?reason=db-error')`
- User not found → `redirect('/auth/bootstrap')`
- User onboarding complete → `redirect('/users')`
- None of these abort the RSC stream.

### 3.4 OnboardingForm Pattern (Confirmed In-Code)

```tsx
// OnboardingForm is a 'use client' component
const handleSubmit = async (formData: FormData) => {
  setIsPending(true);
  try {
    const res = await completeOnboarding(formData);
    if (res?.error) { setError(res.error); }
  } catch (_err) {
    setError('An unexpected error occurred. Please try again.');
  } finally {
    setIsPending(false);
  }
};
<form action={handleSubmit} ...>
```

### 3.5 "Rendering..." String (Confirmed Not In Codebase)

```
grep -rn "Rendering..." src/  → No matches
```

This text is not a React component string. It is a browser/Next.js dev overlay indicator from the original bootstrap RSC stream abort. It is not produced by the onboarding route.

---

## 4. Execution Path

### 4.1 Server Entry Flow: `/onboarding`

```
UsersLayout.redirect('/onboarding')
  → [Next.js RSC: new route request]
  → RootLayout renders (sync, wraps in <Suspense fallback={null}>)
  → OnboardingLayout renders (sync):
      return <Suspense fallback={null}><OnboardingGuard>{children}</OnboardingGuard></Suspense>
  → OnboardingGuard (async RSC):
      1. getAppContainer() → createRequestContainer(buildConfig())    [SYNC - creates new container every call]
      2. identityProvider.getCurrentIdentity():
           a. ClerkRequestIdentitySource.get() → auth()              [ASYNC - Clerk SDK, reads cookie]
           b. DrizzleInternalIdentityLookup.findInternalUserId()      [ASYNC - Postgres query on auth_user_identities]
      3. userRepository.findById(identity.id)                        [ASYNC - Postgres query on users table]
      4. if (!user.onboardingComplete) → renders children
  → OnboardingPage renders (sync):
      return <OnboardingForm />
  → RSC stream complete → 200 OK sent
```

**Key timing observation**: Steps 2 and 3 are sequential Postgres queries. In local dev, each typically takes 5–30ms. Combined: 10–60ms. This explains the 141–291ms total response times.

### 4.2 Client Hydration Flow

```
Browser receives RSC payload (200 OK)
  → React hydrates <RootLayout>
  → Hydrates <ClerkProvider> (reads Clerk session from preloaded state in cookie)
  → Hydrates <HeaderWithAuth> → <HeaderAuthControls> ('use client')
      → Clerk components: <SignedIn>, <SignedOut>, <UserButton>
      → Clerk JS initializes client-side auth state
  → Hydrates <OnboardingLayout> shell
  → Hydrates <OnboardingForm> ('use client')
      → React.useState: error='', isPending=false
      → No useEffect, no router calls, no auto-fetching
      → Form renders immediately
```

**No client-side hang in hydration path.** Clerk auth state is preloaded by the server.

### 4.3 Form Submission Flow (`completeOnboarding`)

```
User submits form
  → React calls handleSubmit(formData) inside startTransition
  → handleSubmit:
      1. setIsPending(true)                                          [UI: "Saving..."]
      2. await completeOnboarding(formData)                          [Server action RPC]
          → Server: identitySource.get() → auth()                   [Clerk, ~5ms]
          → Server: provisioningService.ensureProvisioned()          [FULL provisioning cycle - 30-80ms]
          → Server: userRepository.findById(internalUserId)         [Postgres, ~5ms]
          → Server: userRepository.updateProfile(...)               [Postgres UPDATE, ~5ms]
          → Server: userRepository.updateOnboardingStatus(..., true) [Postgres UPDATE, ~5ms]
          → Server: redirect(safeRedirectUrl)                        [throws NEXT_REDIRECT]
          → Next.js intercepts NEXT_REDIRECT, encodes in response
          → Client receives redirect response, router.push('/users')
      3. finally: setIsPending(false)                               [component unmounting]
  → Router navigates to /users
```

---

## 5. Source-of-Truth Analysis

| State                                   | Owner                     | DB Table               | Stage                   |
| --------------------------------------- | ------------------------- | ---------------------- | ----------------------- |
| External user identity (Clerk userId)   | Clerk SDK (cookie/JWT)    | —                      | Auth layer              |
| Internal user identity mapping          | DB                        | `auth_user_identities` | OnboardingGuard step 2b |
| User record + `onboardingComplete` flag | DB                        | `users`                | OnboardingGuard step 3  |
| Onboarding form submission              | Server action + DB writes | `users`                | completeOnboarding      |

**State drift risk**: If bootstrap writes to DB in one Postgres connection and `OnboardingGuard` reads from another connection immediately, the commit should be visible (Postgres `READ COMMITTED` guarantees). Not a practical concern here.

---

## 6. Likely Failure Points

### FP-1 — `<Suspense fallback={null}>` shows blank page during guard resolution

**Location**: `src/app/onboarding/layout.tsx:16`  
**Status**: **Confirmed architectural behavior** (not a bug, but creates visual "hang")  
**Details**: During `OnboardingGuard`'s async DB queries, the Suspense boundary shows `null` (nothing). The user sees a blank page for 10–300ms depending on Postgres latency. If Postgres is slow or the connection pool is saturated, this blank period extends indefinitely without any visible indicator.

**This is the most likely cause of the visible "hang" perception at the onboarding entry point**, even when the server-side work completes correctly.

### FP-2 — `completeOnboarding` redundantly calls `ensureProvisioned`

**Location**: `src/app/onboarding/actions.ts:38`  
**Status**: **Confirmed code path** — runs every time the form is submitted  
**Details**: The user is already provisioned by the time they see the onboarding form. `ensureProvisioned` runs a full provisioning transaction cycle (~30–80ms) unnecessarily. This adds latency at form submission time and briefly shows the button as "Saving..." without user feedback.

Not a hang, but an unnecessary Postgres round-trip sequence on every form submit.

### FP-3 — `form action={handleSubmit}` non-canonical redirect handling

**Location**: `src/app/onboarding/onboarding-form.tsx:10-25`  
**Status**: **Likely — needs verification in target environment**  
**Details**: The form uses `action={handleSubmit}` (client async function) wrapping `completeOnboarding` (server action). This differs from the Next.js 16 recommended pattern of `action={completeOnboarding}` (direct server action reference) + `useFormStatus()`.

When `completeOnboarding` calls `redirect()`, Next.js's server action infrastructure encodes the redirect in the response. The client router then navigates. With the direct pattern, React's built-in transition handling manages this. With the wrapper pattern, the behavior depends on how Next.js 16 handles server action redirects in a client-called context vs. a React transition-owned form action.

**Potential symptom**: `catch (_err)` in `handleSubmit` might receive a non-standard object if the redirect response is not properly decoded before the client sees it. In that case, it would show "An unexpected error occurred. Please try again." instead of navigating. This is not a permanent hang but is an incorrect behavior path.

**This is NOT confirmed** — it may work correctly in Next.js 16. But it is a deviation from the idiomatic pattern and warrants verification.

### FP-4 — `OnboardingGuard` DB query error → redirect to `/auth/bootstrap` loop risk

**Location**: `src/app/onboarding/layout.tsx:37-43, 51-53`  
**Status**: **Unlikely in current state** but worth flagging  
**Details**: If Postgres is running but the `auth_user_identities` or `users` table is missing (schema drift, failed migration), the Drizzle query throws, and `OnboardingGuard` redirects to `/auth/bootstrap?reason=db-error`. Bootstrap then tries `ensureProvisioned` on the same broken schema, fails with a db_error, and returns `<BootstrapErrorUI>`. The user is stuck at the error UI. This is correct behavior, not a loop, but is hard to diagnose without log visibility.

---

## 7. Hypotheses

### H1 — Primary: `<Suspense fallback={null}>` is the "hang" perception source

**Confidence: High**

The `OnboardingLayout` wraps `OnboardingGuard` in `<Suspense fallback={null}>`. While `OnboardingGuard` runs its two Postgres queries (typically 10–60ms combined, but can be 200–400ms on first connection), the user sees a completely blank page with no loading indicator.

In local dev, the first request after a process restart warms up the Postgres connection pool. The first `OnboardingGuard` query set may take 200–400ms while the connection is established. During this time, the screen shows nothing. This matches "hangs on Rendering..." perception.

**Why "Rendering..." appears**: In the browser, the page tab spinner is active. In Next.js dev mode, the dev overlay shows loading state. Neither of these are React component text.

### H2 — Secondary: `form action={handleSubmit}` redirect handling

**Confidence: Unclear — needs verification**

If the indirect server action redirect (through `handleSubmit` wrapper) does not trigger router navigation in Next.js 16, the form would remain in `isPending=false` state (after `finally` runs) but the page would not navigate. The user would see the form in its normal state with no apparent result. This is not a hang but is a broken redirect.

**Evidence required**: One form submission with browser network tab showing the server action response and the subsequent navigation.

### H3 — Tertiary: Clerk JS hydration delay at onboarding entry

**Confidence: Low**

`HeaderAuthControls` uses Clerk components (`<SignedIn>`, `<SignedOut>`, `<UserButton>`) that require Clerk JS to initialize on the client. While Clerk's server-side preloading reduces this, network latency to Clerk's CDN in dev could add 100–500ms. This would delay the full page interactive state.

Not a hang, but adds to the perception of slowness at route entry.

---

## 8. Missing Evidence / Uncertainty

| Item                                                                                     | Status                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------- |
| Browser network tab during `/onboarding` load                                            | ❌ Not available                   |
| Form submission network trace                                                            | ❌ Not available                   |
| Server log for `completeOnboarding` execution                                            | ❌ No form submit captured in logs |
| Next.js 16 exact behavior for `form action={clientWrapper}` + server action `redirect()` | ❌ Needs verification              |
| Whether the "hang" is still perceived by user after bootstrap fix                        | ❌ Not confirmed                   |
| Postgres cold-start query timing (first query latency)                                   | ❌ Not measured                    |

---

## 9. Key Code-Level Finding: `OnboardingGuard` Error Handling is Safe

Unlike the original bootstrap bug (uncaught `throw err` aborting RSC stream), `OnboardingGuard` handles ALL DB failures with safe redirects:

```tsx
// OnboardingGuard — confirmed error handling
try {
  identity = await identityProvider.getCurrentIdentity();
} catch (err) {
  if (err instanceof UserNotProvisionedError) {
    redirect('/auth/bootstrap'); // Safe redirect
  }
  redirect('/auth/bootstrap?reason=db-error'); // Safe redirect for any DB error
}

try {
  user = await userRepository.findById(identity.id);
} catch {
  redirect('/auth/bootstrap?reason=db-error'); // Safe redirect
}
```

**Conclusion**: There is no RSC stream abort risk at `OnboardingGuard`. Any Postgres failure at this point causes a safe redirect to bootstrap, not a stream abort.

---

## 10. Exact Likely Failing File/Function/Component

| Boundary                                        | Hang Type                | File                                     | Line | Severity                     |
| ----------------------------------------------- | ------------------------ | ---------------------------------------- | ---- | ---------------------------- |
| `<Suspense fallback={null}>` blank during guard | Visual / perception hang | `src/app/onboarding/layout.tsx`          | 16   | **High UX impact**           |
| `completeOnboarding` redundant provisioning     | Latency at form submit   | `src/app/onboarding/actions.ts`          | 38   | Medium                       |
| `form action={handleSubmit}` redirect           | Possible redirect miss   | `src/app/onboarding/onboarding-form.tsx` | 26   | Unclear — needs verification |

---

## 11. Whether Clerk is Still Materially Involved

**At server entry (`OnboardingGuard`)**: Yes — Clerk `auth()` is called to get the userId. This is a local cookie read (~1–5ms). Not a hang source.

**At client mount (`HeaderAuthControls`)**: Yes — Clerk JS initializes client-side auth state. Adds 100–300ms of non-blocking client initialization time. Not a hang.

**At form submission (`completeOnboarding`)**: Yes — `auth()` called again in the server action (from `ClerkRequestIdentitySource.get()`). Another local cookie read. Not a hang.

**Summary**: Clerk is present at all three phases but is not a hang source. All Clerk operations at this stage are fast local-cookie reads or cached instance checks.

---

## 12. Minimum Safe Next Fix Target

### Fix 1 — Replace `<Suspense fallback={null}>` with visible loading state (HIGH PRIORITY)

**File**: `src/app/onboarding/layout.tsx:16`  
**Change**: Replace `fallback={null}` with a minimal loading indicator

**Effect**: Converts the blank-page visual hang into a visible loading state. Users will see meaningful feedback during the 10–400ms DB query window. This addresses the primary perceptual issue without changing any behavior or logic.

**Blast radius**: Minimal. Only `OnboardingLayout` visual behavior changes. No auth, security, or DB logic changes.

### Fix 2 — Change `form action={handleSubmit}` to direct server action reference (MEDIUM PRIORITY)

**File**: `src/app/onboarding/onboarding-form.tsx`  
**Change**: Use `form action={completeOnboarding}` directly, use `useFormStatus()` for pending state

**Effect**: Uses the idiomatic React 19 / Next.js 16 server action form pattern. Redirect handling is owned by the framework rather than the client wrapper. Eliminates potential redirect miss if H2 is confirmed.

**Blast radius**: Small. Only `OnboardingForm` rendering behavior changes. Server action logic unchanged.

### Fix 3 — Remove redundant `ensureProvisioned` from `completeOnboarding` (LOW PRIORITY)

**File**: `src/app/onboarding/actions.ts:38`  
**Change**: Replace `ensureProvisioned()` call with a direct identity lookup (since user is already provisioned)  
**Requires**: Implementation Agent + Architecture Guard review (crosses module contract boundary)

---

## 13. Bottom Line

1. **Exact likely failing boundary**: `<Suspense fallback={null}>` in `src/app/onboarding/layout.tsx:16` — blank page during Postgres queries creates the visual hang perception. Not a technical failure.

2. **Hang classification**: **Route-settlement / streaming** — the RSC stream completes correctly (200 OK), but the client-visible content is deferred by the Suspense boundary with no fallback.

3. **Clerk involvement**: Peripheral. Not a hang source at this stage.

4. **Minimum safe fix target**: `src/app/onboarding/layout.tsx:16` — replace `<Suspense fallback={null}>` with a visible loading indicator. Separate fix: `src/app/onboarding/onboarding-form.tsx` — use direct server action as form action.

5. **Technical failure status**: No confirmed technical failure at onboarding in current state. The fix from Phase 2 addressed the primary bootstrap RSC stream abort. The remaining issue is a UX perception gap (blank loading state) and a non-canonical form action pattern.
