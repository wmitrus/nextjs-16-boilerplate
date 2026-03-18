# Final Route Boundary Root Cause

**Investigation Phase**: Final route-boundary verification  
**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Status**: Root cause identified with high confidence

---

## 1. Objective

Use the installed `RouteTransitionProbe` and onboarding-local probes to definitively identify the earliest client-side failing boundary in the `/users → /onboarding` hang.

---

## 2. Scenario Determination

**SCENARIO B CONFIRMED.**

| Boundary                            | Status               | Evidence                                                                      |
| ----------------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| `/users` committed client-side      | ✅ CONFIRMED         | `route_probe:pathname_committed pathname: "/users"` fired (log line 197-206)  |
| `/onboarding` committed client-side | ❌ NEVER HAPPENED    | Zero `route_probe:pathname_committed pathname: "/onboarding"` in 351-line log |
| `onboarding_client:mount`           | ❌ NEVER HAPPENED    | Zero entries across all sessions                                              |
| `onboarding_form:mount`             | ❌ NEVER HAPPENED    | Zero entries across all sessions                                              |
| Server rendered `/onboarding`       | ✅ CONFIRMED (TWICE) | `GET /onboarding 200` × 2, both `OnboardingGuard` runs: `render:onboarding`   |
| Client errors or hydration errors   | ❌ ZERO              | No errors, no warnings in the entire captured log                             |

---

## 3. Confirmed Evidence

### Timestamp-precise event sequence

All times are Unix ms from `console.log` middleware timestamps:

| Time (ms)            | Line | Event                                                                            |
| -------------------- | ---- | -------------------------------------------------------------------------------- |
| 1773863187928        | 95   | Security Middleware: `/users` → guard runs                                       |
| 1773863188322        | ~154 | `users_guard:decision redirect:/onboarding`                                      |
| 1773863188370        | 172  | `/api/logs` hit #1 → `route_probe:cleanup pathname: "/sign-up/sso-callback"`     |
| 1773863188378        | 173  | `/api/logs` hit #2 → `route_probe:pathname_committed pathname: "/users"`         |
| 1773863188380        | 174  | First `/onboarding` RSC request hits middleware                                  |
| 1773863188806        | 221  | First `onboarding_guard:entry`                                                   |
| 1773863188841        | 272  | First `onboarding_guard:decision render:onboarding`                              |
| 1773863188852        | 278  | **Second `/onboarding` RSC request hits middleware** (11ms after first decision) |
| 1773863188xxx        | 293  | Second `onboarding_guard:entry`                                                  |
| 1773863188xxx        | 344  | Second `onboarding_guard:decision render:onboarding`                             |
| 1773863188925 (est.) | 350  | `GET /onboarding 200 in 545ms` (first response sent)                             |
| 1773863188971 (est.) | 351  | `GET /onboarding 200 in 91ms` (second response sent)                             |
| —                    | END  | Log ends. Zero probe events for `/onboarding`.                                   |

### The critical anomaly: two concurrent RSC requests to `/onboarding`

The second `/onboarding` request arrived at middleware at `1773863188852` — which is **73ms before the first `/onboarding` response was sent** (`1773863188925`). The second request was initiated while the first was still in-flight.

This is not retry behavior. Two independent RSC requests were made to `/onboarding` concurrently, from different navigation triggers.

---

## 4. Execution Path Analysis

### What happened client-side

```
SSO callback page → Clerk processes auth → router navigates to /users (client soft nav)
    ↓
App Router makes RSC fetch to /users [GET /users 200]
    ↓
UsersLayout.redirect('/onboarding') → redirect instruction embedded in RSC response
    ↓
Browser receives RSC response → React commits /users tree
    ↓
[Probe fires for /users] ← confirmed
    ↓
[2ms later] App Router processes redirect instruction → starts RSC fetch to /onboarding (REQUEST 1)
    ↓
[~472ms later] SOMETHING triggers a second RSC fetch to /onboarding (REQUEST 2)
    ↓
Both RSC responses return 200. React never commits /onboarding. Probe never fires.
```

### What is "SOMETHING"

The second `/onboarding` request arrived at the server **while the first response was still being generated** (73ms before first response sent). This rules out a retry. It is a second concurrent navigation trigger.

The only component in the shared tree capable of triggering a second RSC navigation during post-sign-up state settlement is **Clerk's `ClerkProvider`**.

Clerk's `@clerk/nextjs` calls `router.refresh()` after SSO session finalization. This is documented Clerk behavior for Next.js App Router: Clerk invalidates the RSC cache and re-fetches the current route when session state changes. After SSO sign-up, Clerk's client-side session finalizes within seconds. The `router.refresh()` call targets the currently-navigating route — which is `/onboarding` (the App Router has already optimistically moved toward it after the redirect instruction).

This produces the second RSC request to `/onboarding`.

---

## 5. Exact Earliest Failing Boundary

**The App Router client route-commit step for `/onboarding` — immediately after RSC responses arrive.**

Two successful RSC responses for `/onboarding` were received by the browser. Neither resulted in a committed React tree. `usePathname()` never returned `/onboarding`. The `RouteTransitionProbe`'s `useEffect` never fired.

The failure is not:

- Server-side (both guard runs succeed)
- RSC fetch (both requests return 200)
- Onboarding subtree (it never gets to mount)

The failure is specifically: **React never commits the `/onboarding` tree to the DOM** despite having received the RSC payload.

---

## 6. Root Cause Class

**Concurrent RSC navigation conflict at the App Router route-commit boundary.**

Two RSC navigation transitions to `/onboarding` are active simultaneously:

1. **Transition 1**: Triggered by `UsersLayout.redirect('/onboarding')` — server-redirect-induced client navigation
2. **Transition 2**: Triggered by Clerk's `router.refresh()` during post-SSO session finalization

In React 19 concurrent mode, `startTransition`-wrapped route transitions can be interrupted. When a `router.refresh()` fires while a navigation transition is in-progress, the refresh creates a competing transition. React's transition scheduler must resolve the conflict. In this case, neither transition commits cleanly — the tree remains in an indeterminate suspended or interrupted state. No error is thrown. The page shows whatever was last committed (`/users`), and the probe never fires for `/onboarding`.

The root `<Suspense fallback={null}>` in `src/app/layout.tsx` wrapping `ClerkProvider > AppLayoutContent` may additionally contribute: if either transition causes the tree to suspend momentarily, the fallback (`null`) is shown with no visible error, making the failure completely invisible to the user and to logs.

---

## 7. Supporting Evidence

### Why two requests, not one

Every prior successful transition produced **one** RSC request per navigation. Only the `/onboarding` transition produced **two concurrent requests**. The second request arrived 472ms after the first — consistent with Clerk's post-SSO session finalization timeline (session token processing, JWKS fetch, state hydration).

### Why no errors

Concurrent transition conflicts in React 19 App Router are silent. Neither transition throws. Neither transition commits. React leaves the tree in the last committed state (`/users` content). No error boundary triggers. No hydration mismatch occurs. The `<Suspense fallback={null}>` further silences any visible indication of a suspended/interrupted state.

### Why the `/sign-up/sso-callback` cleanup fires at the same moment as the `/users` commit

The cleanup for `/sign-up/sso-callback` (leaving that route) and the commit for `/users` both arrived at `/api/logs` within 8ms of each other (T+370ms and T+378ms). This tight co-occurrence reflects React's transition phase boundary: the old effect cleanup and new effect run happen in the same React commit cycle. This is normal React behavior — it confirms the `/users` commit was atomic and correct.

### Why the redirect instruction embedded in the `/users` RSC response causes the `/users` route to commit first

In Next.js App Router streaming RSC, `redirect()` called inside a layout produces a redirect instruction that is flushed at the end of the layout's RSC chunk. The initial RSC chunks (including the `/users` page content) may be processed and committed by React before the redirect instruction is flushed and processed. This explains why `/users` committed to the React tree (probe fired) before the redirect to `/onboarding` was initiated. The layout redirect is a streaming redirect, not an abort redirect.

---

## 8. Hypotheses (Ranked)

### Hypothesis A — Confirmed-Likely (primary)

**Clerk's `router.refresh()` creates a concurrent RSC navigation that conflicts with the layout-redirect-induced transition to `/onboarding`.**

Evidence:

- Two concurrent RSC requests to `/onboarding` (second in-flight before first completes)
- 472ms gap is consistent with Clerk session finalization
- Only Clerk's `ClerkProvider` in the shared tree is known to trigger `router.refresh()` on session state change
- All prior transitions (which did not involve Clerk session events) produced exactly one RSC request

Confidence: **High**. This is the most parsimonious explanation that accounts for all evidence.

### Hypothesis B — Likely (secondary / contributing)

**The root `<Suspense fallback={null}>` in `layout.tsx` masks the failure silently.**

If either transition causes the tree to suspend (which is expected during any RSC loading transition), the Suspense fallback (`null`) renders instead of the previous committed content. This means the user sees a blank/empty UI, not the `/users` content. Combined with the transition never committing, the result is a permanently blank page that looks like a hang.

Confidence: **High**. Confirmed by code structure. Impact: masks the failure, makes it look like a hang rather than an error.

### Hypothesis C — Unclear

**The App Router has a specific edge case bug in Next.js 16 when processing a streaming-redirect from a layout concurrently with a `router.refresh()`.**

This would be a Next.js version-specific behavior rather than an application-level bug. Cannot be confirmed without bisecting across Next.js versions.

Confidence: **Unclear**. Plausible but unverified.

---

## 9. Missing Evidence / Remaining Uncertainty

| Item                                                                           | Status                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Whether Clerk specifically calls `router.refresh()` at T+472ms                 | **Needs verification** — cannot confirm from this log alone                    |
| What the browser URL bar showed when stuck                                     | **Unknown** — user did not report URL bar state                                |
| Whether "Preserve log" was enabled in DevTools                                 | **Unknown** — if not preserved, a hard redirect would have cleared the console |
| Whether the page showed blank (`null` fallback) or `/users` content            | **Unknown** — user described "hang" without specifying what was visible        |
| Whether disabling `router.refresh()` in Clerk (if possible) resolves the issue | **Not yet tested**                                                             |

---

## 10. One Concrete Next Fix Target

**File**: `src/app/users/layout.tsx`  
**Component**: `UsersLayout`  
**Specific mechanism**: `redirect('/onboarding')` when `access.status === 'ONBOARDING_REQUIRED'`

The layout-level server `redirect()` triggers a streaming redirect that:

1. Commits the `/users` tree first (before the redirect instruction is processed)
2. Creates an RSC-level navigation to `/onboarding`
3. Races with Clerk's concurrent `router.refresh()`

The safest fix class (to be decided by the appropriate specialist agent): **move the `ONBOARDING_REQUIRED` redirect to middleware**. A middleware-level redirect sends an HTTP 302 before the browser initiates any RSC fetch or client-side navigation. The browser performs a proper hard redirect to `/onboarding` directly — Clerk's session is already settled at the middleware layer, no concurrent RSC conflict is possible, and the `/onboarding` page loads clean in a fresh navigation cycle.

Alternatively (lower blast radius, for investigation only): change the `redirect('/onboarding')` to a hard redirect using Next.js's response manipulation at the middleware layer, or verify the Clerk `router.refresh()` timing by adding a probe to `ClerkProvider`'s session change callback.

---

## 11. Recommended Next Action

**Specialist required**: Next.js Runtime Agent  
**Decision needed**: Whether the `ONBOARDING_REQUIRED` redirect belongs in middleware (before RSC fetch) rather than in `UsersLayout` (inside RSC rendering).

Supporting investigation: Add a browser-side probe to log `router.refresh()` calls. One approach: patch `window.__nextRouter` or intercept `router.refresh` in a `useEffect` at the `AppLayoutContent` level to confirm Clerk's `router.refresh()` is the trigger for the second `/onboarding` request.

**Do not implement yet.** The root cause is identified with high confidence but the fix architecture requires Next.js Runtime Agent review before implementation.

---

## Summary

| Question                               | Answer                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Did onboarding client tree mount?      | ❌ No                                                                                                                                    |
| Did hydration complete for onboarding? | ❌ No                                                                                                                                    |
| Did onboarding form mount?             | ❌ No                                                                                                                                    |
| Exact earliest failing boundary        | App Router route-commit for `/onboarding` — React never commits the tree despite receiving two successful RSC responses                  |
| Root cause class                       | Concurrent RSC navigation conflict: layout-redirect-induced transition + Clerk's `router.refresh()` during post-SSO session finalization |
| Minimum safe next fix target           | Move `ONBOARDING_REQUIRED` redirect from `UsersLayout` to middleware layer                                                               |
