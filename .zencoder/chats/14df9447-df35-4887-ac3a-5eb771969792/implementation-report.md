# Implementation Report — Route Boundary Fix

**Session**: `14df9447-df35-4887-ac3a-5eb771969792`  
**Date**: 2026-03-18  
**Status**: IMPLEMENTED  
**Change scope**: `src/app/layout.tsx` — root Suspense boundary removal

---

## 1. Objective

Remove the outer `<Suspense fallback={null}>` from `src/app/layout.tsx` that wrapped `ClerkProvider` and `AppLayoutContent` at the root level.

This boundary was identified as the shared client/provider boundary that silently traps the `/users → /onboarding` route-commit conflict. It allowed the concurrent RSC navigation conflict (layout redirect vs Clerk's `router.refresh()`) to produce a `null`-fallback stall with zero surface errors.

---

## 2. Affected Files / Modules

| File                 | Layer                                   | Change type                                 |
| -------------------- | --------------------------------------- | ------------------------------------------- |
| `src/app/layout.tsx` | `src/app` — delivery layer, root layout | Behavior change (Suspense boundary removal) |

**Not touched:**

- `src/app/users/layout.tsx` — redirect logic unchanged
- `src/app/onboarding/layout.tsx` — guard logic unchanged
- `src/proxy.ts` — middleware/proxy unchanged
- All onboarding probes — left in place for verification
- `src/app/components/route-transition-probe.tsx` — unchanged

**Boundary impact:**

- Does NOT touch contracts
- Does NOT touch DI/composition
- Does NOT touch auth/security enforcement (server-side guards unchanged)
- Does NOT change runtime placement of any component
- Does NOT affect public API behavior
- No tests needed to update (no test covers the root layout Suspense structure)

---

## 3. Implementation Plan

1. Remove `import { Suspense } from 'react'` — no longer used in this file
2. Remove `<Suspense fallback={null}>` wrapper from around `ClerkProvider`/`AppLayoutContent` in `RootLayout`
3. Preserve all other layout structure unchanged (ClerkProvider, AppLayoutContent, all children)
4. Run full validation suite

---

## 4. Changes Made

### `src/app/layout.tsx`

**Before:**

```tsx
import { Suspense } from 'react';
// ...
<body className={...}>
  <Suspense fallback={null}>
    {isClerkProvider ? (
      <ClerkProvider ...>
        <AppLayoutContent>{children}</AppLayoutContent>
      </ClerkProvider>
    ) : (
      <AppLayoutContent>{children}</AppLayoutContent>
    )}
  </Suspense>
</body>
```

**After:**

```tsx
// Suspense import removed
// ...
<body className={...}>
  {isClerkProvider ? (
    <ClerkProvider ...>
      <AppLayoutContent>{children}</AppLayoutContent>
    </ClerkProvider>
  ) : (
    <AppLayoutContent>{children}</AppLayoutContent>
  )}
</body>
```

### Why this is safe

1. **ClerkProvider does not suspend.** Clerk's `ClerkProvider` is synchronous — it does not throw promises. It does not require an outer Suspense to function.

2. **Auth UI has its own Suspense.** `HeaderAuthControls` already has `<React.Suspense fallback={<loading skeleton>}>` wrapping its content. The outer root Suspense was redundant for this use case.

3. **App Router manages route children Suspense internally.** Next.js App Router wraps the route `{children}` with its own internal Suspense boundaries for route transitions. The user-added root Suspense was layered _above_ this, creating an unintended catch-all that suppressed transition state signals from reaching the App Router's own management layer.

4. **GlobalErrorHandlers and RouteTransitionProbe do not suspend.** Both use `useEffect`/`useState` with no promise-throwing.

5. **SpeedInsights** renders a script tag equivalent and does not suspend.

### Why the outer Suspense was harmful

The `<Suspense fallback={null}>` at the root level:

- Sat above `ClerkProvider`, `AppLayoutContent`, `RouteTransitionProbe`, and route `{children}`
- When the `/users → /onboarding` transition triggered a concurrent RSC conflict (layout redirect racing with Clerk's `router.refresh()`), any suspension during that conflict was caught here
- With `fallback={null}`, the fallback was invisible — the page appeared blank, with no error, while the transition was stuck
- The probe inside this Suspense boundary could not fire for `/onboarding` because the suspension prevented the new tree from committing

Without this boundary, the App Router's own transition management handles suspensions during navigation directly, without a user-managed catch-all masking the state.

---

## 5. Validation / Verification

| Check                                  | Result                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm typecheck`                       | ✅ PASS                                                                        |
| `pnpm lint`                            | ✅ PASS                                                                        |
| `pnpm arch:lint`                       | ✅ PASS (no circular deps, no boundary violations)                             |
| `pnpm test`                            | ✅ 762/762 tests PASS                                                          |
| Pre-existing `drizzle.test.ts` failure | ⚠️ Pre-existing (missing DATABASE_URL) — unrelated, present before this change |

---

## 6. Manual Probe-Based Verification Instructions

After deploying/running this fix, perform a fresh sign-up via SSO. Use DevTools Console with **"Preserve log" enabled** to capture the full session.

### Expected signal sequence (success)

| Signal                                                   | Where                                        | Indicates                                       |
| -------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `route_probe:pathname_committed pathname: "/users"`      | browser console / `/api/logs` browser-ingest | `/users` committed client-side — same as before |
| `route_probe:cleanup pathname: "/users"`                 | browser console                              | Route transition away from `/users` started     |
| `route_probe:pathname_committed pathname: "/onboarding"` | browser console                              | **NEW — was missing before**                    |
| `[route:/onboarding]`                                    | DOM (bottom-right corner, nearly invisible)  | **NEW — was missing before**                    |
| `onboarding_client:mount`                                | browser console / `/api/logs` browser-ingest | **NEW — was missing before**                    |
| `onboarding_form:mount`                                  | browser console / `/api/logs` browser-ingest | **NEW — was missing before**                    |
| `[onboarding:hydrated]`                                  | DOM (visible on onboarding page)             | **NEW — was missing before**                    |

### If the fix worked

All seven signals above appear. The onboarding form renders. The user can complete onboarding.

### If the transition still hangs

The `/users` cleanup probe and the `/onboarding` commit probe both fail to appear. Escalate to the concurrent RSC navigation conflict (Clerk `router.refresh()` vs layout redirect) — that requires a different fix class: moving the `ONBOARDING_REQUIRED` redirect from `UsersLayout` to `src/proxy.ts` (the middleware layer), so the redirect happens before any RSC fetch begins.

---

## 7. Risks / Follow-ups

| Item                                                                   | Risk                                                                                                                                                                                                                                                       | Mitigation                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Components that previously relied on the root Suspense to hide flicker | Low — all visible components have their own inner Suspense or are synchronous                                                                                                                                                                              | Monitor for any flash-of-unstyled-content on initial load                                                                    |
| The root cause (concurrent RSC navigation) may not be fully resolved   | Medium — the Suspense removal eliminates the silent masking; the underlying concurrent navigation conflict (Clerk `router.refresh()` + layout redirect) may still cause the transition to get stuck, just now with visible failure rather than silent null | If hang persists after this fix, the next target is `src/proxy.ts` — add middleware-level redirect for `ONBOARDING_REQUIRED` |
| No automated test covers root layout Suspense structure                | Accepted — root layout Suspense is not unit-testable in a meaningful way; the probe-based manual verification instructions above are the primary validation path                                                                                           | Consider an E2E test for the full sign-up → onboarding flow                                                                  |

---

## 8. Change Diff Summary

```
src/app/layout.tsx
  - import { Suspense } from 'react';            (removed)
  - <Suspense fallback={null}>                   (removed)
  -   {isClerkProvider ? (...) : (...)}
  - </Suspense>
  + {isClerkProvider ? (...) : (...)}             (direct child of <body>)
```

Net change: **-3 lines** (import + opening Suspense tag + closing Suspense tag). No logic changes. No API changes. No contract changes.
