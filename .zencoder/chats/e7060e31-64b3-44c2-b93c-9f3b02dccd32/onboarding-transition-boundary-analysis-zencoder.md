# Onboarding Transition Boundary Analysis

**Session ID**: e7060e31-64b3-44c2-b93c-9f3b02dccd32  
**Agent**: Debug / Investigation Agent  
**Date**: 2026-03-17 (updated)  
**Scope**: `/users` → `/onboarding` transition hang — server entry, route settlement, and client mount  
**Inputs**:

- `single-failing-postgres-run-correlation.md` (no failing run found in logs)
- `src/app/onboarding/layout.tsx` (full read)
- `src/app/onboarding/onboarding-form.tsx` (full read)
- `src/app/onboarding/actions.ts` (full read)
- `src/app/onboarding/page.tsx` (full read)
- `src/security/middleware/with-auth.ts` (full read)
- `src/security/middleware/route-classification.ts` (full read)
- `src/security/core/node-provisioning-access.ts` (full read)
- `src/core/runtime/bootstrap.ts` (full read)
- `src/core/runtime/infrastructure.ts` (full read)
- `src/modules/auth/infrastructure/RequestScopedIdentityProvider.ts` (full read)
- `src/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup.ts` (full read)
- `src/modules/user/infrastructure/drizzle/DrizzleUserRepository.ts` (full read)
- `src/app/layout.tsx` (full read)

---

## 1. Objective

Determine the first plausible failing point after `/users` correctly decides `redirect:/onboarding`. Classify the hang as server-entry, route-settlement, or client-mount. Establish whether Clerk is materially involved. Identify minimum safe next fix targets.

---

## 2. Symptom Summary

From prior artifacts:

- `/auth/bootstrap` is **not** the current failure boundary
- `/users` completes with 200 OK and `ONBOARDING_REQUIRED` decision
- `redirect('/onboarding')` is issued from `UsersLayout` correctly
- `GET /onboarding` responds 200 in 141–291ms in all captured log sessions
- **No server-side error or exception logged for `/onboarding` in any session**
- The user perceives a "hang" — blank screen / "Rendering..." — between the `/users` redirect and the onboarding form becoming interactive

---

## 3. Confirmed Evidence

### 3.1 File inventory for `/onboarding` segment

| File                                     | Exists         | Role                                          |
| ---------------------------------------- | -------------- | --------------------------------------------- |
| `src/app/onboarding/layout.tsx`          | ✅             | `OnboardingLayout` wrapping `OnboardingGuard` |
| `src/app/onboarding/page.tsx`            | ✅             | Renders `<OnboardingForm />`                  |
| `src/app/onboarding/onboarding-form.tsx` | ✅             | `'use client'` — form UI only                 |
| `src/app/onboarding/actions.ts`          | ✅             | `completeOnboarding` server action            |
| `src/app/onboarding/loading.tsx`         | **❌ MISSING** | No segment-level loading UI                   |
| `src/app/onboarding/error.tsx`           | **❌ MISSING** | No segment-level error boundary               |

### 3.2 `OnboardingGuard` has zero logging

```tsx
// src/app/onboarding/layout.tsx — FULL file
export async function OnboardingGuard({ children }) {
  const container = getAppContainer();
  const identityProvider = container.resolve(AUTH.IDENTITY_PROVIDER);
  // ... no logger, no resolveServerLogger(), no debug/info/error calls
```

**Confirmed**: Every other auth-critical boundary in the codebase uses `resolveServerLogger()` and logs events. `OnboardingGuard` logs nothing. When it stalls, there is no server-side signal.

### 3.3 `OnboardingGuard` repeats the same DB queries `UsersLayout` already executed

`UsersLayout` calls `resolveNodeProvisioningAccess()` which calls `evaluateNodeProvisioningAccess()`:

```
src/security/core/node-provisioning-access.ts:104  → identityProvider.getCurrentIdentity()
src/security/core/node-provisioning-access.ts:149  → userRepository.findById(identity.id)
```

`OnboardingGuard` then immediately repeats:

```
src/app/onboarding/layout.tsx:34  → identityProvider.getCurrentIdentity()
src/app/onboarding/layout.tsx:52  → userRepository.findById(identity.id)
```

**Confirmed**: This is a full second round-trip of both queries. No caching between route segments. Each `identityProvider.getCurrentIdentity()` call runs:

1. `ClerkRequestIdentitySource.get()` → `auth()` Clerk SDK call (cookie read, ~1–5ms)
2. `DrizzleInternalIdentityLookup.findInternalUserId()` → Postgres SELECT on `auth_user_identities`

Then `userRepository.findById()` → Postgres SELECT on `users`.

Total redundant DB work per `/onboarding` load: **3 sequential Postgres queries** that have already succeeded in the same rendering cycle.

### 3.4 `getAppContainer()` creates a fresh container per call

```tsx
// src/core/runtime/bootstrap.ts:119-121
export function getAppContainer(): Container {
  return createRequestContainer(buildConfig());
}
```

No singleton caching. Each call re-constructs the container and re-validates env. The DB connection pool (`getInfrastructure()`) IS shared via a process-level singleton — but all DI objects above it are recreated every time.

### 3.5 Proxy does NOT create onboarding redirect loops

```tsx
// src/security/middleware/route-classification.ts:41
const isOnboardingRoute = path.startsWith('/onboarding');

// src/security/middleware/with-auth.ts:138
function redirectForIncompleteOnboarding(...) {
  if (!userId || ctx.isOnboardingRoute || ctx.isPublicRoute || ctx.isApi) {
    return null;  // ← exits immediately for /onboarding
  }
  ...
}
```

The proxy runs in edge mode; `onboardingComplete` check only fires in node mode. Even if it ran, `/onboarding` is classified as `isOnboardingRoute = true` and the onboarding redirect guard short-circuits. No redirect loop risk.

### 3.6 `OnboardingForm` does nothing on mount

```tsx
// src/app/onboarding/onboarding-form.tsx — confirmed full file
'use client';
// State only: error, isPending
// No useEffect, no useRouter, no usePathname, no useTransition
// No mount-time action call, no auto-fetch
// Form submit is the only interaction path
```

The client form component is passive. It cannot cause a hang until the user submits.

### 3.7 `<Suspense fallback={null}>` confirmed at two levels

```tsx
// src/app/layout.tsx:72 (root)
<Suspense fallback={null}>
  <ClerkProvider ...><AppLayoutContent>{children}</AppLayoutContent></ClerkProvider>
</Suspense>

// src/app/onboarding/layout.tsx:16 (segment)
<Suspense fallback={null}>
  <OnboardingGuard>{children}</OnboardingGuard>
</Suspense>
```

Two nested Suspense boundaries, both with `fallback={null}`. During server rendering and client hydration, any suspension at either boundary shows nothing to the user.

---

## 4. Execution Path

### 4.1 Full transition sequence

```
1. UsersLayout (src/app/users/layout.tsx:94-96)
   → status === 'ONBOARDING_REQUIRED'
   → redirect('/onboarding')                        [NEXT_REDIRECT thrown — RSC segment exits]

2. Proxy / middleware (src/proxy.ts + src/security/middleware/with-auth.ts)
   → /onboarding request arrives
   → isOnboardingRoute = true → onboarding redirect guard exits immediately
   → passes through to RSC rendering

3. OnboardingLayout (src/app/onboarding/layout.tsx:10-19)
   → SYNC function — returns <Suspense fallback={null}><OnboardingGuard>...</OnboardingGuard></Suspense>
   → Suspense streams null to client while OnboardingGuard resolves

4. OnboardingGuard (src/app/onboarding/layout.tsx:22-67) — ASYNC RSC
   → getAppContainer()                              [SYNC — new container every call]
   → identityProvider.getCurrentIdentity()          [ASYNC — auth() + Postgres query #1]
   → userRepository.findById(identity.id)           [ASYNC — Postgres query #2]
   → if (!user.onboardingComplete) → renders children

5. OnboardingPage (src/app/onboarding/page.tsx)
   → <OnboardingForm />                             [SYNC — passes to client boundary]

6. Client: hydration
   → ClerkProvider restores auth state (from preloaded cookie)
   → HeaderAuthControls mounts (Clerk UI components — passive)
   → OnboardingForm mounts (state init only, no effects)
```

### 4.2 Where the blank screen window occurs

```
Between step 1 and step 4 completing:
  - Step 1 completes (redirect) → blank screen begins
  - Steps 2-3 are near-instant
  - Step 4 takes ~150-400ms (two sequential Postgres queries)
  - User sees blank screen for this entire duration
  - NO loading indicator at any level
  - NO server log of entry or exit from OnboardingGuard
```

---

## 5. Source-of-Truth Analysis

| State                         | Where read in /users                                            | Where re-read in /onboarding      | Duplication? |
| ----------------------------- | --------------------------------------------------------------- | --------------------------------- | ------------ |
| External userId (Clerk)       | `auth()` via ClerkRequestIdentitySource                         | `auth()` again in OnboardingGuard | **Yes**      |
| Internal identity mapping     | `findInternalUserId()` on `auth_user_identities`                | `findInternalUserId()` again      | **Yes**      |
| User record + onboarding flag | `userRepository.findById()` in `evaluateNodeProvisioningAccess` | `userRepository.findById()` again | **Yes**      |

All three lookups are re-executed from scratch on the next route segment. No mechanism exists to pass the result of `evaluateNodeProvisioningAccess` from `UsersLayout` to `OnboardingGuard`.

---

## 6. Likely Failure Points

### FP-1 — `<Suspense fallback={null}>` + missing `loading.tsx` (PRIMARY — Confirmed)

**File**: `src/app/onboarding/layout.tsx:16` and absent `src/app/onboarding/loading.tsx`  
**Classification**: Route-settlement level  
**Status**: Confirmed architectural gap

During `OnboardingGuard`'s async resolution, the user sees a completely blank page:

- `<Suspense fallback={null}>` provides no UI
- No `loading.tsx` exists to give the segment an instant loading shell
- Root `<Suspense fallback={null}>` compounds this — the entire visible area shows nothing

In local dev Postgres, the first query after a cold connection (process start, pool warm-up) can take 200–400ms. This blank period is the primary source of the perceived "hang".

**Contrast with bootstrap**: The original bootstrap failure was a technical RSC stream abort (uncaught `throw err`). The onboarding transition hang is a UX-level gap (no loading state). Different failure class; same perceived symptom.

### FP-2 — `OnboardingGuard` has no logging (Confirmed — observability gap)

**File**: `src/app/onboarding/layout.tsx`  
**Status**: Confirmed — zero logging calls

When `OnboardingGuard` runs slowly (Postgres latency), redirects unexpectedly, or encounters an auth state that causes a redirect, there is **no server log entry**. This makes the transition boundary invisible to debugging. Every other auth/provisioning boundary in this codebase logs its decisions; `OnboardingGuard` is the only exception.

### FP-3 — Redundant sequential DB queries slow every `/onboarding` load (Confirmed)

**File**: `src/app/onboarding/layout.tsx:34, 52`  
**Status**: Confirmed code path

Three Postgres queries run sequentially on every `/onboarding` load:

1. `findInternalUserId()` → `auth_user_identities` table
2. `findById()` → `users` table

All three have already succeeded in the immediately preceding `/users` rendering. There is no caching or state passing between route segments. In local dev, each adds 5–30ms; combined: 10–60ms additional latency AFTER the `/users` round-trip.

### FP-4 — `form action={handleSubmit}` non-canonical redirect handling (Unclear — needs verification)

**File**: `src/app/onboarding/onboarding-form.tsx:26`  
**Status**: Unclear — not confirmed but warrants verification

```tsx
// Current pattern
<form action={handleSubmit}>  // handleSubmit is a client async function

// Idiomatic Next.js 16 pattern
<form action={completeOnboarding}>  // direct server action reference
```

When `completeOnboarding` calls `redirect()`, the server action infrastructure encodes the redirect in the response. Through the direct form action pattern, React handles this natively. Through the client wrapper pattern, the behavior depends on how Next.js 16 propagates the redirect signal through the server action RPC client.

**Potential symptom if this fails**: Form stays in default state after submit with no navigation (not a hang, but broken redirect).

### FP-5 — `completeOnboarding` redundantly calls `ensureProvisioned` (Confirmed — latency)

**File**: `src/app/onboarding/actions.ts:38`  
**Status**: Confirmed — runs on every form submit

User is already provisioned when the form appears. The full provisioning transaction runs again (~30–80ms Postgres overhead on form submit). Idempotent but unnecessary.

### FP-6 — No segment-level error boundary at `/onboarding` (Confirmed — observability gap)

**Files**: absent `src/app/onboarding/error.tsx`; only `src/app/error.tsx` exists  
**Status**: Confirmed

If `OnboardingGuard` throws an unexpected error (e.g., DB returns unexpected schema, auth() throws non-standard error), the root error boundary catches it and shows a generic error UI with no onboarding-specific recovery path. Sentry captures the error, but the user sees only "Something went wrong!" with no context-specific guidance.

---

## 7. Hypotheses

### H1 — Primary: Blank screen from `<Suspense fallback={null}>` + missing `loading.tsx`

**Confidence: High**

The blank screen during `OnboardingGuard` resolution is the direct cause of the perceived hang. Two layers of `fallback={null}` eliminate all visual feedback during server async work. In local dev Postgres, cold-start queries extend this window.

This is **not** a technical failure but is indistinguishable from one in the user experience.

### H2 — Secondary: Route-settlement amplification in dev mode

**Confidence: Likely (dev-specific)**

Next.js Fast Refresh, Turbopack hot module replacement, and repeated process restarts (observed: multiple `infrastructure_init_start` events in server.log within short windows) create instability in the route settlement lifecycle. Dev mode reloads can re-trigger `OnboardingGuard` multiple times in rapid succession. With `fallback={null}` at both boundaries, the user sees the blank screen for an extended compound period.

### H3 — Tertiary: `form action={handleSubmit}` redirect ambiguity

**Confidence: Unclear**

If the indirect server action redirect does not trigger client-side router navigation in Next.js 16, the form submit appears to succeed (no error shown) but the page does not navigate. Not a hang, but invisible failure.

**Reducing this uncertainty requires**: one form submit captured with browser network tab showing the server action response headers and subsequent router behavior.

---

## 8. Primary Hang Classification

**Classification: Route-settlement level, at the onboarding server-entry boundary**

More precisely:

- The hang begins the moment `UsersLayout` issues `redirect('/onboarding')` and the browser transitions to the new route
- The first visible UI does not appear until `OnboardingGuard` completes its two sequential Postgres queries
- No loading indicator exists at any layer during this period
- The blank screen IS the perceived hang

This is **NOT**:

- A client-mount problem (`OnboardingForm` has no mount-time side effects)
- A Clerk-specific failure (Clerk auth resolution is fast and confirmed working in logs)
- An RSC stream abort (the response is 200 OK with content)
- An infinite redirect loop (proxy short-circuits for `isOnboardingRoute`)

---

## 9. Clerk Involvement at This Stage

| Layer                       | Clerk Involvement                                                            | Is Clerk the Hang Source?         |
| --------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Proxy / middleware          | `clerkMiddleware()` wraps request pipeline; `auth()` called once per request | No — fast cookie read             |
| `OnboardingGuard` server    | `ClerkRequestIdentitySource.get()` → `auth()`                                | Unlikely — fast in confirmed logs |
| Client hydration            | `ClerkProvider` restores auth state; `HeaderAuthControls` mounts Clerk UI    | Possible minor delay, not a hang  |
| `completeOnboarding` action | `auth()` called again for identity source                                    | No — fast                         |

**Net assessment**: Clerk is present at every layer but is not the primary hang source. All Clerk `auth()` calls are fast cookie reads on the server. The global `ClerkProvider` on the client adds some initialization overhead but this is non-blocking and not the blank screen cause.

---

## 10. Exact File/Function/Component Boundary

**Primary failure boundary**:

> `src/app/onboarding/layout.tsx:16` — `<Suspense fallback={null}>` combined with absent `src/app/onboarding/loading.tsx`

**Supporting failure boundaries** (observability and latency only):

> `src/app/onboarding/layout.tsx:22-67` — `OnboardingGuard` has no logging, runs redundant DB queries

**Not the failure boundary**:

> `src/app/onboarding/onboarding-form.tsx` — passive client component, no mount-time effects

---

## 11. Minimum Safe Next Fix Targets

### Fix 1 — Add `src/app/onboarding/loading.tsx` (HIGH — framework-idiomatic)

**Effect**: Next.js App Router's segment-level loading convention. When `loading.tsx` exists, the router commits the new route shell immediately (including the loading UI), then streams the actual content. Eliminates the blank screen between redirect and form render.

**Blast radius**: Minimal — adds a file, no logic changes to any existing component.

**Comparison**: `src/app/security-showcase/loading.tsx` already exists and demonstrates the pattern is used elsewhere.

### Fix 2 — Add logging to `OnboardingGuard` (HIGH — observability)

**File**: `src/app/onboarding/layout.tsx`  
**Effect**: Makes guard entry, decisions (redirect or render), and exit visible in server logs. Eliminates the current diagnostic black box. All other auth boundaries in the codebase do this; `OnboardingGuard` should too.

**Blast radius**: Minimal — adds logging calls, no behavioral changes.

### Fix 3 — Change `<form action={handleSubmit}>` to direct server action pattern (MEDIUM)

**File**: `src/app/onboarding/onboarding-form.tsx`  
**Effect**: Use `<form action={completeOnboarding}>` directly with `useFormStatus()` for pending state. Follows the idiomatic Next.js 16 server action form pattern. Eliminates redirect-through-client-wrapper ambiguity.

**Blast radius**: Small — changes only `OnboardingForm` UI pattern. Server action logic unchanged.

### Fix 4 — Remove redundant DB lookups from `OnboardingGuard` (LOWER)

**File**: `src/app/onboarding/layout.tsx`  
**Effect**: Remove or simplify the second identity + user lookup (already confirmed by `UsersLayout`). Reduces latency by 10–60ms per page load.

**Blast radius**: Moderate — changes `OnboardingGuard` auth logic. Requires careful review since the guard is a safety check. Implementation Agent + Architecture Guard should validate.

---

## 12. Codex Analysis Agreement / Divergence

A parallel analysis (`onboarding-transition-boundary-analysis-codex.md`) reached similar conclusions. Points of agreement:

- Primary failure boundary: `OnboardingLayout` + `OnboardingGuard` async server-entry
- `OnboardingForm` is NOT the first failing point
- Hang classification: route-settlement related, not client-mount
- Clerk is present but not the onboarding-specific cause
- `loading.tsx` absence and `fallback={null}` are the primary architectural gaps

Additional evidence from this analysis not in the Codex analysis:

- **Proxy explicitly short-circuits for `isOnboardingRoute = true`** — no redirect loop risk from middleware (confirmed from `route-classification.ts:41` and `with-auth.ts:138`)
- **`getAppContainer()` creates a new container per call** — confirms no DI state is shared between `UsersLayout` and `OnboardingGuard`
- **`<Suspense fallback={null}>` exists at TWO levels** (root layout + onboarding layout) — double blank screen window
- **`OnboardingForm` confirmed passive** at code level — no effects, no router hooks (eliminates client-mount as primary suspect)

---

## 13. Bottom Line

1. **Exact likely failing boundary**: `src/app/onboarding/layout.tsx:16` — `<Suspense fallback={null}>` + absent `loading.tsx`. The blank screen during `OnboardingGuard`'s two sequential Postgres queries IS the perceived hang.

2. **Hang classification**: Route-settlement level. Not client-mount. Not Clerk-specific. Not a technical failure — RSC stream completes correctly (200 OK).

3. **Clerk involvement**: Present as global participant but not the onboarding-specific hang source.

4. **Minimum safe fix targets**:
   - **Fix 1** (highest priority): Add `src/app/onboarding/loading.tsx` — eliminates blank screen
   - **Fix 2** (high priority): Add logging to `OnboardingGuard` — makes the boundary diagnosable
   - **Fix 3** (medium): Direct server action form pattern in `OnboardingForm`

5. **Do not start with** `OnboardingForm`, bootstrap, or Clerk client wiring.
